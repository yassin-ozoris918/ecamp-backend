import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('This account has been deactivated or deleted.');
    return {
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
    };
  }

  constructor(private prisma: PrismaService) {}

  async updateAvatar(userId: string, profilePictureUrl: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id: userId },
      data: { profilePictureUrl },
      select: {
        id: true,
        email: true,
        fullName: true,
        profilePictureUrl: true,
        role: true,
        isActive: true,
        educationLevel: true,
        phoneNumber: true,
        parentPhoneNumber: true,
      },
    });
  }

  async updatePassword(userId: string, current: string, newPass: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const valid = await bcrypt.compare(current, user.password);
    if (!valid) throw new BadRequestException('Invalid current password');

    const hashedPassword = await bcrypt.hash(newPass, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return { message: 'Password updated successfully' };
  }

  async updateProfile(
    userId: string,
    data: {
      fullName?: string;
      phoneNumber?: string;
      parentPhoneNumber?: string;
    },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: data.fullName,
        phoneNumber: data.phoneNumber,
        parentPhoneNumber: data.parentPhoneNumber,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        profilePictureUrl: true,
        role: true,
        isActive: true,
        educationLevel: true,
        phoneNumber: true,
        parentPhoneNumber: true,
      },
    });
  }
}
