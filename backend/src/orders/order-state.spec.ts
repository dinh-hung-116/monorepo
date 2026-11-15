// Tiêu chí chấm (a): chặn được chuyển trạng thái sai. Duyệt đủ 7 × 7 = 49 cặp trạng thái.
import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  assertTransition,
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
} from './order-state.js';

// Đúng các mũi tên trong sơ đồ mục 9.1 của đề, viết tay để so với bảng trong code.
const ARROWS = new Set([
  'PENDING>PAID',
  'PENDING>PAYMENT_FAILED',
  'PENDING>CANCELLED',
  'PAYMENT_FAILED>PENDING',
  'PAYMENT_FAILED>CANCELLED',
  'PAID>PREPARING',
  'PAID>CANCELLED',
  'PREPARING>READY',
  'READY>COMPLETED',
]);

const pairs = ORDER_STATUSES.flatMap((from) =>
  ORDER_STATUSES.map((to) => [from, to] as const),
);

describe('Order State Machine — assertTransition', () => {
  it('có đủ 49 cặp và đúng 9 mũi tên hợp lệ', () => {
    expect(pairs).toHaveLength(49);
    const allowed = Object.entries(ORDER_TRANSITIONS).flatMap(([from, tos]) =>
      tos.map((to) => `${from}>${to}`),
    );
    expect(new Set(allowed)).toEqual(ARROWS);
  });

  it.each(pairs)('%s → %s', (from, to) => {
    if (ARROWS.has(`${from}>${to}`)) {
      expect(() => assertTransition(from, to)).not.toThrow();
    } else {
      expect(() => assertTransition(from, to)).toThrow(ConflictException);
    }
  });

  it('COMPLETED và CANCELLED là trạng thái kết thúc', () => {
    expect(ORDER_TRANSITIONS.COMPLETED).toEqual([]);
    expect(ORDER_TRANSITIONS.CANCELLED).toEqual([]);
  });

  it('trạng thái lạ bị chặn', () => {
    expect(() => assertTransition('UNKNOWN', 'PAID')).toThrow(
      ConflictException,
    );
  });
});
