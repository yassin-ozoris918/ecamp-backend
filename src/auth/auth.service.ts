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
import { Role, EducationLevel } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MaintenancePolicy } from './policies/maintenance.policy';

import { validateUniversitySegmentation, validateStudentSegmentation, normalizeEducationProfile } from '../common/utils/segmentation-validation.util';
import { DeviceTrustService, type DeviceContext, type DeviceGrant, type DeviceInput } from '../devices/device-trust.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private eventEmitter: EventEmitter2,
    private maintenancePolicy: MaintenancePolicy,
    private devices: DeviceTrustService,
  ) {}

  async register(dto: RegisterDto, ipAddress?: string, browser?: string, headerDeviceId?: string) {
    await this.maintenancePolicy.validateRegistration();

    // 1. Check if user exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new BadRequestException('auth.errors.emailAlreadyInUse');
    }

    if (dto.phoneNumber && dto.parentPhoneNumber && dto.phoneNumber.trim() === dto.parentPhoneNumber.trim()) {
      throw new BadRequestException('auth.errors.duplicatePhoneError');
    }

    const hashedPassword = await this.hashData(dto.password);
    
    // Determine the deviceId
    const finalDeviceId = headerDeviceId || dto.deviceId;
    
    // Normalize education profile fields
    normalizeEducationProfile(dto);

    // Validate university hierarchy
    if (dto.educationLevel === EducationLevel.UNIVERSITY) {
      await validateUniversitySegmentation(this.prisma, dto);
    } else {
      validateStudentSegmentation(dto);
    }

    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          fullName: dto.fullName,
          email: dto.email,
          password: hashedPassword,
          educationLevel: dto.educationLevel,
          highSchoolSystem: dto.highSchoolSystem,
          studyMode: dto.studyMode,
          studyLanguage: dto.studyLanguage,
          highSchoolGrade: dto.highSchoolGrade,
          traditionalBranch: dto.traditionalBranch,
          baccalaureatePath: dto.baccalaureatePath,
          universityId: dto.universityId,
          facultyId: dto.facultyId,
          departmentId: dto.departmentId,
          programId: dto.programId,
          otherUniversityName: dto.otherUniversityName,
          otherFacultyName: dto.otherFacultyName,
          otherDepartmentName: dto.otherDepartmentName,
          otherProgramName: dto.otherProgramName,
          phoneNumber: dto.phoneNumber,
          parentPhoneNumber: dto.parentPhoneNumber,
          profilePictureUrl: dto.profilePictureUrl,
          role: Role.STUDENT,
          // New clients link the device through DeviceTrustService below; old clients use the single hash.
          deviceId: dto.device ? null : finalDeviceId || null,
          isActive: true, // Auto-approve on registration ("Pending" manual approval is currently on hold)
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const target = error?.meta?.target;
        if (target?.includes('phoneNumber')) {
          throw new BadRequestException('auth.errors.phoneAlreadyInUse');
        }
        throw new BadRequestException('auth.errors.emailAlreadyInUse');
      }
      throw error;
    }

    let grant: DeviceGrant = { deviceId: null, browserId: null };
    if (user.role === Role.STUDENT && dto.device) {
      grant = await this.devices.checkSignIn(
        { id: user.id, deviceId: null },
        dto.device as DeviceInput,
        { ip: ipAddress, userAgent: browser, headerDeviceId: headerDeviceId || dto.deviceId },
        'register',
      );
    } else if (user.role === Role.STUDENT && finalDeviceId) {
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

    // Hold "Pending" flow: only return PENDING_APPROVAL if student is created with isActive: false
    if (user.role === Role.STUDENT && !user.isActive) {
      return {
        status: 'PENDING_APPROVAL',
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          full_name: user.fullName,
          profilePictureUrl: user.profilePictureUrl,
          xp: user.xp,
          streak_days: user.streakDays,
          is_active: user.isActive,
          phone_number: user.phoneNumber,
          parent_phone_number: user.parentPhoneNumber,
        },
      };
    }

    // Issue tokens and return full profile for approved users
    const tokens = await this.getTokens(user.id, user.email, user.role, grant);
    await this.storeRefreshToken(user.id, grant, tokens.refreshToken);

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
        phone_number: user.phoneNumber,
        parent_phone_number: user.parentPhoneNumber,
        educationLevel: user.educationLevel,
        highSchoolSystem: user.highSchoolSystem,
        studyMode: user.studyMode,
        studyLanguage: user.studyLanguage,
        highSchoolGrade: user.highSchoolGrade,
        traditionalBranch: user.traditionalBranch,
        baccalaureatePath: user.baccalaureatePath,
        universityId: user.universityId,
        facultyId: user.facultyId,
        departmentId: user.departmentId,
        programId: user.programId,
        otherUniversityName: user.otherUniversityName,
        otherFacultyName: user.otherFacultyName,
        otherDepartmentName: user.otherDepartmentName,
        otherProgramName: user.otherProgramName,
      },
    };
  }

  async login(dto: LoginDto, ipAddress?: string, browser?: string, headerDeviceId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) throw new ForbiddenException('auth.errors.invalidCredentials');

    await this.maintenancePolicy.validateLogin(user.role);

    if (!user.isActive) throw new ForbiddenException('auth.errors.accountPending');

    const passwordMatches = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches) throw new ForbiddenException('auth.errors.invalidCredentials');

    // --- TRUSTED DEVICE (STUDENTS ONLY, non-demo) ---
    let grant: DeviceGrant = { deviceId: null, browserId: null };
    if (user.role === Role.STUDENT && !(user as any).isDemo) {
      grant = await this.devices.checkSignIn(
        { id: user.id, deviceId: user.deviceId },
        dto.device as DeviceInput | undefined,
        { ip: ipAddress, userAgent: browser, headerDeviceId: headerDeviceId || dto.deviceId },
        'login',
      );
    }

    const tokens = await this.getTokens(user.id, user.email, user.role, grant);
    await this.storeRefreshToken(user.id, grant, tokens.refreshToken);

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
        phone_number: user.phoneNumber,
        parent_phone_number: user.parentPhoneNumber,
        educationLevel: user.educationLevel,
        highSchoolSystem: user.highSchoolSystem,
        studyMode: user.studyMode,
        studyLanguage: user.studyLanguage,
        highSchoolGrade: user.highSchoolGrade,
        traditionalBranch: user.traditionalBranch,
        baccalaureatePath: user.baccalaureatePath,
        universityId: user.universityId,
        facultyId: user.facultyId,
        departmentId: user.departmentId,
        programId: user.programId,
        otherUniversityName: user.otherUniversityName,
        otherFacultyName: user.otherFacultyName,
        otherDepartmentName: user.otherDepartmentName,
        otherProgramName: user.otherProgramName,
      },
    };
  }

  async logout(userId: string, browserId?: string) {
    if (browserId) {
      await this.devices.saveBrowserRefreshToken(browserId, null);
      return;
    }
    await this.prisma.user.updateMany({
      where: {
        id: userId,
        refreshToken: { not: null },
      },
      data: { refreshToken: null },
    });
  }

  async refreshTokens(
    userId: string,
    refreshToken: string,
    deviceIdHeader?: string,
    device?: DeviceInput,
    browserId?: string,
    ctx: Omit<DeviceContext, 'headerDeviceId'> = {},
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new ForbiddenException('Access Denied');
    if (!user.isActive) {
      throw new ForbiddenException('Account is suspended');
    }

    let grant: DeviceGrant = { deviceId: null, browserId: null };
    let storedHash: string | null = user.refreshToken;

    if (user.role === Role.STUDENT && !(user as any).isDemo) {
      if (browserId) {
        // Login tied to a browser: that browser must still be trusted and prove it holds its key.
        const browser = await this.devices.checkRefresh(user.id, browserId, device, { ...ctx, headerDeviceId: deviceIdHeader });
        grant = { deviceId: browser.deviceId, browserId: browser.id };
        storedHash = browser.refreshTokenHash;
      } else {
        // Login from before the trusted-device upgrade: check (and upgrade) the device like a sign-in.
        grant = await this.devices.checkSignIn(
          { id: user.id, deviceId: user.deviceId },
          device,
          { ...ctx, headerDeviceId: deviceIdHeader },
          'refresh',
        );
      }
    }

    if (!storedHash) throw new ForbiddenException('Access Denied');
    const rtMatches = await bcrypt.compare(refreshToken, storedHash);
    if (!rtMatches) throw new ForbiddenException('Access Denied');

    const tokens = await this.getTokens(user.id, user.email, user.role, grant);
    await this.storeRefreshToken(user.id, grant, tokens.refreshToken);

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
        phone_number: user.phoneNumber,
        parent_phone_number: user.parentPhoneNumber,
        educationLevel: user.educationLevel,
        highSchoolSystem: user.highSchoolSystem,
        studyMode: user.studyMode,
        studyLanguage: user.studyLanguage,
        highSchoolGrade: user.highSchoolGrade,
        traditionalBranch: user.traditionalBranch,
        baccalaureatePath: user.baccalaureatePath,
        universityId: user.universityId,
        facultyId: user.facultyId,
        departmentId: user.departmentId,
        programId: user.programId,
        otherUniversityName: user.otherUniversityName,
        otherFacultyName: user.otherFacultyName,
        otherDepartmentName: user.otherDepartmentName,
        otherProgramName: user.otherProgramName,
      },
    };
  }

  async resetDevice(studentId: string, ipAddress?: string, browser?: string) {
    await this.devices.resetStudentDevice(studentId, { ip: ipAddress, userAgent: browser });
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

  /** Students' refresh tokens live on their browser record, so each browser has its own login. */
  private async storeRefreshToken(userId: string, grant: DeviceGrant, refreshToken: string) {
    if (grant.browserId) {
      await this.devices.saveBrowserRefreshToken(grant.browserId, await this.hashData(refreshToken));
    } else {
      await this.updateRefreshToken(userId, refreshToken);
    }
  }

  private async getTokens(userId: string, email: string, role: Role, grant?: DeviceGrant) {
    const jwtPayload = {
      sub: userId,
      email,
      role,
      ...(grant?.deviceId ? { did: grant.deviceId } : {}),
      ...(grant?.browserId ? { bid: grant.browserId } : {}),
    };

    const [at, rt] = await Promise.all([
      this.jwtService.signAsync(jwtPayload, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: '2h', // Increased from 15m to 2h for large file uploads
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
