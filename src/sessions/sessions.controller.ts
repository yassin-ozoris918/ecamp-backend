import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface';

// --- New Imports for Phase 14 Storage ---
import { FileInterceptor } from '@nestjs/platform-express';
import { videoFileFilter, UPLOAD_LIMITS } from '../common/config/upload.config';
import { StorageService } from '../storage/storage.service'; // Adjust path if necessary

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('sessions')
export class SessionsController {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly storageService: StorageService,
  ) {}

  // --- EXISTING CRUD OPERATIONS ---

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Post()
  create(@Body() dto: CreateSessionDto, @Req() req: RequestWithUser) {
    const user = req.user;
    return this.sessionsService.create(dto, user.sub, user.role);
  }

  // Fetch all sessions (videos) for a specific lecture
  @Get('lecture/:lectureId')
  findByLecture(@Param('lectureId') lectureId: string) {
    return this.sessionsService.findByLecture(lectureId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.sessionsService.findOne(id);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateSessionDto>,
    @Req() req: RequestWithUser,
  ) {
    const user = req.user;
    return this.sessionsService.update(id, dto, user.sub, user.role);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) {
    const user = req.user;
    return this.sessionsService.remove(id, user.sub, user.role);
  }

  // --- NEW PHASE 14 VIDEO UPLOAD OPERATION ---

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Post(':id/upload-video')
  @UseInterceptors(
    FileInterceptor('video', {
      limits: { fileSize: UPLOAD_LIMITS.VIDEO },
      fileFilter: videoFileFilter,
    }),
  )
  async uploadVideo(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: RequestWithUser,
  ) {
    if (!file) {
      throw new BadRequestException('No video file uploaded.');
    }

    // 1. Stream directly to Cloudflare R2 inside the 'videos' folder
    const videoUrl = await this.storageService.uploadFile(file, 'videos');

    // 2. Persist the asset URL to the database
    const updatedSession = await this.sessionsService.updateVideoUrl(
      id,
      videoUrl,
      req.user.sub,
      req.user.role,
    );

    return {
      message: 'Lecture video uploaded and attached successfully.',
      session: updatedSession,
    };
  }
}
