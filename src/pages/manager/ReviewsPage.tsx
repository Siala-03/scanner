import React, { useEffect, useState } from 'react';
import { StarIcon, MessageSquareIcon, TrashIcon, UtensilsIcon } from 'lucide-react';
import { Review, MenuItemReview } from '../../types';
import { getReviews, getReviewStats, ReviewStats, getMenuItemReviews, deleteMenuItemReview } from '../../api/reviews';

function getRestaurantId() { return localStorage.getItem('restaurantId') || ''; }

function Stars({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'w-5 h-5' : 'w-3.5 h-3.5';
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((v) => (
        <StarIcon key={v} className={`${cls} ${v <= rating ? 'text-amber-400 fill-amber-400' : 'text-slate-600'}`} />
      ))}
    </div>
  );
}

export function ReviewsPage() {
  const [activeTab, setActiveTab] = useState<'service' | 'menu-items'>('service');

  // Service reviews
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<number | null>(null);

  // Menu item reviews
  const [menuItemReviews, setMenuItemReviews] = useState<MenuItemReview[]>([]);
  const [menuItemLoading, setMenuItemLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadServiceReviews(rating?: number) {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([
        getReviews(getRestaurantId(), { rating }),
        getReviewStats(getRestaurantId()),
      ]);
      setReviews(r);
      setStats(s);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function loadMenuItemReviews() {
    setMenuItemLoading(true);
    try {
      const r = await getMenuItemReviews(getRestaurantId(), undefined, 200);
      setMenuItemReviews(r);
    } catch (e) { console.error(e); }
    finally { setMenuItemLoading(false); }
  }

  useEffect(() => { loadServiceReviews(filter ?? undefined); }, [filter]);

  useEffect(() => {
    if (activeTab === 'menu-items') loadMenuItemReviews();
  }, [activeTab]);

  const handleDeleteMenuItemReview = async (id: string) => {
    if (!window.confirm('Delete this menu item review?')) return;
    setDeletingId(id);
    try {
      await deleteMenuItemReview(id);
      setMenuItemReviews((prev) => prev.filter((r) => r.id !== id));
    } catch (e) { console.error(e); }
    finally { setDeletingId(null); }
  };

  const pct = (count: number) => stats && stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-amber-500/20 rounded-xl">
          <StarIcon className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-100">Customer Reviews</h1>
          <p className="text-xs text-slate-400">Feedback from your guests</p>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('service')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
            activeTab === 'service' ? 'bg-amber-500 text-black' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          <MessageSquareIcon className="w-4 h-4" />
          Service Reviews
        </button>
        <button
          onClick={() => setActiveTab('menu-items')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
            activeTab === 'menu-items' ? 'bg-amber-500 text-black' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          <UtensilsIcon className="w-4 h-4" />
          Menu Item Reviews
        </button>
      </div>

      {/* ── Service reviews tab ── */}
      {activeTab === 'service' && (
        <>
          {stats && (
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-6">
                <div className="text-center sm:border-r sm:border-slate-700 sm:pr-6 flex-shrink-0">
                  <p className="text-5xl font-bold text-amber-400">{stats.avgRating ?? '—'}</p>
                  <Stars rating={Math.round(stats.avgRating ?? 0)} size="md" />
                  <p className="text-xs text-slate-400 mt-1">{stats.total} reviews</p>
                </div>
                <div className="flex-1 space-y-2">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const entry = stats.distribution.find((d) => d.rating === star);
                    const count = entry?.count ?? 0;
                    const p = pct(count);
                    return (
                      <div key={star} className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400 w-4 text-right">{star}</span>
                        <StarIcon className="w-3 h-3 text-amber-400 fill-amber-400 flex-shrink-0" />
                        <div className="flex-1 h-2 rounded-full bg-slate-700 overflow-hidden">
                          <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${p}%` }} />
                        </div>
                        <span className="text-slate-400 w-8">{p}%</span>
                        <span className="text-slate-500 w-4">{count}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="text-center sm:border-l sm:border-slate-700 sm:pl-6 flex-shrink-0">
                  <p className="text-2xl font-bold text-slate-100">{stats.thisMonth}</p>
                  <p className="text-xs text-slate-400">this month</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
            {[null, 5, 4, 3, 2, 1].map((star) => (
              <button
                key={star ?? 'all'}
                onClick={() => setFilter(star)}
                className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filter === star ? 'bg-amber-500 text-black' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {star === null ? 'All' : <><StarIcon className="w-3.5 h-3.5 fill-current" />{star}</>}
              </button>
            ))}
          </div>

          {loading && <div className="text-slate-400 text-sm py-8 text-center">Loading...</div>}

          {!loading && reviews.length === 0 && (
            <div className="text-center py-16 text-slate-500">
              <MessageSquareIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-semibold text-slate-400">No service reviews yet</p>
              <p className="text-sm">Reviews submitted by customers will appear here.</p>
            </div>
          )}

          <div className="space-y-3">
            {reviews.map((r) => (
              <div key={r.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Stars rating={r.rating} />
                    {r.tableNumber && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">Table {r.tableNumber}</span>}
                    {r.waiterName && <span className="text-xs text-slate-400">· {r.waiterName}</span>}
                    {r.customerName && <span className="text-xs text-slate-500">· {r.customerName}</span>}
                  </div>
                  <time className="text-xs text-slate-500 flex-shrink-0">
                    {r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                  </time>
                </div>
                {r.comment && <p className="text-sm text-slate-300 italic">"{r.comment}"</p>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Menu item reviews tab ── */}
      {activeTab === 'menu-items' && (
        <>
          {menuItemLoading && <div className="text-slate-400 text-sm py-8 text-center">Loading...</div>}

          {!menuItemLoading && menuItemReviews.length === 0 && (
            <div className="text-center py-16 text-slate-500">
              <UtensilsIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-semibold text-slate-400">No menu item reviews yet</p>
              <p className="text-sm">Ratings left on menu items will appear here.</p>
            </div>
          )}

          <div className="space-y-3">
            {menuItemReviews.map((r) => (
              <div key={r.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Stars rating={r.rating} />
                      {r.customerName && <span className="text-xs text-slate-500">· {r.customerName}</span>}
                      <time className="text-xs text-slate-500">
                        {r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </time>
                    </div>
                    {r.comment && <p className="text-sm text-slate-300 italic">"{r.comment}"</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteMenuItemReview(r.id)}
                    disabled={deletingId === r.id}
                    className="flex-shrink-0 p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                    title="Delete review"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
