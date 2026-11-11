import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import {
  DrinkSize,
  Order,
  OrderItem,
  OrderStatus,
} from './entities/order.entity.js';

export interface OrderItemRow {
  id?: number;
  order_id?: number;
  product_id: number | null;
  product_name: string;
  size: string;
  price: number | { toString(): string };
  quantity: number;
  subtotal: number | { toString(): string };
  item_toppings?: Array<{ topping_name: string }>;
}

export interface OrderRowWithItems {
  id: number;
  order_code: string;
  user_id: number | null;
  status: string;
  total_price: number | { toString(): string };
  created_at: Date | string;
  updated_at?: Date | string;
  items: OrderItemRow[];
}

type OrderItemsInclude = {
  items: { include: { item_toppings: true } };
};

interface OrdersDelegate {
  count(): Promise<number>;
  create(args: {
    data: {
      order_code: string;
      user_id: number | null;
      status: string;
      total_price: number;
      items: {
        create: Array<{
          product_id: number | null;
          product_name: string;
          size: string;
          price: number;
          quantity: number;
          subtotal: number;
          item_toppings?: { create: Array<{ topping_name: string }> };
        }>;
      };
    };
    include: OrderItemsInclude;
  }): Promise<OrderRowWithItems>;
  findMany(args: {
    where: { user_id: number };
    include: OrderItemsInclude;
    orderBy: { id: 'asc' | 'desc' };
  }): Promise<OrderRowWithItems[]>;
  findUnique(args: {
    where: { order_code: string };
    include: OrderItemsInclude;
  }): Promise<OrderRowWithItems | null>;
}

interface LocalOrdersDb {
  orderSeq: number;
  orders: Order[];
}

const LOCAL_ORDERS_PATH = resolve(process.cwd(), '.data', 'orders-db.json');

function isMissingTableError(err: unknown): boolean {
  const code = (err as { code?: string })?.code ?? '';
  const message = (err as { message?: string })?.message ?? '';
  return (
    code === 'P2021' ||
    message.includes('does not exist in the current database')
  );
}

