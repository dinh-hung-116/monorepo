// Task 6.1: DTO và validate đầu vào cho đơn hàng với class-validator (Tùng).
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateOrderItemDto {
  @IsInt({ message: 'Mã món (productId) phải là số nguyên' })
  @Min(1, { message: 'Mã món không hợp lệ' })
  productId!: number;

  @IsIn(['S', 'M', 'L'], { message: 'Size chỉ được là S, M hoặc L' })
  @IsNotEmpty({ message: 'Size không được để trống' })
  size!: 'S' | 'M' | 'L';

  @IsOptional()
  @IsArray({ message: 'Danh sách topping phải là mảng chuỗi ID' })
  @IsString({ each: true, message: 'ID topping phải là chuỗi' })
  toppings?: string[];

  @IsInt({ message: 'Số lượng phải là số nguyên' })
  @Min(1, { message: 'Số lượng phải ít nhất là 1' })
  quantity!: number;
}

export class CreateOrderDto {
  @IsArray({ message: 'Giỏ hàng items phải là mảng' })
  @ArrayMinSize(1, { message: 'Đơn hàng phải có ít nhất 1 sản phẩm' })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  @IsOptional()
  @IsString({ message: 'Tên người nhận phải là chuỗi' })
  customerName?: string;

  @IsOptional()
  @IsString({ message: 'Số điện thoại phải là chuỗi' })
  customerPhone?: string;

  @IsOptional()
  @IsString({ message: 'Địa chỉ nhận hàng phải là chuỗi' })
  address?: string;

  @IsOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi' })
  note?: string;
}

