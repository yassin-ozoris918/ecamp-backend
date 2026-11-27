import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../../settings/settings.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private settingsService: SettingsService,
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

  async validate(payload: { sub: string; email: string; role: Role; did?: string; bid?: string }) {
    // SECURITY: Ensure the user hasn't been suspended since the token was issued
    // ALSO: Fetch the real-time role in case an Admin just promoted/demoted them!
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        isActive: true,
        role: true,
        ...(payload.bid
          ? { deviceBrowsers: { where: { id: payload.bid, revokedAt: null, device: { status: 'ACTIVE' as const } }, select: { id: true }, take: 1 } }
          : {}),
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Your account has been suspended.');
    }

    // Device removed or replaced by an admin: this browser's login ends now.
    if (payload.bid && !(user as { deviceBrowsers?: unknown[] }).deviceBrowsers?.length) {
      throw new UnauthorizedException({ message: 'auth.errors.deviceRevoked', code: 'DEVICE_REVOKED' });
    }

    if (user.role !== Role.ADMIN) {
      const isMaintenance = await this.settingsService.get('maintenance_mode');
      if (isMaintenance) {
        throw new ServiceUnavailableException({
          code: 'MAINTENANCE_MODE',
          message: 'Platform is currently under maintenance.',
        });
      }
    }

    return {
      sub: payload.sub,
      email: payload.email,
      role: user.role, // Always use the LIVE role from the database, not the stale token payload
      did: payload.did,
      bid: payload.bid,
    };
  }
}
