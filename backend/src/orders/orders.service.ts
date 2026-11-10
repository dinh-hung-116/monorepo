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
  product_id: string;
  product_name: string;
  size: string;
  toppings: unknown;
  price: number | { toString(): string };
  quantity: number;
  subtotal: number | { toString(): string };
}

export interface OrderRowWithItems {
  id: number;
  order_code: string;
  user_id: number | null;
  status: string;
  total_price: number | { toString(): string };
  customer_name?: string | null;
  customer_phone?: string | null;
  address?: string | null;
  note?: string | null;
  created_at: Date | string;
  updated_at?: Date | string;
  items: OrderItemRow[];
}

interface OrdersDelegate {
  count(): Promise<number>;
  create(args: {
    data: {
      order_code: string;
      user_id: number | null;
      status: string;
      total_price: number;
      customer_name: string | null;
      customer_phone: string | null;
      address: string | null;
      note: string | null;
      items: {
        create: Array<{
          product_id: string;
          product_name: string;
          size: string;
          toppings: string[];
          price: number;
          quantity: number;
          subtotal: number;
        }>;
      };
    };
    include: { items: boolean };
  }): Promise<OrderRowWithItems>;
  findMany(args: {
    where: { user_id: number };
    include: { items: boolean };
    orderBy: { id: 'asc' | 'desc' };
  }): Promise<OrderRowWithItems[]>;
  findUnique(args: {
    where: { order_code: string };
    include: { items: boolean };
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
    const count = await this.ordersRepo.count();
    const seq = 1001 + count;
    const orderCode = `#${seq}`;

    const created = await this.ordersRepo.create({
      data: {
        order_code: orderCode,
        user_id: parsedUserId,
        status: 'PENDING',
        total_price: total,
        customer_name: dto.customerName ?? null,
        customer_phone: dto.customerPhone ?? null,
        address: dto.address ?? null,
        note: dto.note ?? null,
        items: {
          create: calculatedItems.map((item) => ({
            product_id: item.productId,
            product_name: item.productName,
            size: item.size,
            // Chuyển tường minh sang mảng JSON thuần để tránh lỗi 08P01 (JSONB encoding)
            toppings: Array.isArray(item.toppings) ? [...item.toppings] : [],
            price: item.unitPrice,
            quantity: item.qty,
            subtotal: item.lineTotal,
          })),
        },
      },
      include: {
        items: true,
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
        this.logger.warn(
          `Lưu đơn hàng vào PostgreSQL thất bại (${msg.split('\n')[0]}), đang lưu tạm vào .data/orders-db.json.`,
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
          include: { items: true },
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
        include: { items: true },
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
      customerName: row.customer_name ?? null,
      customerPhone: row.customer_phone ?? null,
      address: row.address ?? null,
      note: row.note ?? null,
      items: (row.items ?? []).map((item: OrderItemRow, idx: number) => ({
        id: `${orderId}-item-${item.id ?? idx + 1}`,
        orderId,
        productId: item.product_id,
        productName: item.product_name,
        size: item.size as DrinkSize,
        toppings: Array.isArray(item.toppings)
          ? (item.toppings as string[])
          : [],
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
