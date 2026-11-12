import { describe, expect, it } from 'vitest';
import {
  buildConsumptionPlan,
  findShortage,
  maxCupsFromLines,
  normalizeToppingName,
  roundStock,
  sizeFactor,
  type RecipeRecord,
  type ToppingRecord,
} from './inventory.calculator.js';

const ingredient = (id: number, name: string, unit = 'g') => ({ id, name, unit });

const COFFEE = ingredient(1, 'Cà phê rang xay');
const MILK = ingredient(2, 'Sữa đặc', 'ml');
const ICE = ingredient(3, 'Đá');
const BUBBLE = ingredient(4, 'Trân châu');

const recipe: RecipeRecord = {
  product_id: 2,
  size_factor_s: '0.800',
  size_factor_m: 1,
  size_factor_l: 1.25,
  ingredients: [
    { ingredient_id: COFFEE.id, quantity: '18', ingredient: COFFEE },
    { ingredient_id: MILK.id, quantity: '30', ingredient: MILK },
    { ingredient_id: ICE.id, quantity: '150', ingredient: ICE },
  ],
};

const topping: ToppingRecord = {
  id: 1,
  name: 'Trân châu',
  ingredients: [
    { ingredient_id: BUBBLE.id, quantity: '50', ingredient: BUBBLE },
  ],
};

describe('inventory calculator', () => {
  it('hệ số size: S = 0.8, M = 1, L = 1.25 và dữ liệu hỏng thì quay về 1', () => {
    expect(sizeFactor(recipe, 'S')).toBe(0.8);
    expect(sizeFactor(recipe, 'M')).toBe(1);
    expect(sizeFactor(recipe, 'L')).toBe(1.25);
    expect(
      sizeFactor({ ...recipe, size_factor_m: 0 }, 'M'),
    ).toBe(1);
  });

  it('1 ly size M: lấy đúng công thức, chưa nhân gì thêm', () => {
    const plan = buildConsumptionPlan({
      items: [{ productId: '2', size: 'M', toppings: [], qty: 1 }],
      recipes: [recipe],
      toppings: [topping],
    });

    expect(plan).toEqual([
      { ingredientId: 1, name: 'Cà phê rang xay', unit: 'g', quantity: 18 },
      { ingredientId: 2, name: 'Sữa đặc', unit: 'ml', quantity: 30 },
      { ingredientId: 3, name: 'Đá', unit: 'g', quantity: 150 },
    ]);
  });

  it('size L nhân 1.25 và số lượng ly nhân tiếp', () => {
    const plan = buildConsumptionPlan({
      items: [{ productId: '2', size: 'L', toppings: [], qty: 2 }],
      recipes: [recipe],
      toppings: [],
    });

    expect(plan.find((l) => l.ingredientId === COFFEE.id)?.quantity).toBe(45);
    expect(plan.find((l) => l.ingredientId === MILK.id)?.quantity).toBe(75);
  });

  it('topping cộng thêm nguyên liệu, không phụ thuộc size ly', () => {
    const plan = buildConsumptionPlan({
      items: [
        { productId: '2', size: 'L', toppings: ['Trân châu'], qty: 2 },
      ],
      recipes: [recipe],
      toppings: [topping],
    });

    // 50g × 2 ly, size không ảnh hưởng topping
    expect(plan.find((l) => l.ingredientId === BUBBLE.id)?.quantity).toBe(100);
  });

  it('topping trùng tên chỉ tính 1 lần, tên lạ bị bỏ qua', () => {
    const plan = buildConsumptionPlan({
      items: [
        {
          productId: '2',
          size: 'M',
          toppings: ['Trân châu', ' trân châu ', 'Không tồn tại'],
          qty: 1,
        },
      ],
      recipes: [recipe],
      toppings: [topping],
    });

    expect(plan.find((l) => l.ingredientId === BUBBLE.id)?.quantity).toBe(50);
  });

  it('món không có công thức thì không sinh dòng nguyên liệu nào', () => {
    const plan = buildConsumptionPlan({
      items: [{ productId: '99', size: 'M', toppings: [], qty: 3 }],
      recipes: [recipe],
      toppings: [],
    });

    expect(plan).toEqual([]);
  });

  it('gộp nhiều dòng đơn dùng chung nguyên liệu', () => {
    const plan = buildConsumptionPlan({
      items: [
        { productId: '2', size: 'M', toppings: [], qty: 1 },
        { productId: '2', size: 'M', toppings: [], qty: 2 },
      ],
      recipes: [recipe],
      toppings: [],
    });

    expect(plan.find((l) => l.ingredientId === COFFEE.id)?.quantity).toBe(54);
  });

  it('findShortage báo đúng nguyên liệu thiếu và bỏ qua sai số dấu phẩy động', () => {
    const plan = buildConsumptionPlan({
      items: [{ productId: '2', size: 'M', toppings: [], qty: 1 }],
      recipes: [recipe],
      toppings: [],
    });

    expect(findShortage(plan, new Map([[1, 18], [2, 29], [3, 1000]]))).toMatchObject({
      ingredientId: MILK.id,
    });
    expect(findShortage(plan, new Map([[1, 18.0000000001], [2, 30], [3, 150]]))).toBeNull();
  });

  it('maxCups lấy nguyên liệu sắp hết nhất làm giới hạn', () => {
    const plan = buildConsumptionPlan({
      items: [{ productId: '2', size: 'M', toppings: [], qty: 1 }],
      recipes: [recipe],
      toppings: [],
    });

    // 900 / 18 = 50 ly; 300 / 30 = 10 ly; 5000 / 150 = 33 ly → chặn ở sữa đặc
    const result = maxCupsFromLines(
      plan,
      new Map([
        [COFFEE.id, 900],
        [MILK.id, 300],
        [ICE.id, 5000],
      ]),
    );

    expect(result).toEqual({ cups: 10, limitingIngredient: 'Sữa đặc' });
  });

  it('không có dòng nguyên liệu nào thì số ly là không giới hạn (null)', () => {
    expect(maxCupsFromLines([], new Map())).toEqual({
      cups: null,
      limitingIngredient: null,
    });
  });

  it('chuẩn hoá tên topping và làm tròn 3 chữ số', () => {
    expect(normalizeToppingName('  Kem Cheese ')).toBe('kem cheese');
    expect(roundStock(0.1 + 0.2)).toBe(0.3);
  });
});
