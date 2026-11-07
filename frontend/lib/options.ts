// Task 4.2: xử lý lựa chọn topping.
import type { ToppingId } from './pricing.ts';

/** Bấm vào topping: đang chọn thì bỏ, chưa chọn thì thêm. Giữ thứ tự lúc chọn. */
export function toggleTopping(selected: readonly ToppingId[], id: ToppingId): ToppingId[] {
  return selected.includes(id) ? selected.filter((t) => t !== id) : [...selected, id];
}
