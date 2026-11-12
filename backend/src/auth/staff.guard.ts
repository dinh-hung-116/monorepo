import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/** Vai trò được phép sửa tồn kho (khớp enum UserRole trong schema). */
const STAFF_ROLES = new Set(['STAFF', 'ADMIN']);

interface RequestWithUser {
  user?: { userId?: string };
}

/**
 * Phải dùng sau JwtAuthGuard. Vai trò được đọc từ DB theo user_id trong token,
 * nên token cũ (không chứa role) vẫn hoạt động và quyền bị thu hồi có hiệu lực ngay.
 */
@Injectable()
export class StaffGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const userId = request.user?.userId;
    if (!userId || !/^\d+$/.test(userId)) {
      throw new UnauthorizedException(
        'Cần đăng nhập bằng tài khoản trong hệ thống',
      );
    }

    const user = await this.prisma.users.findUnique({
      where: { id: Number(userId) },
      select: { role: true },
    });
    if (!user || !STAFF_ROLES.has(user.role)) {
      throw new ForbiddenException(
        'Chỉ nhân viên hoặc quản trị viên được thao tác kho',
      );
    }

    return true;
  }
}
