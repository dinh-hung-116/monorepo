import { Injectable } from '@nestjs/common';
import type {
  order_items as OrderItemRow,
  orders as OrderRow,
} from '@prisma/client';
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

type OrderRowWithItems = OrderRow & { items: OrderItemRow[] };

interface LocalOrdersDb {
  orderSeq: number;
  orders: Order[];
}

const LOCAL_ORDERS_PATH = resolve(process.cwd(), '.data', 'orders-db.json');

function isDatabaseUnavailableError(err: unknown): boolean {
  const name = (err as { name?: string })?.name ?? '';
  const code = (err as { code?: string })?.code ?? '';
  const message = (err as { message?: string })?.message ?? '';
  return (
    name.includes('PrismaClientInitializationError') ||
    name.includes('PrismaClientRustPanicError') ||
    code === 'P1001' ||
    code === 'P1002' ||
    code === 'P1003' ||
    code === 'P2021' ||
    message.includes("Can't reach database server") ||
    message.includes('Environment variable not found: DATABASE_URL') ||
    message.includes('does not exist in the current database')
  );
}

@Injectable()
export class OrdersService {
  private readonly fallbackOrders: Map<string, Order> = new Map();
  private orderSequence = 1001;

  constructor(private readonly prisma: PrismaService) {
    this.loadFallbackFromDisk();
  }

  private isTestEnv(): boolean {
    return Boolean(process.env.VITEST || process.env.NODE_ENV === 'test');
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

  async createOrder(userId: string, dto: CreateOrderDto): Promise<Order> {
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
      const count = await this.prisma.orders.count();
      const seq = 1001 + count;
      const orderCode = `#${seq}`;

      const created = await this.prisma.orders.create({
        data: {
          order_code: orderCode,
          user_id: parsedUserId,
          status: 'PENDING',
          total_price: total,
          items: {
            create: calculatedItems.map((item) => ({
              product_id: item.productId,
              product_name: item.productName,
              size: item.size,
              toppings: item.toppings,
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
    } catch (err) {
      if (!isDatabaseUnavailableError(err)) {
        throw err;
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
        const rows = await this.prisma.orders.findMany({
          where: { user_id: parsedUserId },
          include: { items: true },
          orderBy: { id: 'desc' },
        });
        return rows.map((row) => this.rowToOrder(row, userId));
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

  private rowToOrder(row: OrderRowWithItems, fallbackUserId: string): Order {
    const orderId = `order-${1000 + row.id}`;
    return {
      id: orderId,
      orderCode: row.order_code,
      userId: row.user_id !== null ? String(row.user_id) : fallbackUserId,
      status: row.status as OrderStatus,
      total: Number(row.total_price),
      items: (row.items ?? []).map((item, idx) => ({
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
