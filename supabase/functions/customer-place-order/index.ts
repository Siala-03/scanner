import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { restaurantId, qrCodeId, customerName, customerPhone, customerEmail, customerAddress, items, specialInstructions } = body;

  if (!restaurantId || !customerName || !customerPhone || !Array.isArray(items) || items.length === 0) {
    return new Response(JSON.stringify({ error: 'restaurantId, customerName, customerPhone, and items are required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Validate the QR code belongs to this restaurant
  if (qrCodeId) {
    const { data: qr } = await db
      .from('online_qr_codes')
      .select('restaurant_id, is_active')
      .eq('id', qrCodeId)
      .single();

    if (!qr || !qr.is_active || qr.restaurant_id !== restaurantId) {
      return new Response(JSON.stringify({ error: 'Invalid or inactive QR code' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // Validate items against the real menu and recalculate prices server-side
  const menuItemIds = items.map((i: any) => i.menuItemId).filter(Boolean);
  const { data: menuItems } = await db
    .from('menu_items')
    .select('id, price, name, is_available')
    .eq('restaurant_id', restaurantId)
    .in('id', menuItemIds);

  const menuMap = new Map((menuItems || []).map((m: any) => [m.id, m]));

  const validatedItems = [];
  for (const item of items) {
    const menuItem = menuMap.get(item.menuItemId);
    if (!menuItem || !menuItem.is_available) {
      return new Response(JSON.stringify({ error: `Item "${item.menuItemName || item.menuItemId}" is unavailable` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
    validatedItems.push({
      menuItemId: menuItem.id,
      menuItemName: menuItem.name,
      quantity: qty,
      unitPrice: menuItem.price,
      totalPrice: menuItem.price * qty,
    });
  }

  const subtotal = validatedItems.reduce((s, i) => s + i.totalPrice, 0);
  const tax = Math.round(subtotal * 0.1);
  const total = subtotal + tax;

  const id = crypto.randomUUID();
  const orderNumber = `ONLINE-${Date.now().toString().slice(-8)}`;

  const { data, error } = await db
    .from('orders')
    .insert([{
      id,
      order_number: orderNumber,
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_email: customerEmail || null,
      customer_address: customerAddress || null,
      items: validatedItems,
      status: 'pending',
      subtotal,
      tax,
      total,
      is_online_order: true,
      online_qr_code_id: qrCodeId || null,
      notes: specialInstructions || null,
      restaurant_id: restaurantId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }])
    .select()
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(data), {
    status: 201,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
