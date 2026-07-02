import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// ── Mocks (hoisted before router import) ─────────────────────────────────────

const { mockQuery, mockEmitOrderUpdate, mockCreateOrderService, mockEnqueueFiscal } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockEmitOrderUpdate: vi.fn(),
  mockCreateOrderService: vi.fn(),
  mockEnqueueFiscal: vi.fn(),
}));

vi.mock('../db.js', () => ({ pool: { query: mockQuery } }));
vi.mock('../socket.js', () => ({ emitOrderUpdate: mockEmitOrderUpdate }));
vi.mock('../services/orderService.js', () => ({ createOrder: mockCreateOrderService }));
vi.mock('../services/vubaVubaService.js', () => ({
  createVubaVubaOrder: vi.fn(),
  updateVubaVubaOrderStatus: vi.fn(),
}));
vi.mock('../services/notificationService.js', () => ({ notifyOrderReady: vi.fn() }));
vi.mock('../services/ebmFiscalQueue.js', () => ({
  enqueueSalesFiscalizationJob: mockEnqueueFiscal,
}));

// ── Import router after mocks ─────────────────────────────────────────────────

import { ordersRouter } from './orders.js';

// ── Test app ──────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use('/orders', ordersRouter);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const RESTAURANT_ID = 'rest-abc-123';

const BASE_ITEM = {
  menuItemId: 'menu-1',
  menuItemName: 'Grilled Chicken',
  quantity: 2,
  unitPrice: 2500,
};

function makeDbOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order_test1',
    order_number: 'ABC1234',
    table_number: 5,
    customer_name: 'Walk-in',
    status: 'pending',
    payment_status: 'unpaid',
    items: JSON.stringify([BASE_ITEM]),
    subtotal: 5000,
    tax: 750,
    total: 5750,
    notes: null,
    requires_kitchen: true,
    restaurant_id: RESTAURANT_ID,
    created_by: 'system',
    assigned_waiter_id: null,
    idempotency_key: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null,
    ...overrides,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  // resetAllMocks flushes the mockResolvedValueOnce queue; clearAllMocks does not
  vi.resetAllMocks();
  // Keep side-effect mocks non-throwing after reset
  mockEmitOrderUpdate.mockReturnValue(undefined);
  mockEnqueueFiscal.mockResolvedValue(undefined);
  mockQuery.mockResolvedValue({ rows: [] }); // safe default — tests override as needed
});

// =============================================================================
// POST /orders — Create order
// =============================================================================

