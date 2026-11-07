// Task 5.3: Tính tổng tiền và số lượng giỏ hàng (Tùng phụ trách).
// Kết hợp hỗ trợ Task 5.1 & 5.2 lưu state, thêm/sửa/xóa và badge số lượng.
import { calculatePrice, type Size, type ToppingId } from './pricing.ts';

export interface CartItem {
  id: string; // Khóa duy nhất: `${productId}-${size}-${toppingsSorted.join(',')}`
  productId: number;
  name: string;
  imageUrl: string;
  basePrice: number;
  size: Size;
  toppings: ToppingId[];
  quantity: number;
  unitPrice: number; // Giá 1 ly sau size + topping
  totalPrice: number; // unitPrice * quantity
}

/** Tạo khóa duy nhất cho 1 món dựa vào id, size và topping đã chọn (để cộng dồn số lượng). */
export function generateCartItemId(productId: number, size: Size, toppings: readonly string[]): string {
  const sorted = [...toppings].sort().join(',');
  return `${productId}-${size}-${sorted}`;
}

/** Task 5.3: Tự động tính tổng số lượng ly (badge) và tổng tiền toàn bộ giỏ hàng. */
export function calculateCartTotals(items: readonly CartItem[]): { totalItems: number; totalPrice: number } {
  return items.reduce(
    (acc, item) => ({
      totalItems: acc.totalItems + Math.max(0, item.quantity),
      totalPrice: acc.totalPrice + Math.max(0, item.totalPrice),
    }),
    { totalItems: 0, totalPrice: 0 },
  );
}

/** Thêm món vào giỏ: trùng ID (cùng món, size, topping) thì cộng dồn số lượng. */
export function addItemToCart(
  currentItems: readonly CartItem[],
  newItem: {
    productId: number;
    name: string;
    imageUrl?: string;
    basePrice: number;
    size: Size;
    toppings: ToppingId[];
    quantity?: number;
  },
): CartItem[] {
  const qty = Math.max(1, Math.floor(newItem.quantity ?? 1));
  const id = generateCartItemId(newItem.productId, newItem.size, newItem.toppings);
  const unitPrice = calculatePrice(newItem.basePrice, newItem.size, newItem.toppings, 1);

  const existingIndex = currentItems.findIndex((item) => item.id === id);

  if (existingIndex >= 0) {
    return currentItems.map((item, index) => {
      if (index !== existingIndex) return item;
      const newQuantity = item.quantity + qty;
      return {
        ...item,
        quantity: newQuantity,
        totalPrice: unitPrice * newQuantity,
      };
    });
  }

  const created: CartItem = {
    id,
    productId: newItem.productId,
    name: newItem.name,
    imageUrl: newItem.imageUrl ?? '',
    basePrice: newItem.basePrice,
    size: newItem.size,
    toppings: [...newItem.toppings],
    quantity: qty,
    unitPrice,
    totalPrice: unitPrice * qty,
  };

  return [...currentItems, created];
}

/** Sửa số lượng của 1 món trong giỏ (nếu quantity <= 0 thì tự động xóa dòng). */
export function updateItemQuantity(currentItems: readonly CartItem[], id: string, quantity: number): CartItem[] {
  const q = Math.floor(quantity);
  if (q <= 0) {
    return currentItems.filter((i) => i.id !== id);
  }
  return currentItems.map((item) => {
    if (item.id !== id) return item;
    return {
      ...item,
      quantity: q,
      totalPrice: item.unitPrice * q,
    };
  });
}

/** Xóa một món ra khỏi giỏ. */
export function removeItemFromCart(currentItems: readonly CartItem[], id: string): CartItem[] {
  return currentItems.filter((i) => i.id !== id);
}

