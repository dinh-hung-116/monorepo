import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Kết nối PostgreSQL qua Prisma, dùng chung cho mọi module (DATABASE_URL trong backend/.env).
 * Prisma tự kết nối ở truy vấn đầu tiên, nên route không dùng DB (vd: GET /) vẫn chạy khi DB tắt.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
