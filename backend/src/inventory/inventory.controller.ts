// API đọc tồn kho (công khai cho menu) và API sửa kho (chỉ STAFF/ADMIN).
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { StaffGuard } from '../auth/staff.guard.js';
import { RestockIngredientDto, UpdateIngredientStockDto } from './dto/update-stock.dto.js';
import type { DrinkSize } from './inventory.calculator.js';
import {
  InventoryService,
  type AvailabilitySnapshot,
  type IngredientStock,
  type ItemAvailability,
} from './inventory.service.js';

const SIZES: DrinkSize[] = ['S', 'M', 'L'];

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  /** Toàn bộ nguyên liệu + số ly còn bán được của từng món / topping. */
  @Get('availability')
  getAvailability(): Promise<AvailabilitySnapshot> {
    return this.inventoryService.getAvailability();
  }

  /**
   * Kiểm tra nhanh một món: /inventory/products/5/availability?size=M&qty=2&toppings=Trân châu,Pudding
   * (toppings là tên topping, phân tách bằng dấu phẩy — giống dữ liệu giỏ hàng gửi lên).
   */
  @Get('products/:productId/availability')
  checkProduct(
    @Param('productId', ParseIntPipe) productId: number,
    @Query('size') size?: string,
    @Query('qty') qty?: string,
    @Query('toppings') toppings?: string,
  ): Promise<ItemAvailability> {
    const parsedSize = (size ?? 'M').trim().toUpperCase() as DrinkSize;
    if (!SIZES.includes(parsedSize)) {
      throw new BadRequestException('size phải là S, M hoặc L');
    }

    const parsedQty = Number(qty ?? 1);
    if (!Number.isFinite(parsedQty) || parsedQty < 1) {
      throw new BadRequestException('qty phải là số nguyên từ 1 trở lên');
    }

    const toppingNames = (toppings ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);

    return this.inventoryService.checkItem({
      productId: String(productId),
      size: parsedSize,
      toppings: toppingNames,
      qty: Math.floor(parsedQty),
    });
  }

  /** Danh sách nguyên liệu kèm lượng đang giữ chỗ — dành cho nhân viên. */
  @UseGuards(JwtAuthGuard, StaffGuard)
  @Get('ingredients')
  getIngredients(): Promise<IngredientStock[]> {
    return this.inventoryService.getStock();
  }

  /** Kiểm kê: đặt lại số lượng tồn kho của một nguyên liệu. */
  @UseGuards(JwtAuthGuard, StaffGuard)
  @Patch('ingredients/:id')
  updateIngredientStock(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateIngredientStockDto,
  ): Promise<IngredientStock> {
    return this.inventoryService.setStock(id, dto.quantity);
  }

  /** Nhập thêm nguyên liệu vào kho. */
  @UseGuards(JwtAuthGuard, StaffGuard)
  @Post('ingredients/:id/restock')
  restockIngredient(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RestockIngredientDto,
  ): Promise<IngredientStock> {
    return this.inventoryService.restock(id, dto.amount);
  }
}
