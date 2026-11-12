// Tồn kho theo ly: giữ chỗ khi tạo đơn, trừ thật khi thanh toán thành công, trả lại khi thanh toán lỗi.
//
// Ghi kho dùng OPTIMISTIC LOCKING: mỗi dòng ingredients có cột "version"; mọi UPDATE đều kèm
// điều kiện `version = <giá trị đã đọc>`. Nếu một request khác vừa sửa dòng đó, UPDATE khớp 0 dòng
// → đọc lại và thử lại (tối đa MAX_STOCK_RETRIES lần). Nhờ vậy không cần SELECT ... FOR UPDATE,
// và hai đơn đồng thời không thể cùng bán phần nguyên liệu cuối cùng.
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  buildConsumptionPlan,
  findShortage,
  maxCupsFromLines,
  type ConsumptionLine,
  type DrinkSize,
  type ItemForStock,
  type RecipeRecord,
  type ToppingRecord,
} from './inventory.calculator.js';

export interface IngredientStock {
  id: number;
  name: string;
  unit: string;
  /** Lượng thực còn trong kho. */
  onHand: number;
  /** Lượng đang giữ cho các đơn chưa thanh toán xong. */
  reserved: number;
  /** onHand − reserved: lượng bán được ngay. */
  available: number;
}

export interface ProductAvailability {
  productId: number;
  productName: string;
  /** Số ly còn làm được theo từng size; null = món chưa có công thức nên không giới hạn. */
  cups: Record<DrinkSize, number | null>;
  limitingIngredient: Record<DrinkSize, string | null>;
}

export interface ToppingAvailability {
  toppingId: number;
  name: string;
  /** Số phần topping còn làm được; null = chưa có công thức nên không giới hạn. */
  maxPortions: number | null;
  limitingIngredient: string | null;
}

export interface AvailabilitySnapshot {
  ingredients: IngredientStock[];
  products: ProductAvailability[];
  toppings: ToppingAvailability[];
}

export interface ItemAvailability {
  available: boolean;
  /** Số ly tối đa làm được của món này (đã tính size + topping); null = không giới hạn. */
  maxCups: number | null;
  limitingIngredient: string | null;
  shortage: ConsumptionLine | null;
}

/** Số lần thử lại khi UPDATE kho bị đụng độ version. */
const MAX_STOCK_RETRIES = 8;

