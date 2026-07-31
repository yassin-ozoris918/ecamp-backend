import {
  ForbiddenException,
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private eventEmitter: EventEmitter2,
  ) {}

  async register(dto: RegisterDto, ipAddress?: string, browser?: string, headerDeviceId?: string) {
    // 1. Check if user exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new BadRequestException('Email already in use');
    }
    const hashedPassword = await this.hashData(dto.password);
    
    // Determine the deviceId
    const finalDeviceId = headerDeviceId || dto.deviceId;
    
    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          fullName: dto.fullName,
          email: dto.email,
          password: hashedPassword,
          educationLevel: dto.educationLevel,
          phoneNumber: dto.phoneNumber,
          parentPhoneNumber: dto.parentPhoneNumber,
          profilePictureUrl: dto.profilePictureUrl,
          role: Role.STUDENT,
          deviceId: finalDeviceId || null,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new BadRequestException('This email is already registered. If you deleted your account, please use a different email or contact support.');
      }
      throw error;
    }

    if (user.role === Role.STUDENT && finalDeviceId) {
      await this.prisma.deviceSession.create({
        data: {
          studentId: user.id,
          deviceFingerprint: finalDeviceId,
          browser,
          ipAddress,
          isLocked: false,
        },
      });

      await this.prisma.deviceHistory.create({
        data: {
          studentId: user.id,
          deviceFingerprint: finalDeviceId,
          action: 'REGISTERED',
          ipAddress,
          browser,
        },
      });
    }

    const tokens = await this.getTokens(user.id, user.email, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        full_name: user.fullName,
        profilePictureUrl: user.profilePictureUrl,
        xp: user.xp,
        streak_days: user.streakDays,
        is_active: user.isActive,
      },
    };
  }

  async login(dto: LoginDto, ipAddress?: string, browser?: string, headerDeviceId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.isActive) throw new ForbiddenException('Access Denied');

    const passwordMatches = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches) throw new ForbiddenException('Access Denied');

    // --- DEVICE BINDING LOGIC (STUDENTS ONLY) ---
    if (user.role === Role.STUDENT) {
      const finalDeviceId = headerDeviceId || dto.deviceId;
      
      if (!finalDeviceId) {
        throw new ForbiddenException('Device fingerprint is required for student login.');
      }

      // Scenario B check must happen before the transaction (throws)
      if (user.deviceId && user.deviceId !== finalDeviceId) {
        throw new ForbiddenException(
          'Unrecognized Device. You can only log in from your registered device. Please contact ecamp\'s technical support to request a device reset.'
        );
      }

      await this.prisma.$transaction(async (tx) => {
        // Scenario A: First time logging in. Bind the device permanently.
        if (!user.deviceId) {
          await tx.user.update({
            where: { id: user.id },
            data: { deviceId: finalDeviceId },
          });
          user.deviceId = finalDeviceId;
        }

        // Check if this device fingerprint already has a session record
        const existingSession = await tx.deviceSession.findFirst({
          where: {
            studentId: user.id,
            deviceFingerprint: finalDeviceId,
          },
          select: { id: true },
        });

        // Track the DeviceSession
        await tx.deviceSession.upsert({
          where: {
            studentId_deviceFingerprint: {
              studentId: user.id,
              deviceFingerprint: finalDeviceId,
            },
          },
          update: {
            browser,
            ipAddress,
            lastLoginAt: new Date(),
            isLocked: false,
          },
          create: {
            studentId: user.id,
            deviceFingerprint: finalDeviceId,
            browser,
            ipAddress,
            isLocked: false,
          },
        });

        // Log REGISTERED only for genuinely new device sessions
        if (!existingSession) {
          await tx.deviceHistory.create({
            data: {
              studentId: user.id,
              deviceFingerprint: finalDeviceId,
              action: 'REGISTERED',
              ipAddress,
              browser,
            },
          });
        }
      });
    }

    const tokens = await this.getTokens(user.id, user.email, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    this.eventEmitter.emit('user.login', user.id);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        full_name: user.fullName,
        profilePictureUrl: user.profilePictureUrl,
        xp: user.xp,
        streak_days: user.streakDays,
        is_active: user.isActive,
      },
    };
  }

  async logout(userId: string) {
    await this.prisma.user.updateMany({
      where: {
        id: userId,
        refreshToken: { not: null },
      },
      data: { refreshToken: null },
    });
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.refreshToken)
      throw new ForbiddenException('Access Denied');

    if (!user.isActive) {
      throw new ForbiddenException('Account is suspended');
    }

    const rtMatches = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!rtMatches) throw new ForbiddenException('Access Denied');

    const tokens = await this.getTokens(user.id, user.email, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        full_name: user.fullName,
        profilePictureUrl: user.profilePictureUrl,
        xp: user.xp,
        streak_days: user.streakDays,
        is_active: user.isActive,
      },
    };
  }

  async resetDevice(studentId: string, ipAddress?: string, browser?: string) {
    // Fetch current device fingerprint for history before clearing it
    const user = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { deviceId: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: studentId },
        data: { deviceId: null },
      });

      if (user?.deviceId) {
        await tx.deviceHistory.create({
          data: {
            studentId,
            deviceFingerprint: user.deviceId,
            action: 'RESET',
            ipAddress,
            browser,
          },
        });
      }
    });

    return {
      message:
        'Device binding has been reset successfully. The student can now log in from a new device.',
    };
  }

  // Helper methods

  private hashData(data: string) {
    return bcrypt.hash(data, 10);
  }

  private async updateRefreshToken(userId: string, refreshToken: string) {
    const hashedRt = await this.hashData(refreshToken);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: hashedRt },
    });
  }

  private async getTokens(userId: string, email: string, role: Role) {
    const jwtPayload = { sub: userId, email, role };

    const [at, rt] = await Promise.all([
      this.jwtService.signAsync(jwtPayload, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: '15m', // Short-lived access token
      }),
      this.jwtService.signAsync(jwtPayload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: '7d', // Longer-lived refresh token
      }),
    ]);

    return {
      accessToken: at,
      refreshToken: rt,
    };
  }
}
