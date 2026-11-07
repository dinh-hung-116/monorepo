// Task 4.2: kiểm thử chọn / bỏ topping. Chạy: npm test trong thư mục frontend
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toggleTopping } from './options.ts';

test('chọn topping chưa có thì thêm vào cuối', () => {
  assert.deepEqual(toggleTopping([], 'tran-chau'), ['tran-chau']);
  assert.deepEqual(toggleTopping(['tran-chau'], 'pudding'), ['tran-chau', 'pudding']);
});

test('bấm lại topping đang chọn thì bỏ chọn', () => {
  assert.deepEqual(toggleTopping(['tran-chau', 'pudding'], 'tran-chau'), ['pudding']);
});

test('không sửa mảng cũ', () => {
  const before = ['tran-chau'] as const;
  toggleTopping(before, 'pudding');
  assert.deepEqual(before, ['tran-chau']);
});
