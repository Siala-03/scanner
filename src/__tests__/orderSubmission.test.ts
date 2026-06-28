import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock Supabase ──────────────────────────────────────────────────────────
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockNeq = vi.fn();
const mockOr = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();
const mockSingle = vi.fn();
const mockMaybeSingle = vi.fn();
const mockIn = vi.fn();
const mockGte = vi.fn();

function buildChain(terminal?: Record<string, unknown>) {
  const chain: any = {};
  const methods = [mockSelect, mockEq, mockNeq, mockOr, mockOrder, mockLimit, mockIn, mockGte];
  for (const m of methods) {
    m.mockReturnValue(chain);
  }
  chain.select = mockSelect;
  chain.eq = mockEq;
  chain.neq = mockNeq;
  chain.or = mockOr;
  chain.order = mockOrder;
  chain.limit = mockLimit;
  chain.in = mockIn;
  chain.gte = mockGte;
  chain.single = mockSingle;
  chain.maybeSingle = mockMaybeSingle;
  chain.then = undefined; // prevent Promise.race from treating it as thenable
  return chain;
}

const mockFrom = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: { from: (...args: any[]) => mockFrom(...args) },
}));

vi.mock('./inventory', () => ({
  decrementInventoryForOrder: vi.fn().mockResolvedValue(undefined),
  restoreInventoryForOrder: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./restaurants', () => ({
  fetchIpRestriction: vi.fn().mockResolvedValue({ enabled: false, allowedIps: [] }),
}));

vi.mock('../utils/ipRestriction', () => ({
  getClientPublicIp: vi.fn().mockResolvedValue('1.2.3.4'),
  getCachedIpRestrictionSettings: vi.fn().mockReturnValue({ enabled: false, allowedIps: [] }),
  cacheIpRestrictionSettings: vi.fn(),
}));

// ── Helpers ────────────────────────────────────────────────────────────────

const TEST_ORDER_INPUT = {
  tableNumber: 5,
  items: [{ menuItemId: 'item-1', menuItemName: 'Burger', quantity: 2, unitPrice: 1500 }],
  notes: 'No onions',
};

const FAKE_DB_ORDER = {
  id: 'order-123',
  order_number: 'ABC1234',
  table_number: 5,
  status: 'pending',
  payment_status: 'unpaid',
  items: [{ id: 'i-1', menu_item_id: 'item-1', menu_item_name: 'Burger', quantity: 2, unit_price: 1500, total_price: 3000, status: 'pending' }],
  total: 3000,
  restaurant_id: 'rest-1',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function setupLocalStorage() {
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => {
      const store: Record<string, string> = { restaurantId: 'rest-1', staffId: 'staff-1', staffRole: 'waiter' };
      return store[key] ?? null;
    }),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('createOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupLocalStorage();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('creates an order successfully on first attempt', async () => {
    const chain = buildChain();
    mockFrom.mockReturnValue({ insert: () => chain, select: () => chain });
    mockSingle.mockResolvedValue({ data: FAKE_DB_ORDER, error: null });

    const { createOrder } = await import('../api/orders');
    const result = await createOrder(TEST_ORDER_INPUT);

    expect(result).toBeTruthy();
    expect(result.id).toBe('order-123');
  });

  it('fails fast on RLS/permission error instead of retrying', async () => {
    const chain = buildChain();
    mockFrom.mockReturnValue({ insert: () => chain, select: () => chain });
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: 'new row violates row-level security policy', code: '42501' },
    });

    const { createOrder } = await import('../api/orders');
    const start = Date.now();

    await expect(createOrder(TEST_ORDER_INPUT)).rejects.toThrow();

    const elapsed = Date.now() - start;
    // Should fail in under 2 seconds, not 90 seconds
    expect(elapsed).toBeLessThan(2000);
  });

  it('handles duplicate order via idempotency key (23505)', async () => {
    const chain = buildChain();
    mockFrom.mockReturnValue({ insert: () => chain, select: () => chain });

    // First call: duplicate error
    mockSingle
      .mockResolvedValueOnce({ data: null, error: { message: 'duplicate', code: '23505' } })
      // Second call: find existing order
      .mockResolvedValueOnce({ data: FAKE_DB_ORDER, error: null });

    const { createOrder } = await import('../api/orders');
    const result = await createOrder(TEST_ORDER_INPUT);

    expect(result.id).toBe('order-123');
  });

  it('throws after all retry attempts are exhausted', async () => {
    const chain = buildChain();
    mockFrom.mockReturnValue({ insert: () => chain, select: () => chain });
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: 'some column error', code: 'PGRST204' },
    });

    const { createOrder } = await import('../api/orders');
    await expect(createOrder(TEST_ORDER_INPUT)).rejects.toThrow();
  });
});

describe('confirmPayment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupLocalStorage();
  });

  it('confirms payment successfully', async () => {
    const chain = buildChain();
    mockFrom.mockReturnValue({ update: () => chain });
    mockSingle.mockResolvedValue({ data: { ...FAKE_DB_ORDER, payment_status: 'confirmed', status: 'served' }, error: null });

    const { confirmPayment } = await import('../api/orders');
    const result = await confirmPayment('order-123', {
      paymentType: '01',
      confirmedBy: 'staff-1',
      confirmedByName: 'John',
    });

    expect(result.payment_status).toBe('confirmed');
  });

  it('throws on failure — never swallows payment errors', async () => {
    const chain = buildChain();
    mockFrom.mockReturnValue({ update: () => chain });
    // All attempts fail
    mockSingle.mockResolvedValue({ data: null, error: { message: 'connection refused', code: 'ECONNREFUSED' } });

    const { confirmPayment } = await import('../api/orders');
    await expect(
      confirmPayment('order-123', { paymentType: '01' })
    ).rejects.toThrow();
  });
});

describe('updateOrderStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupLocalStorage();
  });

  it('updates status successfully', async () => {
    const chain = buildChain();
    mockFrom.mockReturnValue({ update: () => chain });
    mockSingle.mockResolvedValue({ data: { ...FAKE_DB_ORDER, status: 'served' }, error: null });

    const { updateOrderStatus } = await import('../api/orders');
    const result = await updateOrderStatus('order-123', { status: 'served' });

    expect(result.status).toBe('served');
  });

  it('sets completed_at when marking as served', async () => {
    const chain = buildChain();
    const capturedPayload: Record<string, unknown>[] = [];
    mockFrom.mockReturnValue({
      update: (payload: any) => { capturedPayload.push(payload); return chain; },
    });
    mockSingle.mockResolvedValue({ data: { ...FAKE_DB_ORDER, status: 'served' }, error: null });

    const { updateOrderStatus } = await import('../api/orders');
    await updateOrderStatus('order-123', { status: 'served' });

    expect(capturedPayload[0]).toHaveProperty('completed_at');
  });

  it('throws if database rejects the update', async () => {
    const chain = buildChain();
    mockFrom.mockReturnValue({ update: () => chain });
    mockSingle.mockResolvedValue({ data: null, error: { message: 'invalid status', code: '23514' } });

    const { updateOrderStatus } = await import('../api/orders');
    await expect(
      updateOrderStatus('order-123', { status: 'served' })
    ).rejects.toThrow();
  });
});
