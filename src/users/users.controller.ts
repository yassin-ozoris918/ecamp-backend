import {
  Controller,
  Post,
  Patch,
  Get,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
  BadRequestException,
  Body,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { imageFileFilter, UPLOAD_LIMITS } from '../common/config/upload.config';
import { StorageService } from '../storage/storage.service';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface';
import { UpdatePasswordDto } from './dto/update-password.dto';

@UseGuards(AuthGuard('jwt'))
@Controller('users')
export class UsersController {
  @Get('me')
  async getMe(@Req() req: RequestWithUser) {
    const user = req.user;
    return this.usersService.getProfile(user.sub);
  }

  constructor(
    private readonly usersService: UsersService,
    private readonly storageService: StorageService,
  ) {}

  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: UPLOAD_LIMITS.AVATAR },
      fileFilter: imageFileFilter,
    }),
  )
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: RequestWithUser,
  ) {
    const user = req.user;
    // The storage service verifies the file extensions and generates unique names
    const url = await this.storageService.uploadFile(file, 'avatars');
    await this.usersService.updateAvatar(user.sub, url);
    return { message: 'Profile picture updated successfully', url };
  }

  @Post('password')
  async updatePassword(
    @Body() dto: UpdatePasswordDto,
    @Req() req: RequestWithUser,
  ) {
    const user = req.user;
    return this.usersService.updatePassword(
      user.sub,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @Patch('profile')
  async updateProfile(
    @Body()
    body: {
      fullName?: string;
      phoneNumber?: string;
      parentPhoneNumber?: string;
      highSchoolSystem?: any;
      studyMode?: any;
      studyLanguage?: any;
      highSchoolGrade?: any;
      traditionalBranch?: any;
      baccalaureatePath?: any;
      university?: string;
      faculty?: string;
      department?: string;
      academicYear?: string;
    },
    @Req() req: RequestWithUser,
  ) {
    const user = req.user;
    return this.usersService.updateProfile(user.sub, body);
  }
}
