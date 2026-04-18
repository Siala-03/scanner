import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, err, optionsResponse } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';

const admin = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const DEFAULT_CATEGORIES = [
  { name: 'Food & Beverages', color: '#f59e0b', icon: '🍽️' },
  { name: 'Staff & Labor', color: '#3b82f6', icon: '👥' },
  { name: 'Utilities', color: '#10b981', icon: '⚡' },
  { name: 'Rent & Lease', color: '#8b5cf6', icon: '🏢' },
  { name: 'Equipment', color: '#ef4444', icon: '🔧' },
  { name: 'Marketing', color: '#f97316', icon: '📣' },
  { name: 'Cleaning & Supplies', color: '#06b6d4', icon: '🧹' },
  { name: 'Other', color: '#6b7280', icon: '📦' },
];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/expenses/, '');
  const db = admin();

  try {
    const ctx = await authenticate(req);
    const restaurantId = ctx.restaurantId;

    // GET /expenses/categories
    if (req.method === 'GET' && path === '/categories') {
      const { data, error } = await db
        .from('expense_categories')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true)
        .order('name');

      if (error || !data?.length) {
        // Seed defaults
        const rows = DEFAULT_CATEGORIES.map((cat, i) => ({
          id: `cat-${restaurantId}-${cat.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          name: cat.name,
          color: cat.color,
          icon: cat.icon,
          is_active: true,
          restaurant_id: restaurantId,
        }));

        for (let attempt = 0; attempt < 5; attempt++) {
          const { error: upsertErr } = await db
            .from('expense_categories')
            .upsert(rows, { onConflict: 'id' });
          if (!upsertErr) break;
          const col = upsertErr.message.match(/Could not find the '([^']+)' column/i)?.[1];
          if (!col) break;
          rows.forEach(r => { delete (r as any)[col]; });
        }

        const { data: seeded } = await db
          .from('expense_categories')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .order('name');
        return cors(seeded ?? rows);
      }

      return cors(data);
    }

    // POST /expenses/categories
    if (req.method === 'POST' && path === '/categories') {
      const body = await req.json();
      const id = `cat-${restaurantId}-${(body.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
      const { data, error } = await db
        .from('expense_categories')
        .insert({ ...body, id, restaurant_id: restaurantId, is_active: true })
        .select('*').single();
      if (error) return err(error.message);
      return cors(data, { status: 201 });
    }

    return err('Not found', 404);
  } catch (e: any) {
    return err(e.message ?? 'Internal server error', e.status ?? 500);
  }
});
