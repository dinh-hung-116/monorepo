import {Controller, Get, Param, Post, Req, Res} from '@nestjs/common';
import type {Request, Response} from 'express';
import {PaymentsService} from './payments.service.js';

@Controller('/api/payment')
export class PaymentsController {
    constructor(private readonly paymentsService: PaymentsService) { }

    @Post('/create/:orderId')
    async createPayment(
        @Param('orderId') orderId: string,
        @Req() req: Request,
    ){
        /*
        Check for idemptency key in the request headers. If it exists, use it to check if a payment has already been created for this order. If it does, return the existing payment URL. If not, create a new payment and return the new payment URL.
        */
        const ipAddress = this.getIpAddress(req);
        const paymentUrl =
             await this.paymentsService.createPayment(
                orderId,
                ipAddress,
                `${req.protocol}://${req.get('host')}/api/payment/return`
            );

        return { paymentUrl };
    }

    @Get('/return')
    async paymentReturn(
        @Req() req: Request,
        @Res() res: Response,
    ) {
        const params: Map<string, string> = new Map();
        Object.entries(req.query).forEach(([key, value]) => {
            if (value != null && value !== '') {
                if (typeof value === "string") {
                    params.set(key, value);
                }
            }
        });
        try {

            const order =
                await this.paymentsService.processPaymentReturn(params);

            return res.redirect(
                this.buildFrontendUrl(
                    req,
                    `/order-confirmation?orderCode=${encodeURIComponent(order.order_code)}`
                )
            );
        } catch (e) {

            return res.redirect(
                this.buildFrontendUrl(req, '/order-confirmation?error=true')
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

        if ("0:0:0:0:0:0:0:1" == ipAddress
            || "::1" == ipAddress) {
            ipAddress = "127.0.0.1";
        }

        return ipAddress;
    }
}