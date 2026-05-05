import React, { useEffect, useMemo, useState } from 'react';
import {
  SearchIcon,
  SparklesIcon,
  XIcon,
  MinusIcon,
  PlusIcon,
  ClockIcon,
  RefreshCwIcon,
  StarIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from 'lucide-react';
import { MenuItem, MenuItemReview, MenuItemRatingSummary, SelectedModifier } from '../../types';
import { useMenu } from '../../hooks/useMenu';
import { MenuItemCard } from '../../components/customer/MenuItemCard';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { formatPrice } from '../../utils/currency';
import { getEffectivePrice } from '../../utils/pricing';
import { getMenuItemReviews, getMenuItemRatingStats, submitMenuItemReview } from '../../api/reviews';
import { hasReviewedMenuItem, markMenuItemReviewed } from '../../utils/menuItemReviewsStorage';

interface MenuPageProps {
  onAddToCart: (item: MenuItem, quantity: number, selectedModifiers?: SelectedModifier[], adjustedUnitPrice?: number) => void;
}

const categoryNames: Record<string, string> = {
  'all': 'All',
  'alcoholic-drinks': '🍸 Alcoholic',
  'beers': '🍺 Beers',
  'wine': '🍷 Wine',
  'soft-drinks': '🥤 Drinks',
  'breakfast': '🍳 Breakfast',
  'lunch': '🥗 Lunch',
  'dinner': '🍽️ Dinner',
  'desserts': '🍰 Desserts',
  'snacks': '🥨 Snacks'
};

export function MenuPage({ onAddToCart }: MenuPageProps) {
  const { menuItems, categories, isLoading, error, refresh: refetch } = useMenu();
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  // groupId → Set of selected itemIds
  const [selectedModifierIds, setSelectedModifierIds] = useState<Record<string, Set<string>>>({});

  // Ratings map: menuItemId → { avg, count }
  const [itemRatings, setItemRatings] = useState<Record<string, MenuItemRatingSummary>>({});
  // Reviews for the open item detail modal
  const [itemReviews, setItemReviews] = useState<MenuItemReview[]>([]);
  const [reviewsExpanded, setReviewsExpanded] = useState(false);
  // Review submission state
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewName, setReviewName] = useState('');
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);

  // Load rating summaries for all menu items whenever the menu loads
  useEffect(() => {
    if (!menuItems.length) return;
    const restaurantId = localStorage.getItem('restaurantId');
    if (!restaurantId) return;
    getMenuItemRatingStats(restaurantId, menuItems.map((i) => i.id))
      .then((stats) => {
        const map: Record<string, MenuItemRatingSummary> = {};
        stats.forEach((s) => { map[s.menuItemId] = s; });
        setItemRatings(map);
      })
      .catch(() => {});
  }, [menuItems]);

  // Load reviews and check duplicate when item detail modal opens
  useEffect(() => {
    if (!selectedItem) {
      setItemReviews([]);
      setReviewsExpanded(false);
      setShowReviewForm(false);
      setReviewSubmitted(false);
      setReviewRating(5);
      setReviewComment('');
      setReviewName('');
      return;
    }
    setAlreadyReviewed(hasReviewedMenuItem(selectedItem.id));
    const restaurantId = localStorage.getItem('restaurantId');
    if (!restaurantId) return;
    getMenuItemReviews(restaurantId, selectedItem.id, 5)
      .then(setItemReviews)
      .catch(() => {});
  }, [selectedItem]);

  const normalizeCategory = (value: string) => value.trim().toLowerCase();

  // Get popular items from the fetched menu
  const popularItems = useMemo(() => 
    menuItems.filter((item) => item.isPopular && item.isAvailable).slice(0, 6),
    [menuItems]
  );

  const filteredItems = useMemo(() => {
    let items =
    activeCategory === 'all' ?
    menuItems :
    menuItems.filter((item) => normalizeCategory(item.category) === normalizeCategory(activeCategory));
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(
        (item) =>
        item.name.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query)
      );
    }
    return items;
  }, [activeCategory, searchQuery, menuItems]);

  const handleSubmitReview = async () => {
    if (!selectedItem || reviewSubmitting) return;
    const restaurantId = localStorage.getItem('restaurantId');
    if (!restaurantId) return;
    setReviewSubmitting(true);
    try {
      const review = await submitMenuItemReview({
        restaurantId,
        menuItemId: selectedItem.id,
        rating: reviewRating,
        comment: reviewComment.trim() || undefined,
        customerName: reviewName.trim() || undefined,
      });
      markMenuItemReviewed(selectedItem.id, review.id);
      setReviewSubmitted(true);
      setAlreadyReviewed(true);
      setShowReviewForm(false);
      // Update local reviews list and rating
      setItemReviews((prev) => [review, ...prev]);
      setItemRatings((prev) => {
        const existing = prev[selectedItem.id];
        const newCount = (existing?.totalCount ?? 0) + 1;
        const newAvg = existing?.avgRating != null
          ? (existing.avgRating * (newCount - 1) + reviewRating) / newCount
          : reviewRating;
        return {
          ...prev,
          [selectedItem.id]: { menuItemId: selectedItem.id, avgRating: Math.round(newAvg * 10) / 10, totalCount: newCount },
        };
      });
    } catch {
      // silently fail — backend may be unavailable
      markMenuItemReviewed(selectedItem.id, `local-${Date.now()}`);
      setReviewSubmitted(true);
      setAlreadyReviewed(true);
      setShowReviewForm(false);
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleAddToCart = (item: MenuItem) => {
    onAddToCart(item, 1);
  };

  const handleViewDetails = (item: MenuItem) => {
    setSelectedItem(item);
    setQuantity(1);
    setSelectedModifierIds({});
  };

  function toggleModifierOption(groupId: string, itemId: string, maxSelections: number) {
    setSelectedModifierIds(prev => {
      const current = new Set(prev[groupId] || []);
      if (current.has(itemId)) {
        current.delete(itemId);
      } else {
        if (current.size >= maxSelections) {
          // Replace first selection when max=1 (radio behaviour)
          if (maxSelections === 1) current.clear();
          else return prev; // already at max
        }
        current.add(itemId);
      }
      return { ...prev, [groupId]: current };
    });
  }

  const modifierAdjustment = useMemo(() => {
    if (!selectedItem?.modifiers) return 0;
    return selectedItem.modifiers.reduce((total, group) => {
      const selected = selectedModifierIds[group.id] || new Set();
      return total + group.items
        .filter(opt => selected.has(opt.id))
        .reduce((s, opt) => s + opt.priceAdjustment, 0);
    }, 0);
  }, [selectedItem, selectedModifierIds]);

  const requiredGroupsMet = useMemo(() => {
    if (!selectedItem?.modifiers) return true;
    return selectedItem.modifiers
      .filter(g => g.required)
      .every(g => (selectedModifierIds[g.id]?.size || 0) > 0);
  }, [selectedItem, selectedModifierIds]);

  const handleAddFromModal = () => {
    if (selectedItem) {
      const flatModifiers: SelectedModifier[] = [];
      if (selectedItem.modifiers) {
        for (const group of selectedItem.modifiers) {
          const selected = selectedModifierIds[group.id] || new Set();
          for (const opt of group.items) {
            if (selected.has(opt.id)) {
              flatModifiers.push({
                groupId: group.id,
                groupName: group.name,
                itemId: opt.id,
                itemName: opt.name,
                priceAdjustment: opt.priceAdjustment,
              });
            }
          }
        }
      }
      const basePrice = getEffectivePrice(selectedItem);
      const adjustedUnitPrice = basePrice + modifierAdjustment;
      onAddToCart(selectedItem, quantity, flatModifiers.length ? flatModifiers : undefined, adjustedUnitPrice !== basePrice ? adjustedUnitPrice : undefined);
      setSelectedItem(null);
      setQuantity(1);
      setSelectedModifierIds({});
    }
  };

  // Build categories from fetched menu
  const menuCategories = categories.map(cat => ({
    id: cat,
    name: categoryNames[cat] || cat.charAt(0).toUpperCase() + cat.slice(1)
  }));

  const categoryTabs = [
    { id: 'all', name: 'All' },
    ...menuCategories
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900 pb-24">
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200/50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-[0.25em] text-amber-600 font-semibold">Fine Dining Experience</p>
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">Order from your table</h1>
              <p className="text-slate-500 mt-1 text-sm">Exquisite dishes, crafted for your pleasure</p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <button
                onClick={refetch}
                className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-white text-xs font-semibold hover:from-amber-600 hover:to-amber-700 shadow-md hover:shadow-lg transition-all duration-200 touch-manipulation"
              >
                <RefreshCwIcon className="w-4 h-4" />
                <span className="hidden xs:inline">Refresh</span>
              </button>
              {error && (
                <div className="text-red-500 text-xs font-medium max-w-32 sm:max-w-none truncate">{error}</div>
              )}
            </div>
          </div>

          <div className="mt-4 sm:mt-5 relative">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search our menu..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 sm:py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all duration-200 text-base"
            />
          </div>

          <div className="mt-4 sm:mt-5">
            <div className="flex flex-wrap gap-2 sm:gap-2.5 overflow-x-auto pb-2 scrollbar-hide">
              {categoryTabs.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setActiveCategory(category.id)}
                  className={`h-9 sm:h-10 px-3 sm:px-4 rounded-full text-sm font-medium transition-all duration-200 whitespace-nowrap touch-manipulation min-w-0 flex-shrink-0 ${
                    activeCategory === category.id
                      ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md shadow-amber-500/25'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-transparent hover:border-slate-300'
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-700"></div>
        </div>
      )}

      {!isLoading && activeCategory === 'all' && searchQuery === '' && popularItems.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="flex items-center gap-3 mb-4 sm:mb-6">
            <div className="p-2 bg-gradient-to-br from-amber-400 to-amber-600 rounded-xl shadow-lg">
              <SparklesIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Chef's Selection</h2>
              <p className="text-xs text-slate-500">Most loved by our guests</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-5">
            {popularItems.map((item) => (
              <MenuItemCard
                key={item.id}
                item={item}
                onAddToCart={handleAddToCart}
                onViewDetails={handleViewDetails}
                avgRating={itemRatings[item.id]?.avgRating}
                reviewCount={itemRatings[item.id]?.totalCount}
              />
            ))}
          </div>
        </div>
      )}

      {/* All Items */}
      {!isLoading && (
        <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-4 sm:mb-5">
              <div className="flex items-center gap-3">
                <div className="h-8 w-1 bg-gradient-to-b from-amber-500 to-amber-600 rounded-full"></div>
                <h2 className="text-lg font-bold text-slate-900">
                  {activeCategory === 'all' ? 'Our Menu' : categoryNames[activeCategory] || activeCategory}
                </h2>
              </div>
              <span className="text-sm text-slate-400 font-medium">{filteredItems.length} items</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-5">
              {filteredItems.map((item) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  onAddToCart={handleAddToCart}
                  onViewDetails={handleViewDetails}
                  avgRating={itemRatings[item.id]?.avgRating}
                  reviewCount={itemRatings[item.id]?.totalCount}
                />
              ))}
            </div>
            
            {filteredItems.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                <p className="text-lg font-semibold text-slate-700">No items found</p>
                <p className="text-sm">Try another category or clear your search.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Item Detail Modal */}
      <Modal isOpen={!!selectedItem} onClose={() => setSelectedItem(null)} variant="light">
        {selectedItem && (
          <div className="p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4 sm:mb-5">
              <div className="flex-1 min-w-0">
                <span className="text-4xl sm:text-5xl mb-3 block">{selectedItem.emoji}</span>
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 pr-8">{selectedItem.name}</h3>
                <p className="text-slate-500 text-sm mt-2 leading-relaxed">{selectedItem.description}</p>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="p-2 sm:p-2.5 rounded-full hover:bg-slate-100 transition-colors flex-shrink-0 touch-manipulation"
              >
                <XIcon className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="flex items-center justify-between mb-4 sm:mb-5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-amber-100 rounded-lg">
                  <ClockIcon className="w-4 h-4 text-amber-600" />
                </div>
                <span className="text-sm text-slate-600">{selectedItem.prepTime} min prep</span>
              </div>
              {itemRatings[selectedItem.id]?.avgRating != null && (
                <div className="flex items-center gap-1 text-sm font-semibold text-amber-600">
                  {[1,2,3,4,5].map((s) => (
                    <StarIcon
                      key={s}
                      className={`w-4 h-4 ${s <= Math.round(itemRatings[selectedItem.id].avgRating!) ? 'fill-amber-500 text-amber-500' : 'text-slate-200'}`}
                    />
                  ))}
                  <span className="ml-1 text-slate-700">{itemRatings[selectedItem.id].avgRating!.toFixed(1)}</span>
                  <span className="text-slate-400 text-xs font-normal">({itemRatings[selectedItem.id].totalCount})</span>
                </div>
              )}
            </div>

            {/* Modifier Groups */}
            {selectedItem.modifiers && selectedItem.modifiers.length > 0 && (
              <div className="mb-4 space-y-4">
                {selectedItem.modifiers.map(group => (
                  <div key={group.id}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-semibold text-slate-800">{group.name}</span>
                      {group.required && (
                        <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full">Required</span>
                      )}
                      <span className="text-xs text-slate-400 ml-auto">
                        {group.maxSelections > 1 ? `Pick up to ${group.maxSelections}` : 'Pick one'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {group.items.map(opt => {
                        const selected = (selectedModifierIds[group.id] || new Set()).has(opt.id);
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => toggleModifierOption(group.id, opt.id, group.maxSelections)}
                            className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-all ${
                              selected
                                ? 'bg-amber-50 border-amber-400 text-amber-800'
                                : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
                            }`}
                          >
                            <span>{opt.name}</span>
                            {opt.priceAdjustment !== 0 && (
                              <span className={`text-xs font-medium ${opt.priceAdjustment > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                                {opt.priceAdjustment > 0 ? '+' : ''}{formatPrice(opt.priceAdjustment)}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-0 mb-4 sm:mb-6 pt-4 border-t border-slate-100">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Price</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-amber-600">
                    {formatPrice(getEffectivePrice(selectedItem) + modifierAdjustment)}
                  </span>
                  {modifierAdjustment !== 0 && (
                    <span className="text-sm text-slate-400 line-through">{formatPrice(getEffectivePrice(selectedItem))}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-center sm:justify-end gap-3">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="p-3 sm:p-2.5 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors touch-manipulation"
                >
                  <MinusIcon className="w-5 h-5 text-slate-600" />
                </button>
                <span className="text-lg font-semibold w-12 sm:w-8 text-center text-slate-900">{quantity}</span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="p-3 sm:p-2.5 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors touch-manipulation"
                >
                  <PlusIcon className="w-5 h-5 text-slate-600" />
                </button>
              </div>
            </div>

            {/* ── Reviews section ── */}
            <div className="border-t border-slate-100 pt-4 mt-2 mb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-slate-800">
                  Customer Reviews
                  {itemReviews.length > 0 && (
                    <span className="ml-1 text-slate-400 font-normal">({itemReviews.length})</span>
                  )}
                </span>
                {itemReviews.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setReviewsExpanded((v) => !v)}
                    className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium"
                  >
                    {reviewsExpanded ? (
                      <><ChevronUpIcon className="w-3.5 h-3.5" />Hide</>
                    ) : (
                      <><ChevronDownIcon className="w-3.5 h-3.5" />Show all</>
                    )}
                  </button>
                )}
              </div>

              {itemReviews.length === 0 && (
                <p className="text-xs text-slate-400 mb-3">No reviews yet. Be the first!</p>
              )}

              {itemReviews.length > 0 && (
                <div className="space-y-3 mb-3">
                  {(reviewsExpanded ? itemReviews : itemReviews.slice(0, 2)).map((review) => (
                    <div key={review.id} className="bg-slate-50 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1">
                          {[1,2,3,4,5].map((s) => (
                            <StarIcon
                              key={s}
                              className={`w-3 h-3 ${s <= review.rating ? 'fill-amber-500 text-amber-500' : 'text-slate-300'}`}
                            />
                          ))}
                        </div>
                        <span className="text-xs text-slate-400">
                          {new Date(review.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {review.customerName && (
                        <p className="text-xs font-medium text-slate-600 mb-1">{review.customerName}</p>
                      )}
                      {review.comment && (
                        <p className="text-sm text-slate-700 leading-relaxed">{review.comment}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Review form / prompt */}
              {reviewSubmitted ? (
                <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 rounded-xl p-3">
                  <StarIcon className="w-4 h-4 fill-green-500 text-green-500 flex-shrink-0" />
                  Thanks for your review!
                </div>
              ) : alreadyReviewed ? (
                <p className="text-xs text-slate-400 italic">You've already reviewed this dish.</p>
              ) : showReviewForm ? (
                <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-semibold text-slate-800">Rate this dish</p>
                  <div className="flex gap-2">
                    {[1,2,3,4,5].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setReviewRating(v)}
                        className="p-1 transition-transform active:scale-95"
                        aria-label={`${v} stars`}
                      >
                        <StarIcon
                          className={`w-7 h-7 transition-colors ${v <= reviewRating ? 'fill-amber-500 text-amber-500' : 'text-slate-300 hover:text-amber-300'}`}
                        />
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={reviewName}
                    onChange={(e) => setReviewName(e.target.value)}
                    placeholder="Your name (optional)"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
                  />
                  <textarea
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    rows={3}
                    placeholder="Share your thoughts... (optional)"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowReviewForm(false)}
                      className="flex-1 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmitReview}
                      disabled={reviewSubmitting}
                      className="flex-1 py-2 text-sm rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold hover:from-amber-600 hover:to-amber-700 transition-all disabled:opacity-60"
                    >
                      {reviewSubmitting ? 'Submitting…' : 'Submit Review'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowReviewForm(true)}
                  className="w-full py-2.5 text-sm rounded-xl border border-amber-200 text-amber-700 font-medium hover:bg-amber-50 transition-colors flex items-center justify-center gap-2"
                >
                  <StarIcon className="w-4 h-4 text-amber-500" />
                  Write a Review
                </button>
              )}
            </div>

            <Button
              onClick={handleAddFromModal}
              className="w-full touch-manipulation"
              size="lg"
              disabled={!requiredGroupsMet}
            >
              {!requiredGroupsMet ? 'Select required options' : `Add to Cart — ${formatPrice((getEffectivePrice(selectedItem) + modifierAdjustment) * quantity)}`}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
