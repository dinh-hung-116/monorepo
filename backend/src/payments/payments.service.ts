import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { InventoryService } from '../inventory/inventory.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {OrderStatus, Prisma} from "@prisma/client";

type OrderRecord = {
  id: number;
  total_price: number | { toString(): string };
  order_code: string;
  user_id?: number | null;
  status?: string;
};

export type PaymentRecord = {
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

export type CancelPaymentResult = {
  order: OrderRecord;
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly inventory?: InventoryService,
  ) {}

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
      const url = this.buildVnpayUrl(order, existing.id, ipAddress, returnUrl);
      return { paymentUrl: url, idempotent: true };
    }

    // Lưu payment record vào DB với idempotencyKey duy nhất.
    // Nếu có race-condition (2 request đồng thời cùng key), DB sẽ ném lỗi
    // unique constraint – caller nên retry hoặc trả 409.
    let newPayment: PaymentRecord;
    try {
      newPayment = await this.prisma.payments.create({
        data: {
          order_id: order.id,
          idempotencyKey,
          payment_method: 'VNPAY',
          amount: Number(order.total_price),
          status: 'PENDING',
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;

      const concurrent = await this.paymentsRepo?.findUnique({
        where: { idempotencyKey },
      });
      if (!concurrent) throw error;

      const url = this.buildVnpayUrl(order, concurrent.id, ipAddress, returnUrl);
      return { paymentUrl: url, idempotent: true };
    }

    const tmnCode = this.getConfig('VNPAY_TMN_CODE', 'vnpay.tmn-code');
    const hashSecret = this.getConfig('VNPAY_HASH_SECRET', 'vnpay.hash-secret');
    const paymentUrl = this.getConfig('VNPAY_PAYMENT_URL', 'vnpay.payment-url');
    if (!tmnCode || !hashSecret || !paymentUrl) {
      throw new ServiceUnavailableException('VNPay configuration is missing');
    }

    const url = this.buildVnpayUrl(order, newPayment.id, ipAddress, returnUrl);

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
    const paymentId = Number(txnRef.split('_')[1]);
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
    if (order.status === 'PAID' && !paid) {
      throw new BadRequestException('Invalid payment state transition');
    }
    if (order.status === 'CANCELLED' && paid) {
      throw new BadRequestException('Invalid payment state transition');
    }

    const updated = (await this.prisma.orders.update({
      where: { id: orderId },
      data: { status: paid ? 'PAID' : 'PAYMENT_FAILED' },
    })) as OrderRecord;

    // Cập nhật trạng thái payment record trong bảng payments (best-effort).
    await this.prisma.payments
      .update({
        where: { order_id: orderId, id: paymentId },
        data: {
          status: paid ? 'SUCCESS' : 'FAILED',
          bank_code: params.get('vnp_BankCode') ?? null,
          payment_method: params.get('vnp_CardType') ?? '',
        },
      })
      .catch(() => {
        /* Không để lỗi phụ làm hỏng luồng chính */
      });

    if (paid) {
      await this.awardLoyaltyPoints(order);
      await this.completeSuccessfulPayment(orderId);
    }

    // Tồn kho: thanh toán xong thì trừ thật khỏi kho, thất bại thì trả lại phần đã giữ chỗ
    // để giỏ hàng/nguyên liệu vẫn dùng được cho lần thanh toán sau.
    try {
      if (paid) {
        await this.inventory?.consumeForOrder(orderId);
      } else {
        await this.inventory?.releaseForOrder(orderId);
      }
    } catch (err) {
      this.logger.error(
        `Không cập nhật được tồn kho cho đơn ${orderId}: ${(err as Error)?.message ?? String(err)}`,
      );
    }

    return { order: updated, paid };
  }

  private async completeSuccessfulPayment(
    orderId: number,
  ): Promise<void> {

    // Unit-test doubles may not expose Prisma's transaction API.
    if (!this.prisma.$transaction) return;
    const order = await this.prisma.orders.findUnique({
      where: { id: orderId, status: OrderStatus.PAID },
      include: {
        items: {
          include: {
            product: {
              include: {
                recipe: { include: { ingredients: true } },
              },
            },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found, or it is not paid for');

    const requiredByIngredient = new Map<number, number>();
    for (const item of order.items) {
      for (const recipeIngredient of item.product?.recipe?.ingredients ?? []) {
        const required =
          Number(recipeIngredient.quantity) * item.quantity;
        requiredByIngredient.set(
          recipeIngredient.ingredient_id,
          (requiredByIngredient.get(recipeIngredient.ingredient_id) ?? 0) +
            required,
        );
      }
    }

    for (const [ingredientId, required] of requiredByIngredient) {
      const result = await this.prisma.ingredients.updateMany({
        where: { id: ingredientId, quantity: { gte: required } },
        data: { quantity: { decrement: required } },
      });
      if (result.count !== 1) {
        throw new BadRequestException(
          'Không đủ nguyên liệu để hoàn tất đơn hàng',
        );
      }
    }
  }

  private async awardLoyaltyPoints(order: OrderRecord): Promise<void> {
    if (!order.user_id) return;

    const points = Math.floor(Number(order.total_price) / 10000);
    const userId = order.user_id;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.loyaltytransactions.create({
          data: {
            user_id: userId,
            order_id: order.id,
            points,
          },
        });

        await tx.users.update({
          where: { id: userId },
          data: {
            loyalty_points: {
              increment: points,
            },
          },
        });
      });
    } catch (error) {
      if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
      ) {
        return;
      }

      throw error;
    }
  }

  async cancelPayment(
    orderCode: string,
    userId: string,
  ): Promise<CancelPaymentResult> {
    const numericUserId = Number(userId);
    if (!Number.isSafeInteger(numericUserId) || numericUserId <= 0) {
      throw new NotFoundException('Order not found');
    }

    const order = (await this.prisma.orders.findUnique({
      where: {
        order_code: orderCode.startsWith('#') ? orderCode : `#${orderCode}`,
      },
    })) as (OrderRecord & { user_id?: number | null }) | null;
    if (!order || order.user_id !== numericUserId) {
      throw new NotFoundException('Order not found');
    }
    if (!['PENDING', 'PAID', 'PAYMENT_FAILED'].includes(order.status ?? '')) {
      throw new BadRequestException('This order cannot be cancelled');
    }

    const updated = (await this.prisma.orders.update({
      where: { id: order.id },
      data: { status: 'CANCELLED' },
    })) as OrderRecord;

    if (order.status === 'PENDING') {
      await this.prisma.payments.updateMany({
        where: { order_id: order.id, status: 'PENDING' },
        data: { status: 'FAILED' },
      });
    }

    return { order: updated };
  }

  /** Tạo URL thanh toán VNPay cho đơn hàng. Mỗi lần gọi sẽ có timestamp mới
   *  trong vnp_TxnRef, nhưng chỉ 1 bản ghi payments được lưu trên DB nhờ idempotency. */
  private buildVnpayUrl(
    order: OrderRecord,
    paymentId: number,
    ipAddress: string,
    returnUrl: string,
  ): string {
    const tmnCode = this.getConfig('VNPAY_TMN_CODE', 'vnpay.tmn-code')!;
    const hashSecret = this.getConfig(
      'VNPAY_HASH_SECRET',
      'vnpay.hash-secret',
    )!;
    const paymentUrl = this.getConfig(
      'VNPAY_PAYMENT_URL',
      'vnpay.payment-url',
    )!;

    const now = new Date();
    const params = new Map<string, string>([
      ['vnp_Version', '2.1.0'],
      ['vnp_Command', 'pay'],
      ['vnp_TmnCode', tmnCode],
      ['vnp_Amount', this.toVnpayAmount(order.total_price)],
      ['vnp_CurrCode', 'VND'],
      ['vnp_TxnRef', `${order.id}_${paymentId}_${Date.now()}`],
      ['vnp_OrderInfo', `Thanh toan don hang ${order.id}`],
      ['vnp_OrderType', 'other'],
      ['vnp_Locale', 'vn'],
      ['vnp_ReturnUrl', returnUrl],
      ['vnp_IpAddr', ipAddress],
      ['vnp_CreateDate', this.formatVNPayDate(now)],
      [
        'vnp_ExpireDate',
        this.formatVNPayDate(new Date(now.getTime() + 3 * 60 * 1000)),
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
