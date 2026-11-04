// Task 4.3: kiểm thử logic tính giá. Chạy: npm test trong thư mục frontend
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculatePrice, formatVnd } from './pricing.ts';

test('size S không phụ thu, M +5.000, L +10.000', () => {
  assert.equal(calculatePrice(35000, 'S', []), 35000);
  assert.equal(calculatePrice(35000, 'M', []), 40000);
  assert.equal(calculatePrice(35000, 'L', []), 45000);
});

test('cộng giá từng topping đã chọn', () => {
  assert.equal(calculatePrice(30000, 'S', ['tran-chau']), 37000);
  assert.equal(calculatePrice(30000, 'M', ['tran-chau', 'kem-cheese']), 52000);
});

test('topping chọn trùng chỉ tính 1 lần, topping lạ bị bỏ qua', () => {
  assert.equal(calculatePrice(30000, 'S', ['pudding', 'pudding', 'khong-co']), 38000);
});

test('nhân theo số lượng, số lượng < 1 tính là 1', () => {
  assert.equal(calculatePrice(20000, 'L', ['pudding'], 3), 114000);
  assert.equal(calculatePrice(20000, 'S', [], 0), 20000);
});

test('định dạng tiền Việt Nam', () => {
  assert.equal(formatVnd(35000), '35.000 đ');
});