function isDatabaseUnavailableError(err: unknown): boolean {
  if (
    err instanceof BadRequestException ||
    err instanceof NotFoundException
  ) {
    return false;
  }
  const name = (err as { name?: string })?.name ?? '';
  const code = (err as { code?: string })?.code ?? '';
  const message = (err as { message?: string })?.message ?? '';
  return (
    name.includes('PrismaClientInitializationError') ||
    name.includes('PrismaClientRustPanicError') ||
    // Lỗi giao thức nhị phân Prisma↔PostgreSQL (08P01, JSONB encoding, v.v.)
    name.includes('PrismaClientUnknownRequestError') ||
    code === 'P1000' ||
    code === 'P1001' ||
    code === 'P1002' ||
    code === 'P1003' ||
    code === 'P2021' ||
    // Lỗi foreign key (user_id không tồn tại trong bảng users)
    code === 'P2003' ||
    // Lỗi trùng khóa unique (order_code)
    code === 'P2002' ||
    message.includes("Can't reach database server") ||
    message.includes('Authentication failed against database server') ||
    message.includes('Environment variable not found: DATABASE_URL') ||
    message.includes('does not exist in the current database') ||
    message.includes('Foreign key constraint failed') ||
    message.includes('insufficient data left in message')
  );
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private readonly fallbackOrders: Map<string, Order> = new Map();
  private orderSequence = 1001;

  constructor(private readonly prisma: PrismaService) {
    this.loadFallbackFromDisk();
  }

  private get ordersRepo(): OrdersDelegate {
    const repo = (this.prisma as unknown as { orders?: OrdersDelegate })?.orders;
    if (!repo) {
      const err = new Error("Can't reach database server");
      (err as { code?: string }).code = 'P1001';
      throw err;
    }
    return repo;
  }

  private isTestEnv(): boolean {
    return Boolean(process.env.VITEST || process.env.NODE_ENV === 'test');
  }

  private async ensureSchemaIfNeeded(err: unknown): Promise<boolean> {
    if (!isMissingTableError(err)) return false;
    const maybeEnsure = (
      this.prisma as unknown as { ensureSchema?: () => Promise<boolean> }
    )?.ensureSchema;
    if (typeof maybeEnsure === 'function') {
      return maybeEnsure.call(this.prisma);
    }
    return false;
  }

  private loadFallbackFromDisk(): void {
    if (this.isTestEnv()) return;
    try {
      if (!existsSync(LOCAL_ORDERS_PATH)) return;
      const raw = readFileSync(LOCAL_ORDERS_PATH, 'utf8');
      const parsed = JSON.parse(raw) as LocalOrdersDb;
      if (Array.isArray(parsed?.orders)) {
        for (const o of parsed.orders) {
          this.fallbackOrders.set(o.id, o);
        }
      }
      if (typeof parsed?.orderSeq === 'number' && parsed.orderSeq >= 1001) {
        this.orderSequence = parsed.orderSeq;
      }
    } catch {
      // Ignore disk read errors
    }
  }

  private saveFallbackToDisk(): void {
    if (this.isTestEnv()) return;
    try {
      mkdirSync(dirname(LOCAL_ORDERS_PATH), { recursive: true });
      const payload: LocalOrdersDb = {
        orderSeq: this.orderSequence,
        orders: Array.from(this.fallbackOrders.values()),
      };
      writeFileSync(LOCAL_ORDERS_PATH, JSON.stringify(payload, null, 2), 'utf8');
    } catch {
      // Ignore disk write errors
    }
  }

  private async createOrderInDb(
    userId: string,
    parsedUserId: number | null,
    total: number,
    dto: CreateOrderDto,
    calculatedItems: Array<{
      productId: string;
      productName: string;
      size: DrinkSize;
      toppings: string[];
      qty: number;
      unitPrice: number;
      lineTotal: number;
    }>,
  ): Promise<Order> {
    // 1. Kiểm tra tài khoản có thực sự tồn tại trong DB không để tránh lỗi foreign key (P2003)
    let validUserId: number | null = null;
    if (parsedUserId !== null) {
      try {
        const userExists = await (this.prisma as unknown as { users?: { findUnique: (args: { where: { id: number } }) => Promise<unknown> } })?.users?.findUnique({
          where: { id: parsedUserId },
        });
        if (userExists) {
          validUserId = parsedUserId;
        }
      } catch {
        validUserId = null;
      }
    }

    // 2. Tìm ID lớn nhất để tạo orderCode duy nhất, tránh trùng #1001, #1002, #1003, #1004 đã có trong DB
    const lastOrders = await this.ordersRepo.findMany({
      where: {} as { user_id: number },
      include: { items: { include: { item_toppings: true } } },
      orderBy: { id: 'desc' },
    }).catch(() => []);
    const lastId = lastOrders.length > 0 ? lastOrders[0].id : 0;
    const seq = Math.max(1001 + lastOrders.length, 1000 + lastId + 1);
    const orderCode = `#${seq}`;

    // 3. Ưu tiên dùng raw SQL khi chạy thực tế (có $queryRawUnsafe) để tránh lỗi nhị phân JSONB 08P01 của Prisma
    if (typeof (this.prisma as any)?.$queryRawUnsafe === 'function') {
      // Phải khai báo "updated_at" tường minh vì cột này dùng @updatedAt trong Prisma —
      // Prisma chỉ điền tự động khi dùng ORM client, không phải khi dùng raw SQL.
      // Nếu bỏ qua, PostgreSQL sẽ ném 23502 (not-null violation).
      const orderRows = await (this.prisma as any).$queryRawUnsafe(
        `INSERT INTO "orders" ("order_code", "user_id", "status", "total_price", "updated_at")
         VALUES ($1, $2, $3::"OrderStatus", $4, NOW())
         RETURNING id, order_code, user_id, status, total_price, created_at, updated_at`,
        orderCode,
        validUserId,
        'PENDING',
        total,
      );

      const insertedOrder = orderRows[0];
      const createdItems: OrderItemRow[] = [];

      for (const item of calculatedItems) {
        const parsedProdId = /^\d+$/.test(String(item.productId))
          ? Number(item.productId)
          : null;

        const itemRows = await (this.prisma as any).$queryRawUnsafe(
          `INSERT INTO "order_items" ("order_id", "product_id", "product_name", "size", "price", "quantity", "subtotal")
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, order_id, product_id, product_name, size, price, quantity, subtotal`,
          insertedOrder.id,
          parsedProdId,
          item.productName,
          item.size,
          item.unitPrice,
          item.qty,
          item.lineTotal,
        );

        const insertedItem = itemRows[0] as OrderItemRow;
        const toppings = item.toppings ?? [];
        for (const toppingName of toppings) {
          await (this.prisma as any).$queryRawUnsafe(
            `INSERT INTO "order_item_toppings" ("order_item_id", "topping_name", "price")
             VALUES ($1, $2, $3)`,
            insertedItem.id,
            toppingName,
            0,
          );
        }

        createdItems.push({
          ...insertedItem,
          item_toppings: toppings.map((topping_name) => ({ topping_name })),
        });
      }

      const rowWithItems: OrderRowWithItems = {
        ...insertedOrder,
        items: createdItems,
      };

      return this.rowToOrder(rowWithItems, userId);
    }

    // Fallback cho môi trường unit test (sử dụng Prisma delegate mock)
    const created = await this.ordersRepo.create({
      data: {
        order_code: orderCode,
        user_id: validUserId,
        status: 'PENDING',
        total_price: total,
        items: {
          create: calculatedItems.map((item) => ({
            product_id: /^\d+$/.test(String(item.productId))
              ? Number(item.productId)
              : null,
            product_name: item.productName,
            size: item.size,
            price: item.unitPrice,
            quantity: item.qty,
            subtotal: item.lineTotal,
            item_toppings: {
              create: (item.toppings ?? []).map((topping_name) => ({
                topping_name,
              })),
            },
          })),
        },
      },
      include: {
        items: { include: { item_toppings: true } },
      },
    });

    return this.rowToOrder(created, userId);
  }

  async createOrder(userId: string, dto: CreateOrderDto): Promise<Order> {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Giỏ hàng phải có ít nhất 1 sản phẩm');
    }

    const calculatedItems = dto.items.map((item) => {
      const lineTotal = item.unitPrice * item.qty;
      return {
        productId: String(item.productId),
        productName: item.productName || String(item.productId),
        size: item.size,
        toppings: item.toppings ?? [],
        qty: item.qty,
        unitPrice: item.unitPrice,
        lineTotal,
      };
    });

    const total = calculatedItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const parsedUserId = /^\d+$/.test(String(userId)) ? Number(userId) : null;

    try {
      return await this.createOrderInDb(
        userId,
        parsedUserId,
        total,
        dto,
        calculatedItems,
      );
    } catch (err) {
      let finalErr: unknown = err;
      if (await this.ensureSchemaIfNeeded(err)) {
        try {
          return await this.createOrderInDb(
            userId,
            parsedUserId,
            total,
            dto,
            calculatedItems,
          );
        } catch (retryErr) {
          finalErr = retryErr;
        }
      }

      if (!isDatabaseUnavailableError(finalErr)) {
        throw finalErr;
      }

      if (!this.isTestEnv()) {
        const msg =
          (finalErr as { message?: string })?.message ?? String(finalErr);
        this.logger.error(
          `Lưu đơn hàng vào PostgreSQL thất bại chi tiết: ${msg}`,
          (finalErr as Error)?.stack,
        );
      }

      this.loadFallbackFromDisk();
      const seq = this.orderSequence++;
      const orderId = `order-${seq}`;
      const orderCode = `#${seq}`;

      const items: OrderItem[] = calculatedItems.map((item, idx) => ({
        id: `${orderId}-item-${idx + 1}`,
        orderId,
        productId: item.productId,
        productName: item.productName,
        size: item.size,
        toppings: item.toppings,
        qty: item.qty,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
      }));

      const order: Order = {
        id: orderId,
        orderCode,
        userId,
        status: 'PENDING',
        total,
        customerName: dto.customerName ?? null,
        customerPhone: dto.customerPhone ?? null,
        address: dto.address ?? null,
        note: dto.note ?? null,
        items,
        createdAt: new Date().toISOString(),
      };

      this.fallbackOrders.set(orderId, order);
      this.saveFallbackToDisk();
      return order;
    }
  }

  async findByUser(userId: string): Promise<Order[]> {
    const parsedUserId = /^\d+$/.test(String(userId)) ? Number(userId) : null;

    try {
      if (parsedUserId !== null) {
        const rows = await this.ordersRepo.findMany({
          where: { user_id: parsedUserId },
          include: { items: { include: { item_toppings: true } } },
          orderBy: { id: 'desc' },
        });
        return rows.map((row: OrderRowWithItems) =>
          this.rowToOrder(row, userId),
        );
      }
    } catch (err) {
      if (!isDatabaseUnavailableError(err)) {
        throw err;
      }
    }

    this.loadFallbackFromDisk();
    return Array.from(this.fallbackOrders.values()).filter(
      (order) => order.userId === userId,
    );
  }

  async findByCode(orderCode: string): Promise<Order> {
    const normalizedCode = orderCode.startsWith('#')
      ? orderCode
      : `#${orderCode}`;
    try {
      const row = await this.ordersRepo.findUnique({
        where: { order_code: normalizedCode },
        include: { items: { include: { item_toppings: true } } },
      });
      if (!row) {
        throw new NotFoundException(`Không tìm thấy đơn hàng ${orderCode}`);
      }
      return this.rowToOrder(row, String(row.user_id ?? ''));
    } catch (err) {
      if (!isDatabaseUnavailableError(err)) {
        throw err;
      }
    }

    this.loadFallbackFromDisk();
    const found = Array.from(this.fallbackOrders.values()).find(
      (o) => o.orderCode === normalizedCode || o.orderCode === orderCode,
    );
    if (!found) {
      throw new NotFoundException(`Không tìm thấy đơn hàng ${orderCode}`);
    }
    return found;
  }

  private rowToOrder(row: OrderRowWithItems, fallbackUserId: string): Order {
    const orderId = `order-${1000 + row.id}`;
    return {
      id: orderId,
      orderCode: row.order_code,
      userId: row.user_id !== null ? String(row.user_id) : fallbackUserId,
      status: row.status as OrderStatus,
      total: Number(row.total_price),
      customerName: null,
      customerPhone: null,
      address: null,
      note: null,
      items: (row.items ?? []).map((item: OrderItemRow, idx: number) => ({
        id: `${orderId}-item-${item.id ?? idx + 1}`,
        orderId,
        productId: item.product_id === null ? '' : String(item.product_id),
        productName: item.product_name,
        size: item.size as DrinkSize,
        toppings: (item.item_toppings ?? []).map((t) => t.topping_name),
        qty: item.quantity,
        unitPrice: Number(item.price),
        lineTotal: Number(item.subtotal),
      })),
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : new Date(row.created_at).toISOString(),
    };
  }
}
