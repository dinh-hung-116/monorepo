// Test Task 5.3: Tính tổng tiền và badge số lượng giỏ hàng (Tùng).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addItemToCart,
  calculateCartTotals,
  generateCartItemId,
  removeItemFromCart,
  updateItemQuantity,
  type CartItem,
} from './cart.ts';

test('calculateCartTotals tính đúng tổng số lượng ly (badge) và tổng tiền', () => {
  const items: CartItem[] = [
    {
      id: '1-M-tran-chau',
      productId: 1,
      name: 'Cà phê đen',
      imageUrl: '',
      basePrice: 20000,
      size: 'M', // 20k + 5k = 25k
      toppings: ['tran-chau'], // +7k = 32k
      unitPrice: 32000,
      quantity: 2,
      totalPrice: 64000,
    },
    {
      id: '2-S-',
      productId: 2,
      name: 'Cà phê sữa',
      imageUrl: '',
      basePrice: 25000,
      size: 'S',
      toppings: [],
      unitPrice: 25000,
      quantity: 1,
      totalPrice: 25000,
    },
  ];

  const totals = calculateCartTotals(items);
  // Tổng số lượng ly (badge) = 2 + 1 = 3
  assert.equal(totals.totalItems, 3);
  // Tổng tiền = 64.000 + 25.000 = 89.000 đ
  assert.equal(totals.totalPrice, 89000);
});

test('calculateCartTotals trả về 0 khi giỏ hàng trống', () => {
  const totals = calculateCartTotals([]);
  assert.equal(totals.totalItems, 0);
  assert.equal(totals.totalPrice, 0);
});

test('addItemToCart cộng dồn số lượng khi cùng món, size và topping', () => {
  let cart: CartItem[] = [];

  // Thêm 1 ly size M trân châu
  cart = addItemToCart(cart, {
    productId: 1,
    name: 'Cà phê đen',
    basePrice: 20000,
    size: 'M',
    toppings: ['tran-chau'],
    quantity: 1,
  });

  assert.equal(cart.length, 1);
  assert.equal(cart[0].quantity, 1);
  assert.equal(cart[0].totalPrice, 32000);

  // Thêm tiếp 2 ly cùng món, cùng size M, cùng trân châu
  cart = addItemToCart(cart, {
    productId: 1,
    name: 'Cà phê đen',
    basePrice: 20000,
    size: 'M',
    toppings: ['tran-chau'],
    quantity: 2,
  });

  // Vẫn 1 dòng nhưng số lượng tăng lên 3, tổng tiền x3
  assert.equal(cart.length, 1);
  assert.equal(cart[0].quantity, 3);
  assert.equal(cart[0].totalPrice, 96000);
  assert.equal(calculateCartTotals(cart).totalItems, 3);
});

test('updateItemQuantity cập nhật lại số lượng và tự xóa khi quantity <= 0', () => {
  let cart = addItemToCart([], {
    productId: 2,
    name: 'Cà phê sữa',
    basePrice: 25000,
    size: 'S',
    toppings: [],
    quantity: 2,
  });

  const itemId = cart[0].id;
  // Sửa thành 5 ly
  cart = updateItemQuantity(cart, itemId, 5);
  assert.equal(cart[0].quantity, 5);
  assert.equal(cart[0].totalPrice, 125000);

  // Sửa thành 0 -> tự xóa
  cart = updateItemQuantity(cart, itemId, 0);
  assert.equal(cart.length, 0);
  assert.equal(calculateCartTotals(cart).totalItems, 0);
});

test('removeItemFromCart xóa đúng món được chọn', () => {
  let cart = addItemToCart([], {
    productId: 1,
    name: 'Món 1',
    basePrice: 20000,
    size: 'S',
    toppings: [],
  });
  cart = addItemToCart(cart, {
    productId: 2,
    name: 'Món 2',
    basePrice: 25000,
    size: 'S',
    toppings: [],
  });

  assert.equal(cart.length, 2);
  cart = removeItemFromCart(cart, cart[0].id);
  assert.equal(cart.length, 1);
  assert.equal(cart[0].productId, 2);
});

