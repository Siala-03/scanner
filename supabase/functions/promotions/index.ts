import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, err, optionsResponse } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';

const admin = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function uid() { return `promo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/promotions/, '');
  const db = admin();

  try {
    // POST /promotions/validate — public endpoint
    if (req.method === 'POST' && path === '/validate') {
      const { code, restaurantId, orderSubtotal } = await req.json();
      if (!code || !restaurantId) return err('code and restaurantId are required', 400);

      const { data: promo } = await db.from('promotions')
        .select('*').eq('restaurant_id', restaurantId).eq('code', code.toUpperCase()).eq('is_active', true).maybeSingle();

      if (!promo) return err('Invalid or expired promotion code', 404);

      const now = new Date().toISOString();
      if (promo.valid_from > now || promo.valid_until < now) return err('Promotion code is not currently valid', 400);
      if (promo.max_uses !== null && promo.uses_count >= promo.max_uses) return err('Promotion code has reached its usage limit', 400);
      if (orderSubtotal !== undefined && orderSubtotal < promo.min_order_amount) {
        return err(`Minimum order amount of ${promo.min_order_amount} required`, 400);
      }

      const discountAmount = promo.type === 'percentage'
        ? Math.round((orderSubtotal ?? 0) * promo.discount_value / 100)
        : promo.discount_value;

      return cors({
        promotion: {
          id: promo.id, restaurantId: promo.restaurant_id, name: promo.name, code: promo.code,
          type: promo.type, discountValue: promo.discount_value, minOrderAmount: promo.min_order_amount,
          maxUses: promo.max_uses, usesCount: promo.uses_count,
          validFrom: promo.valid_from, validUntil: promo.valid_until,
          isActive: promo.is_active, createdAt: promo.created_at,
        },
        discountAmount,
      });
    }

    // Auth required for all other routes
    const ctx = await authenticate(req);
    const restaurantId = ctx.restaurantId;

    // GET /promotions
    if (req.method === 'GET' && path === '') {
      const { data, error } = await db.from('promotions').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false });
      if (error) return err(error.message);
      return cors((data ?? []).map((p: any) => ({
        id: p.id, restaurantId: p.restaurant_id, name: p.name, code: p.code,
        type: p.type, discountValue: p.discount_value, minOrderAmount: p.min_order_amount,
        maxUses: p.max_uses, usesCount: p.uses_count,
        validFrom: p.valid_from, validUntil: p.valid_until,
        isActive: p.is_active, createdAt: p.created_at,
      })));
    }

    // POST /promotions
    if (req.method === 'POST' && path === '') {
      const body = await req.json();
      const { name, code, type, discountValue, minOrderAmount, maxUses, validFrom, validUntil } = body;
      if (!name || !code || !type || discountValue === undefined || !validFrom || !validUntil) {
        return err('name, code, type, discountValue, validFrom, validUntil are required', 400);
      }
      const { data, error } = await db.from('promotions').insert({
        id: uid(),
        restaurant_id: restaurantId,
        name, code: code.toUpperCase(), type,
        discount_value: discountValue,
        min_order_amount: minOrderAmount ?? 0,
        max_uses: maxUses ?? null,
        uses_count: 0,
        valid_from: validFrom,
        valid_until: validUntil,
        is_active: true,
      }).select('*').single();
      if (error) return err(error.message);
      return cors(data, { status: 201 });
    }

    const idMatch = path.match(/^\/([^/]+)$/);

    // PUT /promotions/:id
    if (req.method === 'PUT' && idMatch) {
      const body = await req.json();
      const update: Record<string, unknown> = {};
      if (body.name !== undefined) update.name = body.name;
      if (body.isActive !== undefined) update.is_active = body.isActive;
      if (body.discountValue !== undefined) update.discount_value = body.discountValue;
      if (body.minOrderAmount !== undefined) update.min_order_amount = body.minOrderAmount;
      if (body.maxUses !== undefined) update.max_uses = body.maxUses;
      if (body.validFrom !== undefined) update.valid_from = body.validFrom;
      if (body.validUntil !== undefined) update.valid_until = body.validUntil;
      const { data, error } = await db.from('promotions').update(update)
        .eq('id', idMatch[1]).eq('restaurant_id', restaurantId).select('*').single();
      if (error) return err(error.message);
      return cors(data);
    }

    // DELETE /promotions/:id
    if (req.method === 'DELETE' && idMatch) {
      await db.from('promotions').delete().eq('id', idMatch[1]).eq('restaurant_id', restaurantId);
      return cors({ message: 'Promotion deleted' });
    }

    return err('Not found', 404);
  } catch (e: any) {
    return err(e.message ?? 'Internal server error', e.status ?? 500);
  }
});
