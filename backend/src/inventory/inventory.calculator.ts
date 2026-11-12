// Phần tính toán thuần (không truy cập DB) cho tồn kho theo ly.
// 1 ly tiêu hao: (công thức của món × hệ số size) + (công thức của từng topping).
import type { Prisma } from '@prisma/client';

export type DrinkSize = 'S' | 'M' | 'L';

/** Giá trị Decimal của Prisma cũng có thể là number/string tuỳ nguồn (raw SQL hoặc ORM). */
export type DecimalLike = Prisma.Decimal | number | string;

/** Một dòng trong đơn cần tính nguyên liệu. */
export interface ItemForStock {
  productId: string;
  size: DrinkSize;
  toppings: string[];
  qty: number;
}

export interface IngredientRef {
  id: number;
  name: string;
  unit: string;
}

export interface RecipeLineRecord {
  ingredient_id: number;
  /** Lượng cho 1 ly size M. */
  quantity: DecimalLike;
  ingredient: IngredientRef;
}

export interface RecipeRecord {
  product_id: number;
  size_factor_s: DecimalLike;
  size_factor_m: DecimalLike;
  size_factor_l: DecimalLike;
  ingredients: RecipeLineRecord[];
}

export interface ToppingLineRecord {
  ingredient_id: number;
  /** Lượng cho 1 phần topping. */
  quantity: DecimalLike;
  ingredient: IngredientRef;
}

export interface ToppingRecord {
  id: number;
  name: string;
  ingredients: ToppingLineRecord[];
}

/** Nguyên liệu cần cho cả đơn, đã gộp theo ingredient_id. */
export interface ConsumptionLine {
  ingredientId: number;
  name: string;
  unit: string;
  quantity: number;
}

/** Số chữ số thập phân của cột ingredients.quantity / reserved (DECIMAL(12,3)). */
export const STOCK_PRECISION = 3;

/** Làm tròn 3 chữ số thập phân, tránh sai số dấu phẩy động khi cộng dồn. */
export const roundStock = (value: number): number =>
  Math.round(value * 10 ** STOCK_PRECISION) / 10 ** STOCK_PRECISION;

/** Tên topping được so khớp không phân biệt hoa thường và khoảng trắng thừa. */
export const normalizeToppingName = (name: string): string =>
  name.trim().toLowerCase();

/** Hệ số tiêu hao theo size; dữ liệu hỏng (≤ 0) thì coi như 1 để không chia cho 0. */
export function sizeFactor(recipe: RecipeRecord, size: DrinkSize): number {
  const raw =
    size === 'S'
      ? recipe.size_factor_s
      : size === 'L'
        ? recipe.size_factor_l
        : recipe.size_factor_m;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/**
 * Tính toàn bộ nguyên liệu cần cho danh sách món trong đơn.
 * - Món không có công thức (hoặc productId không phải số) → không trừ kho.
 * - Topping không có công thức / không tồn tại → bỏ qua.
 * - Một topping trùng tên trong cùng 1 ly chỉ tính 1 lần.
 */
export function buildConsumptionPlan(input: {
  items: ItemForStock[];
  recipes: RecipeRecord[];
  toppings: ToppingRecord[];
}): ConsumptionLine[] {
  const recipeByProduct = new Map(
    input.recipes.map((recipe) => [recipe.product_id, recipe]),
  );
  const toppingByName = new Map(
    input.toppings.map((topping) => [
      normalizeToppingName(topping.name),
      topping,
    ]),
  );

  const totals = new Map<number, ConsumptionLine>();

  const add = (
    line: { ingredient_id: number; quantity: DecimalLike; ingredient: IngredientRef },
    multiplier: number,
  ): void => {
    const amount = Number(line.quantity) * multiplier;
    if (!Number.isFinite(amount) || amount <= 0) return;
    const current = totals.get(line.ingredient_id);
    if (current) {
      current.quantity += amount;
      return;
    }
    totals.set(line.ingredient_id, {
      ingredientId: line.ingredient_id,
      name: line.ingredient.name,
      unit: line.ingredient.unit,
      quantity: amount,
    });
  };

  for (const item of input.items) {
    const cups = Math.max(1, Math.floor(Number(item.qty) || 1));
    const parsedProductId = Number(item.productId);
    const recipe = Number.isInteger(parsedProductId)
      ? recipeByProduct.get(parsedProductId)
      : undefined;

    if (recipe) {
      const factor = sizeFactor(recipe, item.size);
      for (const line of recipe.ingredients) add(line, factor * cups);
    }

    const seenToppings = new Set<string>();
    for (const rawTopping of item.toppings ?? []) {
      const key = normalizeToppingName(rawTopping);
      if (!key || seenToppings.has(key)) continue;
      seenToppings.add(key);
      const topping = toppingByName.get(key);
      if (!topping) continue;
      for (const line of topping.ingredients) add(line, cups);
    }
  }

  return [...totals.values()]
    .map((line) => ({ ...line, quantity: roundStock(line.quantity) }))
    .sort((a, b) => a.ingredientId - b.ingredientId);
}

/** Dòng nguyên liệu đầu tiên không đủ hàng, hoặc null nếu đủ hết. */
export function findShortage(
  plan: ConsumptionLine[],
  stock: Map<number, number>,
): ConsumptionLine | null {
  for (const line of plan) {
    const available = stock.get(line.ingredientId) ?? 0;
    // +1e-9: 18.000000001 không được coi là thiếu so với 18.
    if (available + 1e-9 < line.quantity) return line;
  }
  return null;
}

/**
 * Số ly tối đa làm được với lượng nguyên liệu còn lại.
 * `cups = null` khi không có dòng nguyên liệu nào (món không có công thức → không giới hạn).
 */
export function maxCupsFromLines(
  lines: Array<{ ingredientId: number; name: string; quantity: number }>,
  stock: Map<number, number>,
): { cups: number | null; limitingIngredient: string | null } {
  let cups: number | null = null;
  let limitingIngredient: string | null = null;

  for (const line of lines) {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) continue;
    const available = stock.get(line.ingredientId) ?? 0;
    const possible = Math.floor(available / line.quantity + 1e-9);
    if (cups === null || possible < cups) {
      cups = possible;
      limitingIngredient = line.name;
    }
  }

  return { cups, limitingIngredient };
}
