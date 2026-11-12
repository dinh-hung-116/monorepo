/**
 * Kiểm thử PaymentsService
 *
 * Nhóm A – processPaymentReturn: xác thực chữ ký VNPay, cập nhật trạng thái đơn.
 * Nhóm B – createPayment (Idempotency-Key): gửi 2 lần cùng key
 *           → chỉ tạo 1 bản ghi payments, không trừ tiền 2 lần.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PaymentsService } from './payments.service.js';
import { PaymentRecord } from './payments.service.js';
import {Prisma} from "@prisma/client";

// ─── Hằng số môi trường giả lập ─────────────────────────────────────────────

const HASH_SECRET = 'test_secret_key';
const TMN_CODE = 'TESTCODE';
const PAYMENT_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';

/** Xây dựng Map tham số VNPay và ký hợp lệ bằng HMAC-SHA512. */
function buildSignedParams(overrides: Record<string, string>): Map<string, string> {
  const base: Record<string, string> = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: TMN_CODE,
    vnp_Amount: '10000000',   // 100,000 VND × 100
    vnp_CurrCode: 'VND',
    vnp_TxnRef: '1_1700000000000',
    vnp_OrderInfo: 'Thanh toan don hang 1',
    vnp_OrderType: 'other',
    vnp_Locale: 'vn',
    vnp_ResponseCode: '00',
    vnp_TransactionStatus: '00',
    vnp_BankCode: 'NCB',
    vnp_PayDate: '20240101120000',
    vnp_TransactionNo: '12345678',
    ...overrides,
  };

  const sorted = Object.entries(base)
    .filter(([, v]) => v !== '')
    .sort(([a], [b]) => a.localeCompare(b));

  const params = new URLSearchParams();
  for (const [k, v] of sorted) params.append(k, v);
  const hashData = params.toString();
  const secureHash = createHmac('sha512', HASH_SECRET)
    .update(hashData, 'utf8')
    .digest('hex');

  const result = new Map<string, string>(Object.entries(base));
  result.set('vnp_SecureHash', secureHash);
  return result;
}

// ─── A. processPaymentReturn ─────────────────────────────────────────────────

