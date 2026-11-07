// Task 4.3: logic tính giá theo size và topping.
// Giá ở đây chỉ để khách xem trước; khi tạo đơn (Task 6) backend sẽ tự tính lại.

export type Size = 'S' | 'M' | 'L';

/** Phụ thu theo size (VND). */
export const SIZES: { size: Size; extra: number }[] = [
  { size: 'S', extra: 0 },
  { size: 'M', extra: 5000 },
  { size: 'L', extra: 10000 },
];

/** Topping dùng chung cho mọi món. */
export const TOPPINGS = [
  { id: 'tran-chau', name: 'Trân châu', price: 7000 },
  { id: 'pudding', name: 'Pudding', price: 8000 },
  { id: 'kem-cheese', name: 'Kem cheese', price: 10000 },
] as const;

export type ToppingId = (typeof TOPPINGS)[number]['id'];

/**
 * Giá 1 ly = giá gốc + phụ thu size + tổng topping; nhân số lượng.
 * Topping lạ bị bỏ qua, chọn trùng chỉ tính 1 lần; số lượng < 1 tính là 1.
 */
export function calculatePrice(basePrice: number, size: Size, toppingIds: readonly string[], quantity = 1): number {
  const sizeExtra = SIZES.find((s) => s.size === size)?.extra ?? 0;
  const unique = new Set(toppingIds);
  const toppingTotal = TOPPINGS.filter((t) => unique.has(t.id)).reduce((sum, t) => sum + t.price, 0);
  return (basePrice + sizeExtra + toppingTotal) * Math.max(1, Math.floor(quantity));
}

/** 35000 → "35.000 đ" */
export const formatVnd = (n: number) => `${n.toLocaleString('vi-VN')} đ`;
