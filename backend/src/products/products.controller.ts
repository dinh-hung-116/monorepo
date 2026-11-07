import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { Product, ProductsService } from './products.service.js';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /** GET /products – danh sách menu. */
  @Get()
  findAll(): Promise<Product[]> {
    return this.productsService.findAll();
  }

  /** GET /products/:id – chi tiết; id không phải số → 400, không tồn tại → 404. */
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Product> {
    return this.productsService.findOne(id);
  }
}
