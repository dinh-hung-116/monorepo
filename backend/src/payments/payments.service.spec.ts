/**
 * Kiểm thử PaymentsService.processPaymentReturn
 *
 * Hai kịch bản cốt lõi:
 * 1. Thanh toán THÀNH CÔNG  → đơn hàng chuyển sang PAID,  paid = true
 *    → frontend (order-confirmation) sẽ gọi clearCart() để xóa giỏ hàng.
 * 2. Thanh toán THẤT BẠI   → đơn hàng chuyển sang PAYMENT_FAILED, paid = false
 *    → frontend KHÔNG gọi clearCart() – giỏ hàng được giữ nguyên để thử lại.
 */
import { BadRequestException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PaymentsService } from './payments.service.js';

// ─── helpers ────────────────────────────────────────────────────────────────

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

  // Sắp xếp theo thứ tự từ điển rồi tạo chuỗi ký
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

// ─── setup ──────────────────────────────────────────────────────────────────

describe('PaymentsService.processPaymentReturn', () => {
  let service: PaymentsService;
  let findUniqueMock: ReturnType<typeof vi.fn>;
  let updateMock: ReturnType<typeof vi.fn>;

  const fakeOrder = {
    id: 1,
    order_code: '#1001',
    total_price: 100000,   // 100,000 VND
    status: 'PENDING',
  };

  beforeEach(() => {
    // Thiết lập biến môi trường VNPay cho mỗi test
    vi.stubEnv('VNPAY_HASH_SECRET', HASH_SECRET);
    vi.stubEnv('VNPAY_TMN_CODE', TMN_CODE);
    vi.stubEnv('VNPAY_PAYMENT_URL', PAYMENT_URL);

    findUniqueMock = vi.fn().mockResolvedValue(fakeOrder);
    updateMock = vi.fn().mockImplementation(async ({ data }: { data: { status: string } }) => ({
      ...fakeOrder,
      status: data.status,
    }));

    const prismaMock = {
      orders: {
        findUnique: findUniqueMock,
        update: updateMock,
      },
    } as unknown as PrismaService;

    service = new PaymentsService(prismaMock);
  });

  // ── Kịch bản 1: Thanh toán thành công ──────────────────────────────────

  it('thanh toán THÀNH CÔNG → đơn chuyển sang PAID, paid = true (frontend sẽ xóa giỏ)', async () => {
    const params = buildSignedParams({
      vnp_Amount: '10000000',   // 100,000 × 100 = 10,000,000
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
    });

    const result = await service.processPaymentReturn(params);

    // Service phải báo cáo đây là thanh toán thành công
    expect(result.paid).toBe(true);
    // Đơn hàng phải được cập nhật thành PAID
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PAID' }),
      }),
    );
    expect(result.order.status).toBe('PAID');
  });

  // ── Kịch bản 2: Thanh toán thất bại ────────────────────────────────────

  it('thanh toán THẤT BẠI (ResponseCode ≠ 00) → đơn chuyển sang PAYMENT_FAILED, paid = false (giỏ hàng được giữ nguyên)', async () => {
    const params = buildSignedParams({
      vnp_Amount: '10000000',
      vnp_ResponseCode: '24',    // Người dùng hủy giao dịch
      vnp_TransactionStatus: '02',
    });

    const result = await service.processPaymentReturn(params);

    // Service phải báo cáo đây là thanh toán thất bại
    expect(result.paid).toBe(false);
    // Đơn hàng phải được cập nhật thành PAYMENT_FAILED, KHÔNG phải PAID
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PAYMENT_FAILED' }),
      }),
    );
    expect(result.order.status).toBe('PAYMENT_FAILED');
  });

  it('thanh toán THẤT BẠI (TransactionStatus ≠ 00) → PAYMENT_FAILED dù ResponseCode = 00', async () => {
    const params = buildSignedParams({
      vnp_Amount: '10000000',
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '02',  // Giao dịch chưa hoàn tất
    });

    const result = await service.processPaymentReturn(params);

    expect(result.paid).toBe(false);
    expect(result.order.status).toBe('PAYMENT_FAILED');
  });

  // ── Kiểm tra chữ ký ─────────────────────────────────────────────────────

  it('ném BadRequestException khi thiếu vnp_SecureHash', async () => {
    const params = new Map<string, string>([
      ['vnp_ResponseCode', '00'],
      ['vnp_Amount', '10000000'],
    ]);

    await expect(service.processPaymentReturn(params)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('ném BadRequestException khi chữ ký không hợp lệ', async () => {
    const params = buildSignedParams({ vnp_Amount: '10000000' });
    params.set('vnp_SecureHash', 'invalid_hash_value');

    await expect(service.processPaymentReturn(params)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('ném BadRequestException khi số tiền không khớp đơn hàng', async () => {
    // Giả sử đơn hàng có total_price = 100,000 VND nhưng VNPay trả về 50,000 VND
    const params = buildSignedParams({
      vnp_Amount: '5000000',   // 50,000 × 100 = 5,000,000 — KHÔNG KHỚP
    });

    await expect(service.processPaymentReturn(params)).rejects.toThrow(
      BadRequestException,
    );
  });
});