describe('POST /orders', () => {
  it('creates an order and returns 201', async () => {
    const dbOrder = makeDbOrder();
    mockQuery.mockResolvedValueOnce({ rows: [] }); // idempotency pre-check: no existing
    mockCreateOrderService.mockResolvedValueOnce(dbOrder);

    const res = await request(app)
      .post('/orders')
      .send({
        restaurantId: RESTAURANT_ID,
        tableNumber: 5,
        items: [BASE_ITEM],
        requiresKitchen: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('order_test1');
    expect(res.body.restaurantId).toBe(RESTAURANT_ID);
    expect(mockCreateOrderService).toHaveBeenCalledOnce();
    expect(mockEmitOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'create' })
    );
  });

  it('accepts snake_case field names', async () => {
    const dbOrder = makeDbOrder();
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockCreateOrderService.mockResolvedValueOnce(dbOrder);

    const res = await request(app)
      .post('/orders')
      .send({
        restaurantId: RESTAURANT_ID,
        table_number: 5,
        customer_name: 'John',
        items: [BASE_ITEM],
      });

    expect(res.status).toBe(201);
    expect(mockCreateOrderService).toHaveBeenCalledWith(
      expect.objectContaining({ tableNumber: 5, customerName: 'John' })
    );
  });

  it('returns 400 when restaurantId is missing', async () => {
    const res = await request(app)
      .post('/orders')
      .send({ tableNumber: 5, items: [BASE_ITEM] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/restaurantId/i);
    expect(mockCreateOrderService).not.toHaveBeenCalled();
  });

  it('returns 500 when items array is empty (service throws)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockCreateOrderService.mockRejectedValueOnce(
      new Error('Order must include at least one item')
    );

    const res = await request(app)
      .post('/orders')
      .send({ restaurantId: RESTAURANT_ID, tableNumber: 1, items: [] });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/at least one item/i);
  });

  describe('idempotency', () => {
    it('returns 200 with existing order when same idempotency key is used', async () => {
      const existing = makeDbOrder({ idempotency_key: 'key-xyz' });
      // Pre-check finds the existing order
      mockQuery.mockResolvedValueOnce({ rows: [existing] });

      const res = await request(app)
        .post('/orders')
        .send({
          restaurantId: RESTAURANT_ID,
          items: [BASE_ITEM],
          idempotencyKey: 'key-xyz',
        });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('order_test1');
      expect(mockCreateOrderService).not.toHaveBeenCalled();
    });

    it('accepts idempotency key in snake_case (idempotency_key)', async () => {
      const existing = makeDbOrder({ idempotency_key: 'key-snake' });
      mockQuery.mockResolvedValueOnce({ rows: [existing] });

      const res = await request(app)
        .post('/orders')
        .send({
          restaurantId: RESTAURANT_ID,
          items: [BASE_ITEM],
          idempotency_key: 'key-snake',
        });

      expect(res.status).toBe(200);
      expect(mockCreateOrderService).not.toHaveBeenCalled();
    });

    it('handles race condition — 23505 unique constraint falls back to existing row', async () => {
      const existing = makeDbOrder({ idempotency_key: 'key-race' });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // pre-check: nothing yet
      const constraintError: any = new Error('duplicate key');
      constraintError.code = '23505';
      mockCreateOrderService.mockRejectedValueOnce(constraintError);
      mockQuery.mockResolvedValueOnce({ rows: [existing] }); // fallback lookup

      const res = await request(app)
        .post('/orders')
        .send({
          restaurantId: RESTAURANT_ID,
          items: [BASE_ITEM],
          idempotencyKey: 'key-race',
        });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('order_test1');
    });

    it('returns 500 on race condition when no idempotency key supplied', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const constraintError: any = new Error('duplicate key');
      constraintError.code = '23505';
      mockCreateOrderService.mockRejectedValueOnce(constraintError);

      const res = await request(app)
        .post('/orders')
        .send({ restaurantId: RESTAURANT_ID, items: [BASE_ITEM] });

      expect(res.status).toBe(500);
    });
  });

  it('passes requiresKitchen to the order service', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockCreateOrderService.mockResolvedValueOnce(makeDbOrder({ requires_kitchen: true }));

    await request(app)
      .post('/orders')
      .send({ restaurantId: RESTAURANT_ID, items: [BASE_ITEM], requiresKitchen: true });

    expect(mockCreateOrderService).toHaveBeenCalledWith(
      expect.objectContaining({ requiresKitchen: true })
    );
  });

  it('passes delivery fields to the order service', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockCreateOrderService.mockResolvedValueOnce(makeDbOrder());

    // Route destructures delivery_provider (snake_case) and deliveryAddress (camelCase)
    await request(app)
      .post('/orders')
      .send({
        restaurantId: RESTAURANT_ID,
        items: [BASE_ITEM],
        delivery_provider: 'VubaVuba',
        deliveryAddress: '123 Test St',
      });

    expect(mockCreateOrderService).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryProvider: 'VubaVuba',
        deliveryAddress: '123 Test St',
      })
    );
  });

  it('emits a socket create event on success', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockCreateOrderService.mockResolvedValueOnce(makeDbOrder());

    await request(app)
      .post('/orders')
      .send({ restaurantId: RESTAURANT_ID, items: [BASE_ITEM] });

    expect(mockEmitOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'create', order: expect.objectContaining({ id: 'order_test1' }) })
    );
  });
});

// =============================================================================
// PUT /orders/:id/status — Update status
// =============================================================================

