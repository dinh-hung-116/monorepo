// Task 10.1: máy trạng thái đơn hàng (Order State Machine) theo sơ đồ mục 9.1 của đề.
// Mọi chỗ đổi trạng thái đơn phải đi qua bảng này; chuyển tiếp không có trong bảng bị chặn.
import { ConflictException } from '@nestjs/common';
import type { OrderStatus } from './entities/order.entity.js';

export const ORDER_STATUSES: readonly OrderStatus[] = [
  'PENDING',
  'PAID',
  'PAYMENT_FAILED',
  'PREPARING',
  'READY',
  'COMPLETED',
  'CANCELLED',
];

/** Các mũi tên hợp lệ. COMPLETED và CANCELLED là trạng thái kết thúc. */
export const ORDER_TRANSITIONS: Readonly<
  Record<OrderStatus, readonly OrderStatus[]>
> = {
  PENDING: ['PAID', 'PAYMENT_FAILED', 'CANCELLED'], // thanh toán OK / lỗi / huỷ
  PAYMENT_FAILED: ['PENDING', 'CANCELLED'], // thử lại / huỷ
  PAID: ['PREPARING', 'CANCELLED'], // barista nhận / huỷ
  PREPARING: ['READY'], // pha xong
  READY: ['COMPLETED'], // giao khách
  COMPLETED: [],
  CANCELLED: [],
};

/** Bước kế tiếp mà nhân viên quầy (barista) được bấm. */
export const STAFF_NEXT_STATUS: Readonly<Partial<Record<OrderStatus, OrderStatus>>> = {
  PAID: 'PREPARING',
  PREPARING: 'READY',
  READY: 'COMPLETED',
};

export function canTransition(from: string, to: string): boolean {
  const allowed = ORDER_TRANSITIONS[from as OrderStatus];
  return Boolean(allowed?.includes(to as OrderStatus));
}

/** Ném 409 nếu chuyển trạng thái không có mũi tên trong sơ đồ. */
export function assertTransition(from: string, to: string): void {
  if (!canTransition(from, to)) {
    throw new ConflictException(
      `Không thể chuyển đơn từ ${from} sang ${to}`,
    );
  }
}