type IngredientRow = {
  id: number;
  name: string;
  unit: string;
  quantity: Prisma.Decimal;
  reserved: Prisma.Decimal;
  version: number;
};

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Đọc công thức của tất cả món (kèm hệ số size). */
  private loadRecipes(): Promise<RecipeRecord[]> {
    return this.prisma.recipes.findMany({
      include: { ingredients: { include: { ingredient: true } } },
    }) as unknown as Promise<RecipeRecord[]>;
  }

  /** Đọc công thức của tất cả topping. */
  private loadToppings(): Promise<ToppingRecord[]> {
    return this.prisma.toppings.findMany({
      include: { ingredients: { include: { ingredient: true } } },
    }) as unknown as Promise<ToppingRecord[]>;
  }

  /** Lượng còn bán được của từng nguyên liệu. */
  async getStock(): Promise<IngredientStock[]> {
    const rows = await this.prisma.ingredients.findMany({
      orderBy: { id: 'asc' },
    });
    return rows.map((row) => this.toIngredientStock(row));
  }

  /** Nguyên liệu cần cho danh sách món (chưa kiểm tra kho). */
  async planFor(items: ItemForStock[]): Promise<ConsumptionLine[]> {
    const [recipes, toppings] = await Promise.all([
      this.loadRecipes(),
      this.loadToppings(),
    ]);
    return buildConsumptionPlan({ items, recipes, toppings });
  }

  /**
   * Kiểm tra trước khi mở transaction để báo lỗi sớm (409) khi chắc chắn thiếu hàng.
   * Chỉ đọc dữ liệu; tính đúng đắn cuối cùng do bước giữ chỗ trong transaction bảo đảm.
   */
  async assertPlanAvailable(plan: ConsumptionLine[]): Promise<void> {
    if (plan.length === 0) return;

    const stock = new Map(
      (await this.getStock()).map((row) => [row.id, row.available]),
    );
    const shortage = findShortage(plan, stock);
    if (shortage) throw this.buildShortageError(shortage, stock);
  }

  /**
   * Giữ chỗ nguyên liệu cho một đơn — PHẢI gọi bên trong transaction tạo đơn,
   * để đơn và phần giữ chỗ cùng thành công hoặc cùng rollback.
   */
  async reserveInTransaction(
    tx: Prisma.TransactionClient,
    orderId: number,
    plan: ConsumptionLine[],
  ): Promise<void> {
    for (const line of plan) {
      await this.reserveOne(tx, line);
      await tx.order_ingredient_reservations.create({
        data: {
          order_id: orderId,
          ingredient_id: line.ingredientId,
          quantity: new Prisma.Decimal(line.quantity.toFixed(3)),
        },
      });
    }
  }

  /**
   * Thanh toán thành công: trừ thật khỏi kho (quantity −= cần dùng, reserved −= giữ chỗ).
   * Idempotent nhờ điều kiện consumed_at IS NULL — VNPay gọi lại nhiều lần vẫn chỉ trừ 1 lần.
   */
  async consumeForOrder(orderId: number): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const reservations = await tx.order_ingredient_reservations.findMany({
          where: { order_id: orderId, consumed_at: null },
        });

        for (const row of reservations) {
          const quantity = Number(row.quantity);
          await this.applyStockChange(tx, row.ingredient_id, {
            quantityDelta: -quantity,
            // Đơn từng bị coi là thất bại thì reserved đã trả lại: chỉ cần trừ quantity.
            reservedDelta: row.released_at === null ? -quantity : 0,
          });
          await tx.order_ingredient_reservations.update({
            where: { id: row.id },
            data: { consumed_at: new Date() },
          });
        }
      },
      { timeout: 15_000, maxWait: 5_000 },
    );
  }

  /**
   * Thanh toán lỗi / đơn bị huỷ: trả lại phần đã giữ chỗ (reserved −= cần dùng).
   * Idempotent nhờ released_at IS NULL.
   */
  async releaseForOrder(orderId: number): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const reservations = await tx.order_ingredient_reservations.findMany({
          where: {
            order_id: orderId,
            consumed_at: null,
            released_at: null,
          },
        });

        for (const row of reservations) {
          await this.applyStockChange(tx, row.ingredient_id, {
            quantityDelta: 0,
            reservedDelta: -Number(row.quantity),
          });
          await tx.order_ingredient_reservations.update({
            where: { id: row.id },
            data: { released_at: new Date() },
          });
        }
      },
      { timeout: 15_000, maxWait: 5_000 },
    );
  }

  /** Toàn bộ tồn kho + số ly còn bán được của từng món và từng topping. */
  async getAvailability(): Promise<AvailabilitySnapshot> {
    const [products, recipes, toppings, stock] = await Promise.all([
      this.prisma.products.findMany({ orderBy: { id: 'asc' } }),
      this.loadRecipes(),
      this.loadToppings(),
      this.getStock(),
    ]);

    const stockMap = new Map(stock.map((row) => [row.id, row.available]));
    const recipeByProduct = new Map(
      recipes.map((recipe) => [recipe.product_id, recipe]),
    );

    const productAvailability: ProductAvailability[] = products.map(
      (product) => {
        const recipe = recipeByProduct.get(product.id);
        const cups: Record<DrinkSize, number | null> = {
          S: null,
          M: null,
          L: null,
        };
        const limitingIngredient: Record<DrinkSize, string | null> = {
          S: null,
          M: null,
          L: null,
        };
        if (!recipe) {
          return {
            productId: product.id,
            productName: product.name,
            cups,
            limitingIngredient,
          };
        }

        for (const size of ['S', 'M', 'L'] as DrinkSize[]) {
          const plan = buildConsumptionPlan({
            items: [
              { productId: String(product.id), size, toppings: [], qty: 1 },
            ],
            recipes,
            toppings: [],
          });
          const result = maxCupsFromLines(plan, stockMap);
          cups[size] = result.cups;
          limitingIngredient[size] = result.limitingIngredient;
        }

        return {
          productId: product.id,
          productName: product.name,
          cups,
          limitingIngredient,
        };
      },
    );

    const toppingAvailability: ToppingAvailability[] = toppings.map(
      (topping) => {
        const lines = topping.ingredients.map((line) => ({
          ingredientId: line.ingredient_id,
          name: line.ingredient.name,
          quantity: Number(line.quantity),
        }));
        const result = maxCupsFromLines(lines, stockMap);
        return {
          toppingId: topping.id,
          name: topping.name,
          maxPortions: result.cups,
          limitingIngredient: result.limitingIngredient,
        };
      },
    );

    return {
      ingredients: stock,
      products: productAvailability,
      toppings: toppingAvailability,
    };
  }

  /** Kiểm tra nhanh "còn đủ nguyên liệu cho N ly món này không". */
  async checkItem(params: {
    productId: string;
    size: DrinkSize;
    toppings: string[];
    qty: number;
  }): Promise<ItemAvailability> {
    if (!/^\d+$/.test(params.productId)) {
      throw new BadRequestException('productId phải là số');
    }
    const qty = Math.max(1, Math.floor(params.qty || 1));
    const plan = await this.planFor([{ ...params, qty: 1 }]);
    const stock = new Map(
      (await this.getStock()).map((row) => [row.id, row.available]),
    );

    const perCup = plan.map((line) => ({ ...line }));
    const shortage = findShortage(
      plan.map((line) => ({ ...line, quantity: line.quantity * qty })),
      stock,
    );
    const { cups, limitingIngredient } = maxCupsFromLines(perCup, stock);

    return {
      available: shortage === null,
      maxCups: cups,
      limitingIngredient,
      shortage,
    };
  }

  /** Kiểm kê: đặt lại số lượng tồn kho. Không được thấp hơn phần đang giữ chỗ. */
  async setStock(
    ingredientId: number,
    quantity: number,
  ): Promise<IngredientStock> {
    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new BadRequestException('Số lượng tồn kho phải là số không âm');
    }

    return this.prisma.$transaction(
      async (tx) => {
        for (let attempt = 1; attempt <= MAX_STOCK_RETRIES; attempt++) {
          const row = await this.readIngredient(tx, ingredientId);
          const reserved = Number(row.reserved);
          if (quantity + 1e-9 < reserved) {
            throw new ConflictException(
              `Không thể đặt ${quantity}${row.unit} vì đang giữ ${reserved}${row.unit} cho các đơn chưa thanh toán`,
            );
          }

          const changed = await tx.$executeRaw`
            UPDATE "ingredients"
               SET "quantity" = ${quantity}::numeric,
                   "version" = "version" + 1,
                   "updated_at" = NOW()
             WHERE "id" = ${ingredientId}
               AND "version" = ${row.version}
               AND "reserved" <= ${quantity}::numeric
          `;
          if (changed === 1) {
            return this.toIngredientStock({
              ...row,
              quantity: new Prisma.Decimal(quantity),
            });
          }
          await this.retryDelay(attempt);
        }

        throw new ConflictException(
          'Kho đang được cập nhật đồng thời, vui lòng thử lại',
        );
      },
      { timeout: 15_000, maxWait: 5_000 },
    );
  }

  /** Nhập thêm nguyên liệu (cộng dồn), dùng khi nhận hàng từ nhà cung cấp. */
  async restock(
    ingredientId: number,
    amount: number,
  ): Promise<IngredientStock> {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Số lượng nhập phải lớn hơn 0');
    }

    return this.prisma.$transaction(
      async (tx) => {
        for (let attempt = 1; attempt <= MAX_STOCK_RETRIES; attempt++) {
          const row = await this.readIngredient(tx, ingredientId);

          const changed = await tx.$executeRaw`
            UPDATE "ingredients"
               SET "quantity" = "quantity" + ${amount}::numeric,
                   "version" = "version" + 1,
                   "updated_at" = NOW()
             WHERE "id" = ${ingredientId}
               AND "version" = ${row.version}
          `;
          if (changed === 1) {
            return this.toIngredientStock({
              ...row,
              quantity: new Prisma.Decimal(Number(row.quantity) + amount),
            });
          }
          await this.retryDelay(attempt);
        }

        throw new ConflictException(
          'Kho đang được cập nhật đồng thời, vui lòng thử lại',
        );
      },
      { timeout: 15_000, maxWait: 5_000 },
    );
  }

  /**
   * Giữ chỗ một nguyên liệu bằng optimistic locking:
   * đọc version → UPDATE có điều kiện version + kiểm tra đủ hàng → nếu 0 dòng thì đọc lại và thử lại.
   */
  private async reserveOne(
    tx: Prisma.TransactionClient,
    line: ConsumptionLine,
  ): Promise<void> {
    for (let attempt = 1; attempt <= MAX_STOCK_RETRIES; attempt++) {
      const row = await this.readIngredient(tx, line.ingredientId);
      const available = Number(row.quantity) - Number(row.reserved);
      if (available + 1e-9 < line.quantity) {
        throw new ConflictException(
          `Không đủ nguyên liệu: ${line.name} (cần ${line.quantity}${line.unit}, còn ${available}${line.unit})`,
        );
      }

      const changed = await tx.$executeRaw`
        UPDATE "ingredients"
           SET "reserved" = "reserved" + ${line.quantity}::numeric,
               "version" = "version" + 1,
               "updated_at" = NOW()
         WHERE "id" = ${line.ingredientId}
           AND "version" = ${row.version}
           AND "quantity" - "reserved" >= ${line.quantity}::numeric
      `;
      if (changed === 1) return;

      await this.retryDelay(attempt);
    }

    throw new ConflictException(
      'Kho đang được cập nhật đồng thời, vui lòng thử lại',
    );
  }

  /** Cộng/trừ kho và phần giữ chỗ của một nguyên liệu, có thử lại khi đụng version. */
  private async applyStockChange(
    tx: Prisma.TransactionClient,
    ingredientId: number,
    delta: { quantityDelta: number; reservedDelta: number },
  ): Promise<void> {
    for (let attempt = 1; attempt <= MAX_STOCK_RETRIES; attempt++) {
      const row = await this.readIngredient(tx, ingredientId);

      const changed = await tx.$executeRaw`
        UPDATE "ingredients"
           SET "quantity" = GREATEST("quantity" + ${delta.quantityDelta}::numeric, 0),
               "reserved" = GREATEST("reserved" + ${delta.reservedDelta}::numeric, 0),
               "version" = "version" + 1,
               "updated_at" = NOW()
         WHERE "id" = ${ingredientId}
           AND "version" = ${row.version}
      `;
      if (changed === 1) return;

      await this.retryDelay(attempt);
    }

    throw new ConflictException(
      'Kho đang được cập nhật đồng thời, vui lòng thử lại',
    );
  }

  private async readIngredient(
    tx: Prisma.TransactionClient,
    ingredientId: number,
  ): Promise<IngredientRow> {
    const rows = await tx.$queryRaw<IngredientRow[]>`
      SELECT "id", "name", "unit", "quantity", "reserved", "version"
        FROM "ingredients"
       WHERE "id" = ${ingredientId}
    `;

    const row = rows[0];
    if (!row) {
      throw new NotFoundException(`Không tìm thấy nguyên liệu ${ingredientId}`);
    }
    return row;
  }

  /** Chờ một chút trước khi thử lại (tăng dần, có nhiễu) để hai transaction không đụng nhau liên tục. */
  private async retryDelay(attempt: number): Promise<void> {
    const base = Math.min(5 * attempt, 40);
    const jitter = Math.random() * 10;
    await new Promise((resolve) => setTimeout(resolve, base + jitter));
  }

  private toIngredientStock(row: {
    id: number;
    name: string;
    unit: string;
    quantity: Prisma.Decimal | number | string;
    reserved: Prisma.Decimal | number | string;
  }): IngredientStock {
    const onHand = Number(row.quantity);
    const reserved = Number(row.reserved);
    return {
      id: row.id,
      name: row.name,
      unit: row.unit,
      onHand,
      reserved,
      available: Math.max(0, onHand - reserved),
    };
  }

  private buildShortageError(
    shortage: ConsumptionLine,
    stock: Map<number, number>,
  ): ConflictException {
    const available = stock.get(shortage.ingredientId) ?? 0;
    return new ConflictException(
      `Không đủ nguyên liệu: ${shortage.name} (cần ${shortage.quantity}${shortage.unit}, còn ${available}${shortage.unit})`,
    );
  }
}