describe('PUT /orders/:id/status', () => {
  it('updates order status to preparing', async () => {
    const updated = makeDbOrder({ status: 'preparing' });
    mockQuery.mockResolvedValueOnce({ rows: [updated] });

    const res = await request(app)
      .put('/orders/order_test1/status')
      .send({ status: 'preparing' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('preparing');
    expect(mockEmitOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'update' })
    );
  });

  it('sets completed_at when status is served', async () => {
    const updated = makeDbOrder({ status: 'served', completed_at: new Date().toISOString() });
    mockQuery.mockResolvedValueOnce({ rows: [updated] });

    const res = await request(app)
      .put('/orders/order_test1/status')
      .send({ status: 'served' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('served');
    // Verify query included completed_at in the SET clause
    const sql: string = mockQuery.mock.calls[0][0];
    expect(sql).toContain('completed_at');
  });

  it('assigns a waiter when assigned_to is provided', async () => {
    const updated = makeDbOrder({ assigned_waiter_id: 'waiter-1', status: 'verified' });
    mockQuery.mockResolvedValueOnce({ rows: [updated] });

    const res = await request(app)
      .put('/orders/order_test1/status')
      .send({ status: 'verified', assigned_to: 'waiter-1' });

    expect(res.status).toBe(200);
    const sql: string = mockQuery.mock.calls[0][0];
    expect(sql).toContain('assigned_to');
  });

  it('returns 404 when order does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put('/orders/nonexistent/status')
      .send({ status: 'preparing' });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});

// =============================================================================
// POST /orders/:id/confirm-payment
// =============================================================================

describe('POST /orders/:id/confirm-payment', () => {
  it('confirms payment and returns updated order', async () => {
    const dbOrder = makeDbOrder({ payment_status: 'unpaid' });
    const confirmed = makeDbOrder({ payment_status: 'confirmed' });
    mockQuery.mockResolvedValueOnce({ rows: [dbOrder] });   // fetch order
    mockQuery.mockResolvedValueOnce({ rows: [confirmed] }); // update

    const res = await request(app)
      .post('/orders/order_test1/confirm-payment')
      .send({ confirmedBy: 'sup-1', confirmedByName: 'Alice', paymentType: 'cash', restaurantId: RESTAURANT_ID });

    expect(res.status).toBe(200);
    expect(res.body.paymentStatus).toBe('confirmed');
    expect(mockEmitOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'update' })
    );
  });

  it('returns 200 idempotently when payment already confirmed', async () => {
    const already = makeDbOrder({ payment_status: 'confirmed' });
    mockQuery.mockResolvedValueOnce({ rows: [already] });

    const res = await request(app)
      .post('/orders/order_test1/confirm-payment')
      .send({ confirmedBy: 'sup-1' });

    expect(res.status).toBe(200);
    expect(res.body.alreadyConfirmed).toBe(true);
    // Should not run the UPDATE query
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('returns 404 when order does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/orders/nonexistent/confirm-payment')
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});

// =============================================================================
// DELETE /orders/:id — Cancel order
// =============================================================================

describe('DELETE /orders/:id', () => {
  it('cancels an order and returns 204', async () => {
    const cancelled = makeDbOrder({ status: 'cancelled' });
    mockQuery.mockResolvedValueOnce({ rows: [cancelled] });

    const res = await request(app).delete('/orders/order_test1');

    expect(res.status).toBe(204);
    const sql: string = mockQuery.mock.calls[0][0];
    expect(sql).toContain("status = 'cancelled'");
    expect(mockEmitOrderUpdate).toHaveBeenCalled();
  });

  it('returns 404 when order does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).delete('/orders/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});

// =============================================================================
// GET /orders/:id — Fetch single order
// =============================================================================

describe('GET /orders/:id', () => {
  it('returns an order by id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [makeDbOrder()] });

    const res = await request(app).get('/orders/order_test1');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('order_test1');
  });

  it('returns 404 when order does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/orders/nonexistent');

    expect(res.status).toBe(404);
  });
});
