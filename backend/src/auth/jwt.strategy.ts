import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export const JWT_SECRET = process.env.JWT_SECRET || 'brewlite_super_secret_jwt_key_2026';

export interface JwtPayload {
  sub: string;
  email: string;
}

export interface AuthenticatedUser {
  userId: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: JWT_SECRET,
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    if (!payload?.sub || !payload?.email) {
      throw new UnauthorizedException('Token không hợp lệ');
    }
    return {
      userId: payload.sub,
      email: payload.email,
    };
  }
}
