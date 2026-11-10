import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { resolve } from 'node:path';

const DEFAULT_DATABASE_URL =
  'postgresql://brewlite:brewlite@localhost:5432/brewlite';

const img = (text: string) =>
  `https://placehold.co/600x400/6f422b/ffffff?text=${encodeURIComponent(text)}`;

const SEED_PRODUCTS = [
  { name: 'Cà phê đen', description: 'Cà phê đen đậm vị, thơm ngon', price: 20000, category: 'Cà phê', image_url: img('Ca phe den') },
  { name: 'Cà phê sữa', description: 'Cà phê kết hợp với sữa đặc', price: 25000, category: 'Cà phê', image_url: img('Ca phe sua') },
  { name: 'Bạc xỉu', description: 'Sữa nhiều, cà phê nhẹ', price: 28000, category: 'Cà phê', image_url: img('Bac xiu') },
  { name: 'Latte', description: 'Espresso kết hợp với sữa tươi', price: 35000, category: 'Cà phê', image_url: img('Latte') },
  { name: 'Trà sữa trân châu', description: 'Trà sữa béo thơm kèm trân châu', price: 30000, category: 'Trà sữa', image_url: img('Tra sua') },
  { name: 'Trà đào', description: 'Trà đào thanh mát', price: 30000, category: 'Trà', image_url: img('Tra dao') },
  { name: 'Matcha Latte', description: 'Matcha kết hợp với sữa tươi', price: 35000, category: 'Matcha', image_url: img('Matcha Latte') },
  { name: 'Chocolate đá', description: 'Chocolate đậm vị, uống cùng đá mát', price: 32000, category: 'Chocolate', image_url: img('Chocolate') },
];

interface FallbackUserRecord {
  email: string;
  name: string;
  phone?: string | null;
  role?: string;
  passwordHash: string;
  loyaltyPoints?: number;
}

/**
 * Tự động nạp biến môi trường từ backend/.env và ../.env (nếu có)
 * vì NestJS và @prisma/client v6 (ESM) không tự đọc file .env khi chạy runtime.
 */
export function loadEnvFiles(): void {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '..', '.env'),
  ];

  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    try {
      const content = readFileSync(filePath, 'utf8');
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eqIndex = line.indexOf('=');
        if (eqIndex <= 0) continue;
        const key = line.slice(0, eqIndex).trim();
        let value = line.slice(eqIndex + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (key && process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
    } catch {
      // Bỏ qua nếu không đọc được file .env
    }
  }

  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = DEFAULT_DATABASE_URL;
  }
}

loadEnvFiles();

