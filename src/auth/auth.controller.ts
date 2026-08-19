import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  Param,
  Put,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { imageFileFilter, UPLOAD_LIMITS } from '../common/config/upload.config';
import { StorageService } from '../storage/storage.service';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import type { RequestWithUser } from './interfaces/request-with-user.interface';

import { Roles } from './decorators/roles.decorator';
import { RolesGuard } from './guards/roles.guard';
import { Role } from '@prisma/client';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly storageService: StorageService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto, @Req() req: any) {
    const ipAddress = req.ip || req.connection?.remoteAddress;
    const browser = req.headers['user-agent'];
    const deviceIdHeader = req.headers['x-device-id'] as string;
    return this.authService.register(dto, ipAddress, browser, deviceIdHeader);
  }


  @Post('upload-avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: UPLOAD_LIMITS.AVATAR },
      fileFilter: imageFileFilter,
    }),
  )
  async uploadAvatar(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    // The storage service verifies magic bytes, mime type, and generates unique names
    const url = await this.storageService.uploadFile(file, 'avatars');
    return { url };
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 attempts per minute
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() req: any) {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const browser = req.headers['user-agent'];
    const deviceIdHeader = req.headers['x-device-id'] as string;
    return this.authService.login(dto, ipAddress, browser, deviceIdHeader);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Req() req: RequestWithUser) {
    const user = req.user;
    return this.authService.logout(user.sub);
  }

  @UseGuards(AuthGuard('jwt-refresh'))
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refreshTokens(@Req() req: RequestWithUser) {
    const user = req.user;
    const deviceIdHeader = req.headers['x-device-id'] as string;
    return this.authService.refreshTokens(
      user.sub,
      user.refreshToken as string,
      deviceIdHeader
    );
  }

  // --- ADMIN TOOL: Reset Student Device ---
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN)
  @Put(':id/reset-device')
  async resetDevice(@Param('id') studentId: string, @Req() req: RequestWithUser) {
    const browser = req.headers['user-agent'] || undefined;
    return this.authService.resetDevice(studentId, req.ip, browser);
  }
}
