import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import type { DrinkSize } from '../entities/order.entity.js';

export class CreateOrderItemDto {
  @IsString({ message: 'productId phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'productId không được để trống' })
  productId!: string;

  @IsOptional()
  @IsString({ message: 'productName phải là chuỗi ký tự' })
  productName?: string;

  @IsIn(['S', 'M', 'L'], { message: 'Size phải là S, M hoặc L' })
  size!: DrinkSize;

  @IsOptional()
  @IsArray({ message: 'toppings phải là mảng chuỗi' })
  @IsString({ each: true, message: 'Mỗi topping phải là chuỗi ký tự' })
  toppings?: string[];

  @IsInt({ message: 'Số lượng (qty) phải là số nguyên' })
  @Min(1, { message: 'Số lượng (qty) phải lớn hơn hoặc bằng 1' })
  qty!: number;

  @IsNumber({}, { message: 'Đơn giá (unitPrice) phải là số' })
  @Min(0, { message: 'Đơn giá (unitPrice) không được âm' })
  unitPrice!: number;
}

export class CreateOrderDto {
  @IsArray({ message: 'Giỏ hàng (items) phải là một mảng' })
  @ArrayMinSize(1, { message: 'Giỏ hàng phải có ít nhất 1 sản phẩm' })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  @IsOptional()
  @IsString({ message: 'Tên người nhận phải là chuỗi ký tự' })
  customerName?: string;

  @IsOptional()
  @IsString({ message: 'Số điện thoại phải là chuỗi ký tự' })
  customerPhone?: string;

  @IsOptional()
  @IsString({ message: 'Địa chỉ nhận hàng phải là chuỗi ký tự' })
  address?: string;

  @IsOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi ký tự' })
  note?: string;
}