/**
 * Kết nối PostgreSQL qua Prisma, dùng chung cho mọi module (DATABASE_URL trong backend/.env).
 * Tự động khởi tạo bảng (products, users, orders, order_items) nếu DB đã bật nhưng chưa chạy migrate.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private schemaEnsured = false;
  private ensureSchemaPromise: Promise<boolean> | null = null;
  private dbReachableState: 'unknown' | 'online' | 'offline' = 'unknown';
  private offlineCheckedAt = 0;

  constructor() {
    loadEnvFiles();
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
        },
      },
    });
    this.wrapModelDelegates();
  }

  private wrapModelDelegates(): void {
    const delegateNames = ['products', 'users', 'orders', 'order_items'] as const;
    for (const name of delegateNames) {
      const original = (this as unknown as Record<string, unknown>)[name];
      if (!original || typeof original !== 'object') continue;

      const wrapped = new Proxy(original as Record<string, unknown>, {
        get: (target, prop, receiver) => {
          const val = Reflect.get(target, prop, receiver);
          if (typeof val !== 'function') return val;
          return async (...args: unknown[]) => {
            const reachable = await this.checkDbReachable();
            if (!reachable) {
              const err = new Error("Can't reach database server");
              err.name = 'PrismaClientInitializationError';
              (err as { code?: string }).code = 'P1001';
              throw err;
            }
            if (!this.schemaEnsured) {
              await this.ensureSchema();
            }
            try {
              return await (val as (...a: unknown[]) => Promise<unknown>).apply(
                target,
                args,
              );
            } catch (err) {
              const code = (err as { code?: string })?.code ?? '';
              const msg = (err as { message?: string })?.message ?? '';
              if (
                code === 'P1001' ||
                msg.includes("Can't reach database server")
              ) {
                this.dbReachableState = 'offline';
                this.offlineCheckedAt = Date.now();
              }
              throw err;
            }
          };
        },
      });

      Object.defineProperty(this, name, {
        value: wrapped,
        configurable: true,
        writable: true,
      });
    }
  }

  private async checkDbReachable(): Promise<boolean> {
    if (this.dbReachableState === 'online') return true;
    const now = Date.now();
    if (
      this.dbReachableState === 'offline' &&
      now - this.offlineCheckedAt < 3000
    ) {
      return false;
    }

    const dbUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
    let host = '127.0.0.1';
    let port = 5432;
    try {
      const parsed = new URL(dbUrl);
      if (parsed.hostname && parsed.hostname !== 'localhost') {
        host = parsed.hostname;
      }
      if (parsed.port) {
        port = Number(parsed.port);
      }
    } catch {
      // Giữ mặc định 127.0.0.1:5432
    }

    const reachable = await new Promise<boolean>((resolvePromise) => {
      const socket = createConnection({ host, port, timeout: 200 });
      socket.once('connect', () => {
        socket.destroy();
        resolvePromise(true);
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolvePromise(false);
      });
      socket.once('error', () => {
        socket.destroy();
        resolvePromise(false);
      });
    });

    if (reachable) {
      this.dbReachableState = 'online';
      return true;
    }

    this.dbReachableState = 'offline';
    this.offlineCheckedAt = Date.now();
    return false;
  }

  async onModuleInit(): Promise<void> {
    if (process.env.VITEST || process.env.NODE_ENV === 'test') {
      return;
    }
    await this.ensureSchema();
  }

  /**
   * Đảm bảo các bảng products, users, orders, order_items đã tồn tại trong PostgreSQL.
   * Trả về true nếu kết nối và đồng bộ bảng thành công, false nếu PostgreSQL chưa bật.
   */
  async ensureSchema(): Promise<boolean> {
    if (this.schemaEnsured) return true;
    if (this.ensureSchemaPromise) return this.ensureSchemaPromise;

    this.ensureSchemaPromise = this.runEnsureSchema().finally(() => {
      this.ensureSchemaPromise = null;
    });
    return this.ensureSchemaPromise;
  }

  private async runEnsureSchema(): Promise<boolean> {
    if (!(await this.checkDbReachable())) {
      this.logger.warn(
        `Không thể kết nối PostgreSQL tại ${process.env.DATABASE_URL}. Hệ thống tạm thời dùng dữ liệu dự phòng tại .data/. Hãy bật PostgreSQL để lưu vào CSDL.`,
      );
      return false;
    }

    try {
      await this.createDatabaseIfMissing();

      await this.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "products" (
          "id" SERIAL NOT NULL,
          "name" VARCHAR(150) NOT NULL,
          "description" TEXT,
          "price" DECIMAL(12,2) NOT NULL,
          "image_url" VARCHAR(500),
          "category" VARCHAR(100),
          "is_available" BOOLEAN NOT NULL DEFAULT true,
          "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "products_pkey" PRIMARY KEY ("id")
        );
      `);

      await this.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "users" (
          "id" SERIAL NOT NULL,
          "email" VARCHAR(150) NOT NULL,
          "password_hash" VARCHAR(255) NOT NULL,
          "name" VARCHAR(150) NOT NULL,
          "phone" VARCHAR(20),
          "role" VARCHAR(50) NOT NULL DEFAULT 'CUSTOMER',
          "loyalty_points" INTEGER NOT NULL DEFAULT 0,
          "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "users_pkey" PRIMARY KEY ("id")
        );
      `);

      await this.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");
      `);

      await this.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "orders" (
          "id" SERIAL NOT NULL,
          "order_code" VARCHAR(50) NOT NULL,
          "user_id" INTEGER,
          "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
          "total_price" DECIMAL(12,2) NOT NULL,
          "customer_name" VARCHAR(150),
          "customer_phone" VARCHAR(20),
          "address" VARCHAR(255),
          "note" TEXT,
          "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
        );
      `);

      await this.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "orders_order_code_key" ON "orders"("order_code");
      `);

      await this.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "order_items" (
          "id" SERIAL NOT NULL,
          "order_id" INTEGER NOT NULL,
          "product_id" VARCHAR(100) NOT NULL,
          "product_name" VARCHAR(150) NOT NULL,
          "size" VARCHAR(10) NOT NULL,
          "toppings" JSONB,
          "price" DECIMAL(12,2) NOT NULL,
          "quantity" INTEGER NOT NULL DEFAULT 1,
          "subtotal" DECIMAL(12,2) NOT NULL,
          CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
        );
      `);

      await this.$executeRawUnsafe(`
        DO $$ BEGIN
          ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        EXCEPTION
          WHEN duplicate_object THEN NULL;
        END $$;
      `);

      await this.$executeRawUnsafe(`
        DO $$ BEGIN
          ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey"
            FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION
          WHEN duplicate_object THEN NULL;
        END $$;
      `);

      this.schemaEnsured = true;

      const rows = await this.$queryRawUnsafe<Array<{ cnt: bigint | number }>>(
        'SELECT COUNT(*)::int AS cnt FROM "products"',
      );
      const count = Number(rows?.[0]?.cnt ?? 0);
      if (count === 0) {
        for (const p of SEED_PRODUCTS) {
          await this.$executeRawUnsafe(
            'INSERT INTO "products" ("name", "description", "price", "category", "image_url") VALUES ($1, $2, $3, $4, $5)',
            p.name,
            p.description,
            p.price,
            p.category,
            p.image_url,
          );
        }
      }

      await this.syncLocalFallbackUsersToDb();

      this.logger.log(
        'Đã kết nối PostgreSQL và đồng bộ đầy đủ các bảng (products, users, orders, order_items).',
      );
      return true;
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? String(err);
      this.logger.warn(
        `Không thể khởi tạo bảng trên PostgreSQL (${msg.split('\n')[0]}). Hệ thống tạm thời dùng dữ liệu dự phòng tại .data/. Hãy kiểm tra DATABASE_URL trong backend/.env.`,
      );
      return false;
    }
  }

  /**
   * Tự động tạo database (ví dụ: brewlite) nếu PostgreSQL đã chạy nhưng chưa tạo database này.
   */
  private async createDatabaseIfMissing(): Promise<void> {
    try {
      await this.$queryRawUnsafe('SELECT 1');
    } catch (err) {
      const code = (err as { code?: string })?.code ?? '';
      const msg = (err as { message?: string })?.message ?? '';
      if (code !== 'P1003' && !msg.includes('does not exist')) {
        throw err;
      }

      const dbUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
      const parsed = new URL(dbUrl);
      const dbName = parsed.pathname.replace(/^\//, '').split('?')[0];
      if (!dbName || !/^[a-zA-Z0-9_-]+$/.test(dbName)) {
        throw err;
      }

      parsed.pathname = '/postgres';
      const adminClient = new PrismaClient({
        datasources: { db: { url: parsed.toString() } },
      });
      try {
        await adminClient.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
        this.logger.log(`Đã tự động tạo database PostgreSQL "${dbName}".`);
      } finally {
        await adminClient.$disconnect();
      }
    }
  }

  /**
   * Đồng bộ các tài khoản từng lưu tạm ở .data/users-db.json (nếu có) vào bảng users của PostgreSQL.
   */
  private async syncLocalFallbackUsersToDb(): Promise<void> {
    const localUsersPath = resolve(process.cwd(), '.data', 'users-db.json');
    if (!existsSync(localUsersPath)) return;
    try {
      const raw = readFileSync(localUsersPath, 'utf8');
      const parsed = JSON.parse(raw) as { users?: FallbackUserRecord[] };
      if (!Array.isArray(parsed?.users)) return;

      for (const u of parsed.users) {
        if (!u?.email || !u?.passwordHash) continue;
        await this.$executeRawUnsafe(
          `INSERT INTO "users" ("email", "name", "phone", "role", "password_hash", "loyalty_points")
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT ("email") DO NOTHING`,
          u.email,
          u.name || u.email.split('@')[0],
          u.phone ?? null,
          u.role ?? 'CUSTOMER',
          u.passwordHash,
          u.loyaltyPoints ?? 0,
        );
      }
    } catch {
      // Bỏ qua lỗi đọc file dự phòng
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