describe('PaymentsService.processPaymentReturn', () => {
  let service: PaymentsService;
  let findUniqueMock: ReturnType<typeof vi.fn>;
  let updateMock: ReturnType<typeof vi.fn>;
  let loyaltyFindFirstMock: ReturnType<typeof vi.fn>;
  let loyaltyCreateMock: ReturnType<typeof vi.fn>;
  let userUpdateMock: ReturnType<typeof vi.fn>;

  const fakeOrder = {
    id: 1,
    order_code: '#1001',
    user_id: 7,
    total_price: 100000,
    status: 'PENDING',
    items: [
      {
        id: 101,
        order_id: 1,
        product_id: 2,
        product_name: 'Cà phê sữa',
        size: 'M',
        quantity: 2,
        price: 37000,
        subtotal: 74000,
        product: {
          recipe: {
            ingredients: [
              { ingredient_id: 11, quantity: 18 },
              { ingredient_id: 12, quantity: 20 },
            ],
          },
        },
      },
      {
        id: 102,
        order_id: 1,
        product_id: 6,
        product_name: 'Trà đào',
        size: 'L',
        quantity: 1,
        price: 26000,
        subtotal: 26000,
        product: {
          recipe: {
            ingredients: [
              { ingredient_id: 13, quantity: 8 },
              { ingredient_id: 14, quantity: 80 },
            ],
          },
        },
      },
    ],
  };

  beforeEach(() => {
    vi.stubEnv('VNPAY_HASH_SECRET', HASH_SECRET);
    vi.stubEnv('VNPAY_TMN_CODE', TMN_CODE);
    vi.stubEnv('VNPAY_PAYMENT_URL', PAYMENT_URL);

    findUniqueMock = vi.fn().mockResolvedValue(fakeOrder);
    updateMock = vi.fn().mockImplementation(async ({ data }: { data: { status: string } }) => ({
      ...fakeOrder,
      status: data.status,
    }));
    loyaltyFindFirstMock = vi.fn().mockResolvedValue(null);
    loyaltyCreateMock = vi.fn().mockResolvedValue({ id: 1 });
    userUpdateMock = vi.fn().mockResolvedValue({ id: 7, loyalty_points: 10 });

    const prismaMock = {
      $transaction: vi.fn(async (callback) =>
        callback({
          loyaltytransactions: { create: loyaltyCreateMock },
          users: { update: userUpdateMock },
          orders: {
            findUnique: vi.fn().mockResolvedValue({ items: [] }),
          },
          ingredients: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        }),
      ),
      orders: { findUnique: findUniqueMock, update: updateMock },
      payments: {
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      loyaltytransactions: {
        findFirst: loyaltyFindFirstMock,
        create: loyaltyCreateMock,
      },
      users: { update: userUpdateMock },
      ingredients: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    } as unknown as PrismaService;

    service = new PaymentsService(prismaMock);
  });

  it('thanh toán THÀNH CÔNG → đơn chuyển sang PAID, paid = true (frontend sẽ xóa giỏ)', async () => {
    const params = buildSignedParams({
      vnp_Amount: '10000000',
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
    });

    const result = await service.processPaymentReturn(params);

    expect(result.paid).toBe(true);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PAID' }) }),
    );
    expect(result.order.status).toBe('PAID');
    expect(loyaltyCreateMock).toHaveBeenCalledWith({
      data: { user_id: 7, order_id: 1, points: 10 },
    });
    expect(userUpdateMock).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { loyalty_points: { increment: 10 } },
    });
  });

  it('thanh toán thành công, cộng điểm', async () => {
    loyaltyFindFirstMock.mockResolvedValue({ id: 10 });

    const result = await service.processPaymentReturn(
      buildSignedParams({
        vnp_Amount: '10000000',
        vnp_ResponseCode: '00',
        vnp_TransactionStatus: '00',
      }),
    );

    expect(result.paid).toBe(true);
    expect(loyaltyCreateMock).toHaveBeenCalled();
    expect(userUpdateMock).toHaveBeenCalled();
  });

  it('2 callback đồng thời → chỉ cộng điểm loyalty một lần', async () => {
    let transactionExists = false;
    let loyaltyPoints = 0;

    loyaltyCreateMock.mockImplementation(async ({ data }) => {
      // Simulate concurrent database insertion
      await new Promise((resolve) => setTimeout(resolve, 10));

      if (transactionExists) {
        throw new Prisma.PrismaClientKnownRequestError(
            'Unique constraint failed',
            {
              code: 'P2002',
              clientVersion: 'test',
              meta: {
                target: ['order_id'],
              },
            },
        );
      }

      transactionExists = true;
      return { id: 1, ...data };
    });

    userUpdateMock.mockImplementation(async ({ data }) => {
      loyaltyPoints += data.loyalty_points.increment;
      return { id: 7, loyalty_points: loyaltyPoints };
    });

    const params = buildSignedParams({
      vnp_Amount: '10000000',
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
    });

    const results = await Promise.allSettled([
      service.processPaymentReturn(params),
      service.processPaymentReturn(params),
    ]);

    expect(
        results.filter((r) => r.status === 'fulfilled'),
    ).toHaveLength(2);

    expect(loyaltyCreateMock).toHaveBeenCalledTimes(2);
    expect(userUpdateMock).toHaveBeenCalledTimes(1);
    expect(loyaltyPoints).toBe(10);
  });

  it('thanh toán thành công trừ nguyên liệu theo công thức bằng cập nhật có điều kiện', async () => {
    const ingredientUpdateManyMock = vi.fn().mockResolvedValue({ count: 1 });
    findUniqueMock
      .mockResolvedValueOnce(fakeOrder)
      .mockResolvedValueOnce({
        items: [
          {
            quantity: 2,
            product: {
              recipe: {
                ingredients: [
                  { ingredient_id: 11, quantity: 18 },
                  { ingredient_id: 12, quantity: 150 },
                ],
              },
            },
          },
        ],
      });
    const transaction = async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        payments: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        orders: {
          findUnique: vi.fn().mockResolvedValue({
            items: [
              {
                quantity: 2,
                product: {
                  recipe: {
                    ingredients: [
                      { ingredient_id: 11, quantity: 18 },
                      { ingredient_id: 12, quantity: 150 },
                    ],
                  },
                },
              },
            ],
          }),
        },
        loyaltytransactions: { create: loyaltyCreateMock },
        users: { update: userUpdateMock },
        ingredients: { updateMany: ingredientUpdateManyMock },
      });
    const transactionalPrisma = {
      orders: { findUnique: findUniqueMock, update: updateMock },
      payments: {
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      loyaltytransactions: {
        findFirst: loyaltyFindFirstMock,
        create: loyaltyCreateMock,
      },
      users: { update: userUpdateMock },
      ingredients: { updateMany: ingredientUpdateManyMock },
      $transaction: transaction,
    } as unknown as PrismaService;
    service = new PaymentsService(transactionalPrisma);

    await service.processPaymentReturn(
      buildSignedParams({
        vnp_Amount: '10000000',
        vnp_ResponseCode: '00',
        vnp_TransactionStatus: '00',
      }),
    );

    expect(ingredientUpdateManyMock).toHaveBeenNthCalledWith(1, {
      where: { id: 11, quantity: { gte: 36 } },
      data: { quantity: { decrement: 36 } },
    });
    expect(ingredientUpdateManyMock).toHaveBeenNthCalledWith(2, {
      where: { id: 12, quantity: { gte: 300 } },
      data: { quantity: { decrement: 300 } },
    });
  });

  it('thanh toán THẤT BẠI (ResponseCode ≠ 00) → đơn chuyển sang PAYMENT_FAILED, paid = false (giỏ hàng được giữ nguyên)', async () => {
    const params = buildSignedParams({
      vnp_Amount: '10000000',
      vnp_ResponseCode: '24',
      vnp_TransactionStatus: '02',
    });

    const result = await service.processPaymentReturn(params);

    expect(result.paid).toBe(false);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PAYMENT_FAILED' }) }),
    );
    expect(result.order.status).toBe('PAYMENT_FAILED');
  });

  it('thanh toán THẤT BẠI (TransactionStatus ≠ 00) → PAYMENT_FAILED dù ResponseCode = 00', async () => {
    const params = buildSignedParams({
      vnp_Amount: '10000000',
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '02',
    });

    const result = await service.processPaymentReturn(params);

    expect(result.paid).toBe(false);
    expect(result.order.status).toBe('PAYMENT_FAILED');
  });

  it('chặn callback thất bại làm hạ đơn đã PAID', async () => {
    findUniqueMock.mockResolvedValue({ ...fakeOrder, status: 'PAID' });

    await expect(
      service.processPaymentReturn(
        buildSignedParams({
          vnp_ResponseCode: '24',
          vnp_TransactionStatus: '02',
        }),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('đặt đồng thời không vượt tồn kho nhờ cập nhật quantity có điều kiện', async () => {
    let stock = 18;
    const updateIngredientMock = vi.fn(async ({ where, data }) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (stock < where.quantity.gte) return { count: 0 };
      stock -= data.quantity.decrement;
      return { count: 1 };
    });
    const inventoryPrisma = {
      orders: {
        findUnique: vi.fn().mockResolvedValue({
          items: [
            {
              quantity: 1,
              product: {
                recipe: {
                  ingredients: [{ ingredient_id: 11, quantity: 18 }],
                },
              },
            },
          ],
        }),
      },
      ingredients: { updateMany: updateIngredientMock },
      $transaction: vi.fn(async (callback) =>
        callback({
          orders: {
            findUnique: vi.fn().mockResolvedValue({
              items: [
                {
                  quantity: 1,
                  product: {
                    recipe: {
                      ingredients: [{ ingredient_id: 11, quantity: 18 }],
                    },
                  },
                },
              ],
            }),
          },
          ingredients: { updateMany: updateIngredientMock },
        }),
      ),
    } as unknown as PrismaService;
    service = new PaymentsService(inventoryPrisma);

    const results = await Promise.allSettled([
      (service as any).completeSuccessfulPayment(1),
      (service as any).completeSuccessfulPayment(1),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(stock).toBe(0);
    expect(updateIngredientMock).toHaveBeenCalledTimes(2);
  });

  it('ném BadRequestException khi thiếu vnp_SecureHash', async () => {
    const params = new Map<string, string>([
      ['vnp_ResponseCode', '00'],
      ['vnp_Amount', '10000000'],
    ]);

    await expect(service.processPaymentReturn(params)).rejects.toThrow(BadRequestException);
  });

  it('ném BadRequestException khi chữ ký không hợp lệ', async () => {
    const params = buildSignedParams({ vnp_Amount: '10000000' });
    params.set('vnp_SecureHash', 'invalid_hash_value');

    await expect(service.processPaymentReturn(params)).rejects.toThrow(BadRequestException);
  });

  it('ném BadRequestException khi số tiền không khớp đơn hàng', async () => {
    const params = buildSignedParams({ vnp_Amount: '5000000' }); // 50,000 ≠ 100,000

    await expect(service.processPaymentReturn(params)).rejects.toThrow(BadRequestException);
  });
});

// ─── B. createPayment – Idempotency-Key ─────────────────────────────────────

describe('PaymentsService.createPayment – Idempotency-Key (task b)', () => {
  let service: PaymentsService;
  let paymentsCreateMock: ReturnType<typeof vi.fn>;
  let paymentsFindUniqueMock: ReturnType<typeof vi.fn>;
  let ordersFindUniqueMock: ReturnType<typeof vi.fn>;

  const fakeOrder = {
    id: 42,
    order_code: '#1042',
    total_price: 75000,
    status: 'PENDING',
  };

  beforeEach(() => {
    vi.stubEnv('VNPAY_HASH_SECRET', HASH_SECRET);
    vi.stubEnv('VNPAY_TMN_CODE', TMN_CODE);
    vi.stubEnv('VNPAY_PAYMENT_URL', PAYMENT_URL);

    ordersFindUniqueMock = vi.fn().mockResolvedValue(fakeOrder);
    paymentsCreateMock = vi.fn().mockResolvedValue({ id: 1 });
    // Mặc định: chưa có payment nào với key này
    paymentsFindUniqueMock = vi.fn().mockResolvedValue(null);

    const prismaMock = {
      orders: { findUnique: ordersFindUniqueMock },
      payments: {
        findUnique: paymentsFindUniqueMock,
        create: paymentsCreateMock,
      },
    } as unknown as PrismaService;

    service = new PaymentsService(prismaMock);
  });

  it('request đầu tiên với key mới → tạo 1 bản ghi payments trong DB', async () => {
    const result = await service.createPayment(
      '#1042',
      '127.0.0.1',
      'http://localhost:3000/api/payment/return',
      'unique-key-001',
    );

    // Phải insert 1 lần
    expect(paymentsCreateMock).toHaveBeenCalledTimes(1);
    expect(paymentsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          order_id: fakeOrder.id,
          idempotencyKey: 'unique-key-001',
          payment_method: 'VNPAY',
          status: 'PENDING',
        }),
      }),
    );
    // Trả về URL VNPay hợp lệ
    expect(result.paymentUrl).toContain(PAYMENT_URL);
    expect(result.idempotent).toBe(false);
  });

  it('request thứ 2 với cùng Idempotency-Key → KHÔNG tạo thêm bản ghi payments (không trừ tiền 2 lần)', async () => {
    // Giả lập: payment với key này đã tồn tại từ request trước
    paymentsFindUniqueMock.mockResolvedValue({
      id: 1,
      order_id: fakeOrder.id,
      idempotencyKey: 'unique-key-001',
      status: 'PENDING',
    });

    const result = await service.createPayment(
      '#1042',
      '127.0.0.1',
      'http://localhost:3000/api/payment/return',
      'unique-key-001',
    );

    // DB KHÔNG được gọi thêm INSERT
    expect(paymentsCreateMock).not.toHaveBeenCalled();
    // Vẫn trả về URL để người dùng có thể thử lại
    expect(result.paymentUrl).toContain(PAYMENT_URL);
    // Flag idempotent = true để caller biết đây là request trùng
    expect(result.idempotent).toBe(true);
  });

  it('2 request liên tiếp cùng key → tổng số lần INSERT payments đúng bằng 1', async () => {
    const KEY = 'idempotency-key-abc';

    // Request 1: chưa có record → tạo mới
    paymentsFindUniqueMock.mockResolvedValueOnce(null);
    const r1 = await service.createPayment('#1042', '127.0.0.1', 'http://localhost:3000/api/payment/return', KEY);

    // Request 2: giờ đã có record → không tạo thêm
    paymentsFindUniqueMock.mockResolvedValueOnce({ id: 1, order_id: fakeOrder.id, idempotencyKey: KEY, status: 'PENDING' });
    const r2 = await service.createPayment('#1042', '127.0.0.1', 'http://localhost:3000/api/payment/return', KEY);

    // Chỉ 1 lần INSERT dù gọi 2 lần
    expect(paymentsCreateMock).toHaveBeenCalledTimes(1);

    // Cả 2 request đều trả về URL hợp lệ
    expect(r1.paymentUrl).toContain(PAYMENT_URL);
    expect(r2.paymentUrl).toContain(PAYMENT_URL);

    // Request 1 mới, request 2 idempotent
    expect(r1.idempotent).toBe(false);
    expect(r2.idempotent).toBe(true);
  });

  it('2 request đồng thời cùng key → chỉ tạo 1 payment record', async () => {
    let created: PaymentRecord | null = null;
    let createCalls = 0;
    paymentsFindUniqueMock.mockImplementation(async () => created);
    paymentsCreateMock.mockImplementation(async ({ data }) => {
      createCalls += 1;
      if (createCalls === 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        created = { id: 1, order_id: data.order_id, idempotencyKey: data.idempotencyKey, status: 'PENDING', amount: data.amount };
        return created;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
      const error = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      throw error;
    });

    const results = await Promise.all([
      service.createPayment('#1042', '127.0.0.1', 'http://localhost:3000/api/payment/return', 'same-key'),
      service.createPayment('#1042', '127.0.0.1', 'http://localhost:3000/api/payment/return', 'same-key'),
    ]);

    expect(createCalls).toBe(2);
    expect(results.filter((result) => result.idempotent)).toHaveLength(1);
    expect(results.every((result) => result.paymentUrl.includes(PAYMENT_URL))).toBe(true);
  });

  it('ném NotFoundException khi order_code không tồn tại', async () => {
    ordersFindUniqueMock.mockResolvedValue(null);

    await expect(
      service.createPayment('#9999', '127.0.0.1', 'http://localhost:3000', 'some-key'),
    ).rejects.toThrow(NotFoundException);

    // Không được gọi payments.create nếu order không tồn tại
    expect(paymentsCreateMock).not.toHaveBeenCalled();
  });
});
