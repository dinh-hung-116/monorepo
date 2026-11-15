import { IsIn } from 'class-validator';

/** Trạng thái nhân viên được đặt; còn lại do thanh toán hoặc khách quyết định. */
export const STAFF_SETTABLE_STATUSES = [
  'PREPARING',
  'READY',
  'COMPLETED',
  'CANCELLED',
] as const;

export class UpdateOrderStatusDto {
  @IsIn(STAFF_SETTABLE_STATUSES, {
    message: 'status phải là PREPARING, READY, COMPLETED hoặc CANCELLED',
  })
  status!: (typeof STAFF_SETTABLE_STATUSES)[number];
}
