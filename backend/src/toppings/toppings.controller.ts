import { Controller, Get } from '@nestjs/common';
import { Topping, ToppingsService } from './toppings.service.js';

@Controller('toppings')
export class ToppingsController {
  constructor(private readonly toppingsService: ToppingsService) {}

  @Get()
  findAll(): Promise<Topping[]> {
    return this.toppingsService.findAll();
  }
}
