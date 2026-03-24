import { Order } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '';

export async function printReceiptNetwork(order: Order, waiterName: string) {
  const payload = {
    orderId: order.id,
    tableNumber: order.tableNumber,
    waiterName,
    details: order
  };

  const response = await fetch(`${API_BASE}/api/print/receipt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Unable to send print command: ${response.statusText}`);
  }

  return response.json();
}
