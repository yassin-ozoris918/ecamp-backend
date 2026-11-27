import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Extra device check on video endpoints for students.
 * - Logins tied to a trusted browser were already checked by JwtStrategy (browser and device active).
 * - Older logins (before the trusted-device upgrade) fall back to the single-hash header.
 */
@Injectable()
export class DeviceRestrictionGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return false;
    if (user.role === 'ADMIN' || user.role === 'INSTRUCTOR') return true;
    if (user.bid) return true;

    const deviceId = request.headers['x-device-id'] || request.body?.deviceId || request.query?.deviceId;
    if (!deviceId) throw new ForbiddenException('Device ID is missing from request.');

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.sub || user.id },
      select: {
        deviceId: true,
        isDemo: true,
        trustedDevices: { where: { status: 'ACTIVE' }, select: { legacyId: true }, take: 1 },
      },
    });
    if (!dbUser) return false;
    if (dbUser.isDemo) return true;

    const legacyIds = [dbUser.deviceId, dbUser.trustedDevices[0]?.legacyId].filter(Boolean);
    if (legacyIds.length > 0 && !legacyIds.includes(deviceId)) {
      throw new ForbiddenException({ message: 'auth.errors.unrecognizedDevice', code: 'UNRECOGNIZED_DEVICE' });
    }
    return true;
  }
}
