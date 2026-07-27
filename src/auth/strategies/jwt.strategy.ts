import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const secret = configService.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET environment variable is required');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: { sub: string; email: string; role: Role }) {
    // SECURITY: Ensure the user hasn't been suspended since the token was issued
    // ALSO: Fetch the real-time role in case an Admin just promoted/demoted them!
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { isActive: true, role: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Your account has been suspended.');
    }

    return {
      sub: payload.sub,
      email: payload.email,
      role: user.role, // Always use the LIVE role from the database, not the stale token payload
    };
  }
}
