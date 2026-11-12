import {
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';
import { PaymentsService } from './payments.service.js';

@Controller('/api/payment')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('/create/:orderId')
  async createPayment(
    @Param('orderId') orderId: string,
    @Req() req: Request,
    @Headers('idempotency-key') idempotencyKeyHeader?: string,
  ) {
    const ipAddress = this.getIpAddress(req);

    // Nếu client không gửi Idempotency-Key thì tự sinh từ orderId + IP.
    // Điều này đảm bảo cùng đơn hàng từ cùng IP không tạo 2 payment record,
    // đồng thời vẫn hỗ trợ client gửi key tường minh.
    const idempotencyKey =
      idempotencyKeyHeader?.trim() || `auto:${orderId}:${ipAddress}`;

    const { paymentUrl } = await this.paymentsService.createPayment(
      orderId,
      ipAddress,
      `${req.protocol}://${req.get('host')}/api/payment/return`,
      idempotencyKey,
    );

    return { paymentUrl };
  }

  @UseGuards(JwtAuthGuard)
  @Post('/cancel/:orderCode')
  async cancelPayment(
    @Param('orderCode') orderCode: string,
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    return this.paymentsService.cancelPayment(orderCode, req.user.userId);
  }

  @Get('/return')
  async paymentReturn(@Req() req: Request, @Res() res: Response) {
    const params: Map<string, string> = new Map();
    Object.entries(req.query).forEach(([key, value]) => {
      if (value != null && value !== '') {
        if (typeof value === 'string') {
          params.set(key, value);
        }
      }
    });
    try {
      const { order, paid } =
        await this.paymentsService.processPaymentReturn(params);

      return res.redirect(
        this.buildFrontendUrl(
          req,
          `/order-confirmation?orderCode=${encodeURIComponent(order.order_code)}` +
            (paid ? '' : '&status=failed'),
        ),
      );
    } catch (e) {
      return res.redirect(
        this.buildFrontendUrl(req, '/order-confirmation?error=true'),
      );
    }
  }

  /** URL của frontend Next.js để chuyển người dùng về sau khi thanh toán. */
  private buildFrontendUrl(req: Request, path: string): string {
    const baseUrl = (
      process.env.FRONTEND_URL ||
      process.env.CORS_ORIGIN ||
      `${req.protocol}://localhost:3000`
    ).replace(/\/+$/, '');
    return `${baseUrl}${path}`;
  }

  private getIpAddress(req: Request): string {
    let ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '127.0.0.1';

    if ('0:0:0:0:0:0:0:1' == ipAddress || '::1' == ipAddress) {
      ipAddress = '127.0.0.1';
    }

    return ipAddress;
  }
}
