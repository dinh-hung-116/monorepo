import { Injectable } from '@nestjs/common';
import type { toppings as ToppingRow } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export interface Topping {
  id: string;
  name: string;
  price: number;
}

@Injectable()
export class ToppingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Topping[]> {
    const rows = await this.prisma.toppings.findMany({
      where: { is_available: true },
      orderBy: { id: 'asc' },
    });
    return rows.map((row: ToppingRow) => ({
      id: String(row.id),
      name: row.name,
      price: Number(row.price),
    }));
  }
}
