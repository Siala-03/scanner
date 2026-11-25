// Management consumption ("Mgt" payment method, code 06) is food or drink the
// house consumed rather than sold, so it isn't revenue. Reports show it as its
// own figure. In a split bill only the Mgt portion is excluded.

export const MGT_PAYMENT_CODE = '06';

function paymentBreakdown(order: any): Array<{ method?: string; amount?: number }> {
  const raw = order?.paymentBreakdown ?? order?.payment_breakdown;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

const orderTotal = (order: any): number => Number(order?.total ?? order?.total_price ?? 0) || 0;

/** How much of this order was management consumption. */
export function mgtAmount(order: any): number {
  if (!order || order.status === 'cancelled') return 0;
  const entries = paymentBreakdown(order);
  if (entries.length > 0) {
    return entries
      .filter((e) => String(e.method ?? '').toLowerCase() === 'mgt')
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }
  const type = order.paymentType ?? order.payment_type;
  return type === MGT_PAYMENT_CODE ? orderTotal(order) : 0;
}

/** The part of the order total that counts as revenue (total minus Mgt). */
export function revenueAmount(order: any): number {
  return Math.max(0, orderTotal(order) - mgtAmount(order));
}

/** Fraction of the order that is revenue, for scaling item-level figures. */
export function revenueShare(order: any): number {
  const total = orderTotal(order);
  return total > 0 ? revenueAmount(order) / total : 1;
}
