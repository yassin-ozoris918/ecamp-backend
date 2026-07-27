import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DeviceRestrictionGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const deviceId = request.headers['x-device-id'] || request.body?.deviceId || request.query?.deviceId;

    if (!user) {
      return false; // Not authenticated
    }

    if (user.role === 'ADMIN' || user.role === 'INSTRUCTOR') {
      return true; // Restrictions apply to students only
    }

    if (!deviceId) {
      throw new ForbiddenException('Device ID is missing from request.');
    }

    // Fetch the bound device from the database
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.sub || user.id },
      select: { deviceId: true },
    });

    if (!dbUser) {
      return false;
    }

    if (dbUser.deviceId !== deviceId) {
      throw new ForbiddenException(
        'Unrecognized Device. You can only access your account from your registered device. Please contact support to request a device reset.',
      );
    }

    return true;
  }
}
