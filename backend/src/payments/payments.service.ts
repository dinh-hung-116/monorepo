import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';

type OrderRecord = {
  id: number;
  total_price: number | { toString(): string };
  order_code: string;
  status?: string;
};

type PaymentRecord = {
  id: number;
  order_id: number;
  idempotencyKey: string;
  status: string;
  amount: number | { toString(): string };
};

export type PaymentReturnResult = {
  order: OrderRecord;
  paid: boolean;
};

/** Kết quả trả về khi tạo payment URL. */
export type CreatePaymentResult = {
  /** URL chuyển người dùng sang VNPay. */
  paymentUrl: string;
  /** true nếu request này là request trùng lặp (idempotency hit). */
  idempotent: boolean;
};

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Truy cập bảng payments qua Prisma (typed loosely để tương thích mock trong test). */
  private get paymentsRepo() {
    return (
      this.prisma as unknown as {
        payments?: {
          findUnique: (args: {
            where: { idempotencyKey: string };
          }) => Promise<PaymentRecord | null>;
          create: (args: {
            data: {
              order_id: number;
              idempotencyKey: string;
              payment_method: string;
              amount: number;
              status: string;
            };
          }) => Promise<PaymentRecord>;
          updateMany: (args: {
            where: { order_id: number };
            data: { status: string };
          }) => Promise<unknown>;
        };
      }
    )?.payments;
  }

  async createPayment(
    orderId: string,
    ipAddress: string,
    returnUrl: string,
    idempotencyKey: string,
  ): Promise<CreatePaymentResult> {
    const order = (await this.prisma.orders.findUnique({
      where: { order_code: orderId },
    })) as OrderRecord | null;
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // ── Kiểm tra Idempotency-Key ──────────────────────────────────────────
    // Nếu đã có payment record với key này → request trùng lặp.
    // Trả về URL mới (URL VNPay có hạn 15 phút nên không cache được) nhưng
    // KHÔNG tạo thêm bản ghi payments → không trừ tiền 2 lần.
    const existing = await this.paymentsRepo?.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      const url = this.buildVnpayUrl(order, ipAddress, returnUrl);
      return { paymentUrl: url, idempotent: true };
    }

    const tmnCode = this.getConfig('VNPAY_TMN_CODE', 'vnpay.tmn-code');
    const hashSecret = this.getConfig(
      'VNPAY_HASH_SECRET',
      'vnpay.hash-secret',
    );
    const paymentUrl = this.getConfig(
      'VNPAY_PAYMENT_URL',
      'vnpay.payment-url',
    );
    if (!tmnCode || !hashSecret || !paymentUrl) {
      throw new ServiceUnavailableException('VNPay configuration is missing');
    }

    const url = this.buildVnpayUrl(order, ipAddress, returnUrl);

    // Lưu payment record vào DB với idempotencyKey duy nhất.
    // Nếu có race-condition (2 request đồng thời cùng key), DB sẽ ném lỗi
    // unique constraint – caller nên retry hoặc trả 409.
    await this.paymentsRepo?.create({
      data: {
        order_id: order.id,
        idempotencyKey,
        payment_method: 'VNPAY',
        amount: Number(order.total_price),
        status: 'PENDING',
      },
    });

    return { paymentUrl: url, idempotent: false };
  }

  async processPaymentReturn(
    params: Map<string, string>,
  ): Promise<PaymentReturnResult> {
    const receivedHash = params.get('vnp_SecureHash');
    if (!receivedHash) {
      throw new BadRequestException('Missing VNPay signature');
    }

    const hashSecret = this.getConfig('VNPAY_HASH_SECRET', 'vnpay.hash-secret');
    if (!hashSecret) {
      throw new ServiceUnavailableException('VNPay configuration is missing');
    }

    const fields = new Map(params);
    fields.delete('vnp_SecureHash');
    fields.delete('vnp_SecureHashType');
    const { hashData } = this.buildPaymentParams(this.sortMap(fields));
    const calculatedHash = createHmac('sha512', hashSecret)
      .update(hashData, 'utf8')
      .digest('hex');
    if (!this.safeEqual(calculatedHash, receivedHash)) {
      throw new BadRequestException('Invalid VNPay signature');
    }

    const txnRef = params.get('vnp_TxnRef') ?? '';
    const orderId = Number(txnRef.split('_')[0]);
    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
      throw new BadRequestException('Invalid transaction reference');
    }

    const order = (await this.prisma.orders.findUnique({
      where: { id: orderId },
    })) as OrderRecord | null;
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const amount = Number(params.get('vnp_Amount')) / 100;
    if (!Number.isFinite(amount) || amount !== Number(order.total_price)) {
      throw new BadRequestException('Payment amount does not match the order');
    }
    // Thanh toán thất bại vẫn là một kết quả hợp lệ: đánh dấu đơn PAYMENT_FAILED
    // để người dùng biết, còn giỏ hàng phía frontend không bị xoá.
    const paid =
      params.get('vnp_ResponseCode') === '00' &&
      params.get('vnp_TransactionStatus') === '00';

    const updated = (await this.prisma.orders.update({
      where: { id: orderId },
      data: { status: paid ? 'PAID' : 'PAYMENT_FAILED' },
    })) as OrderRecord;

    // Cập nhật trạng thái payment record trong bảng payments (best-effort).
    await this.paymentsRepo
      ?.updateMany({
        where: { order_id: orderId },
        data: { status: paid ? 'SUCCESS' : 'FAILED' },
      })
      .catch(() => {/* Không để lỗi phụ làm hỏng luồng chính */});

    return { order: updated, paid };
  }

  /** Tạo URL thanh toán VNPay cho đơn hàng. Mỗi lần gọi sẽ có timestamp mới
   *  trong vnp_TxnRef, nhưng chỉ 1 bản ghi payments được lưu trên DB nhờ idempotency. */
  private buildVnpayUrl(
    order: OrderRecord,
    ipAddress: string,
    returnUrl: string,
  ): string {
    const tmnCode = this.getConfig('VNPAY_TMN_CODE', 'vnpay.tmn-code')!;
    const hashSecret = this.getConfig('VNPAY_HASH_SECRET', 'vnpay.hash-secret')!;
    const paymentUrl = this.getConfig('VNPAY_PAYMENT_URL', 'vnpay.payment-url')!;

    const now = new Date();
    const params = new Map<string, string>([
      ['vnp_Version', '2.1.0'],
      ['vnp_Command', 'pay'],
      ['vnp_TmnCode', tmnCode],
      ['vnp_Amount', this.toVnpayAmount(order.total_price)],
      ['vnp_CurrCode', 'VND'],
      ['vnp_TxnRef', `${order.id}_${Date.now()}`],
      ['vnp_OrderInfo', `Thanh toan don hang ${order.id}`],
      ['vnp_OrderType', 'other'],
      ['vnp_Locale', 'vn'],
      ['vnp_ReturnUrl', returnUrl],
      ['vnp_IpAddr', ipAddress],
      ['vnp_CreateDate', this.formatVNPayDate(now)],
      [
        'vnp_ExpireDate',
        this.formatVNPayDate(new Date(now.getTime() + 15 * 60 * 1000)),
      ],
    ]);

    const { hashData, query } = this.buildPaymentParams(this.sortMap(params));
    const secureHash = createHmac('sha512', hashSecret)
      .update(hashData, 'utf8')
      .digest('hex');
    return `${paymentUrl}?${query}&vnp_SecureHash=${secureHash}`;
  }

  private getConfig(primary: string, legacy: string): string | undefined {
    return process.env[primary] || process.env[legacy];
  }

  private toVnpayAmount(value: OrderRecord['total_price']): string {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Order total must be a positive number');
    }
    return String(Math.round(amount * 100));
  }

  private safeEqual(expected: string, received: string): boolean {
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const receivedBuffer = Buffer.from(received, 'utf8');
    return (
      expectedBuffer.length === receivedBuffer.length &&
      timingSafeEqual(expectedBuffer, receivedBuffer)
    );
  }

  private formatVNPayDate(date: Date): string {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const values = Object.fromEntries(
      parts.map(({ type, value }) => [type, value]),
    );
    return `${values.year}${values.month}${values.day}${values.hour}${values.minute}${values.second}`;
  }

  private sortMap(map: Map<string, string>): Map<string, string> {
    return new Map([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }

  private buildPaymentParams(params: Map<string, string>): {
    hashData: string;
    query: string;
  } {
    const entries = [...params.entries()].filter(([, value]) => value !== '');
    const searchParams = new URLSearchParams();

    for (const [key, value] of entries) {
      searchParams.append(key, value);
    }

    const encoded = searchParams.toString();

    return {
      hashData: encoded,
      query: encoded,
    };
  }
}
