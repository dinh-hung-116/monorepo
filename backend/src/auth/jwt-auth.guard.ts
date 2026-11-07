// Task 7.3: Guard bảo vệ các route nhạy cảm như đặt đơn hàng (Tùng phụ trách).
import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (err || !user) {
      throw err || new UnauthorizedException('Bạn cần đăng nhập để thực hiện chức năng này.');
    }
    return user;
  }
}

