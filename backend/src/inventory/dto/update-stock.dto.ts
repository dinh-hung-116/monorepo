import { IsNumber, Min } from 'class-validator';

/** Kiểm kê: đặt lại số lượng tồn kho (không được thấp hơn phần đang giữ chỗ). */
export class UpdateIngredientStockDto {
  @IsNumber({}, { message: 'quantity phải là số' })
  @Min(0, { message: 'quantity không được âm' })
  quantity!: number;
}

/** Nhập thêm nguyên liệu vào kho. */
export class RestockIngredientDto {
  @IsNumber({}, { message: 'amount phải là số' })
  @Min(0.001, { message: 'amount phải lớn hơn 0' })
  amount!: number;
}
