export interface VubaVubaSyncResult {
  deliveryOrderId: string;
  deliveryStatus: 'pending' | 'assigned' | 'picked_up' | 'delivered' | 'cancelled';
  rawResponse: any;
}

const VUBA_API_URL = process.env.VUBA_API_URL || 'https://api.vubavuba.example.com/v1/orders';
const VUBA_API_KEY = process.env.VUBA_API_KEY || 'demo-vubavuba-key';

async function requestVubaVuba(path: string, method: string, payload: unknown) {
  const url = `${VUBA_API_URL.replace(/\/v1\/orders\/?,?$/, '')}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${VUBA_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`VubaVuba API ${method} ${url} failed: ${response.status} ${response.statusText} ${text}`);
  }

  return response.json();
}

export async function createVubaVubaOrder(order: any): Promise<VubaVubaSyncResult> {
  const payload = {
    partner_order_id: order.id,
    pickup_zone: order.tableNumber ? `table-${order.tableNumber}` : 'delivery',
    customer_name: order.customerName || 'Unknown',
    customer_phone: order.customerPhone || '',
    delivery_address: order.deliveryAddress || '',
    items: order.items.map((item: any) => ({
      item_id: item.menuItemId,
      name: item.menuItemName,
      qty: item.quantity,
      price: item.unitPrice
    })),
    total_amount: order.total,
    notes: order.notes || ''
  };

  const response = await requestVubaVuba('/create', 'POST', payload);

  return {
    deliveryOrderId: response.delivery_order_id || response.id || `${order.id}-vuba`,
    deliveryStatus: response.status || 'assigned',
    rawResponse: response
  };
}

export async function updateVubaVubaOrderStatus(
  deliveryOrderId: string,
  status: 'picked_up' | 'delivered' | 'cancelled'
): Promise<VubaVubaSyncResult> {
  const response = await requestVubaVuba(`/${deliveryOrderId}/status`, 'PUT', { status });

  return {
    deliveryOrderId,
    deliveryStatus: response.status || status,
    rawResponse: response
  };
}
