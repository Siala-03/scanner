import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, err, optionsResponse } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';

const admin = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  const url = new URL(req.url);
  const path = url.pathname
    .replace(/^\/functions\/v1\/loyalty/, '')
    .replace(/^\/loyalty/, '');
  const db = admin();

  try {
    // POST /loyalty/customers — public, no staff auth (customer portal)
    if (req.method === 'POST' && path === '/customers') {
      const { phone, email, name, restaurantId } = await req.json();
      if (!restaurantId) return err('restaurantId is required', 400);
      if (!phone && !email) return err('phone or email is required', 400);

      // Try to find existing customer by phone or email
      let existing: any = null;
      if (phone) {
        const { data } = await db
          .from('customers')
          .select('*')
          .eq('phone', phone.trim())
          .eq('restaurant_id', restaurantId)
          .maybeSingle();
        existing = data;
      }
      if (!existing && email) {
        const { data } = await db
          .from('customers')
          .select('*')
          .eq('email', email.trim())
          .eq('restaurant_id', restaurantId)
          .maybeSingle();
        existing = data;
      }

      if (existing) {
        // Update name/email if newly provided
        const updates: Record<string, unknown> = {};
        if (name && name.trim() && name.trim() !== existing.name) updates.name = name.trim();
        if (email && email.trim() && email.trim() !== existing.email) updates.email = email.trim();
        if (Object.keys(updates).length > 0) {
          await db.from('customers').update(updates).eq('id', existing.id);
          Object.assign(existing, updates);
        }
        return cors(existing);
      }

      // Create new customer
      const id = `cust-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const { data, error } = await db
        .from('customers')
        .insert({
          id,
          phone: phone?.trim() || null,
          email: email?.trim() || null,
          name: name?.trim() || null,
          restaurant_id: restaurantId,
          total_points: 0,
          visit_count: 0,
          join_date: new Date().toISOString(),
        })
        .select('*')
        .single();

      if (error) return err(error.message, 400);
      return cors(data, { status: 201 });
    }

    // All routes below require staff authentication
    const ctx = await authenticate(req);
    const restaurantId = ctx.restaurantId;

    // GET /loyalty/customers — manager view
    if (req.method === 'GET' && path === '/customers') {
      const { data, error } = await db
        .from('customers')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('last_visit', { ascending: false, nullsFirst: false });
      if (error) return err(error.message);
      return cors(data ?? []);
    }

    // POST /loyalty/points/earn
    if (req.method === 'POST' && path === '/points/earn') {
      const { customerId, orderId, points, description } = await req.json();
      if (!customerId || !points) return err('customerId and points are required', 400);

      const txId = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      await db.from('loyalty_transactions').insert({
        id: txId,
        customer_id: customerId,
        order_id: orderId ?? null,
        restaurant_id: restaurantId,
        transaction_type: 'earn',
        points,
        description: description || 'Points earned',
      });

      const { data: customer } = await db
        .from('customers')
        .select('total_points, visit_count')
        .eq('id', customerId)
        .single();

      await db.from('customers').update({
        total_points: (customer?.total_points ?? 0) + points,
        visit_count: (customer?.visit_count ?? 0) + 1,
        last_visit: new Date().toISOString(),
      }).eq('id', customerId);

      return cors({ success: true, transactionId: txId });
    }

    // POST /loyalty/rewards/redeem
    if (req.method === 'POST' && path === '/rewards/redeem') {
      const { customerId, rewardId, orderId } = await req.json();
      if (!customerId || !rewardId) return err('customerId and rewardId are required', 400);

      const { data: reward } = await db
        .from('rewards')
        .select('*')
        .eq('id', rewardId)
        .eq('is_active', true)
        .single();
      if (!reward) return err('Reward not found', 404);

      const { data: customer } = await db
        .from('customers')
        .select('total_points, total_spent')
        .eq('id', customerId)
        .single();
      if (!customer) return err('Customer not found', 404);

      if (customer.total_points < reward.points_required) {
        return err('Insufficient points', 400);
      }

      const redemptionId = `red-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      await db.from('reward_redemptions').insert({
        id: redemptionId,
        customer_id: customerId,
        reward_id: rewardId,
        order_id: orderId ?? null,
        restaurant_id: restaurantId,
        points_used: reward.points_required,
      });

      const txId = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      await db.from('loyalty_transactions').insert({
        id: txId,
        customer_id: customerId,
        restaurant_id: restaurantId,
        transaction_type: 'redeem',
        points: -reward.points_required,
        description: `Redeemed: ${reward.name}`,
      });

      const newPoints = customer.total_points - reward.points_required;
      await db.from('customers').update({ total_points: newPoints }).eq('id', customerId);

      return cors({ success: true, redemptionId, reward, remainingPoints: newPoints });
    }

    // POST /loyalty/rewards (create)
    if (req.method === 'POST' && path === '/rewards') {
      const body = await req.json();
      const id = `reward-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const { data, error } = await db
        .from('rewards')
        .insert({
          id,
          name: body.name,
          description: body.description,
          points_required: body.pointsRequired,
          reward_type: body.rewardType,
          discount_percentage: body.discountPercentage ?? null,
          free_item_id: body.freeItemId ?? null,
          is_active: true,
          restaurant_id: restaurantId,
        })
        .select('*').single();
      if (error) return err(error.message);
      return cors(data, { status: 201 });
    }

    return err('Not found', 404);
  } catch (e: any) {
    return err(e.message ?? 'Internal server error', e.status ?? 500);
  }
});
