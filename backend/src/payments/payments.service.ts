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

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async createPayment(
    orderId: string,
    ipAddress: string,
    returnUrl: string,
  ): Promise<string> {
    const order = (await this.prisma.orders.findUnique({
      where: { order_code: orderId },
    })) as OrderRecord | null;
    if (!order) {
      throw new NotFoundException('Order not found');
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

  async processPaymentReturn(params: Map<string, string>): Promise<OrderRecord> {
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
    if (
      params.get('vnp_ResponseCode') !== '00' ||
      params.get('vnp_TransactionStatus') !== '00'
    ) {
      throw new BadRequestException('Payment was not successful');
    }

    return (await this.prisma.orders.update({
      where: { id: orderId },
      data: { status: 'PAID' },
    })) as OrderRecord;
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
