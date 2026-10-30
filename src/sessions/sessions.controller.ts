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
  Optional,
} from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface';

// --- New Imports for Phase 14 Storage & Cloudflare Stream ---
import { FileInterceptor } from '@nestjs/platform-express';
import { videoFileFilter, UPLOAD_LIMITS, MIME_TYPES } from '../common/config/upload.config';
import { StorageService } from '../storage/storage.service';
import { CloudflareService } from '../cloudflare/cloudflare.service';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('sessions')
export class SessionsController {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly storageService: StorageService,
    @Optional() private readonly cloudflareService?: CloudflareService,
  ) {}

  // --- EXISTING CRUD OPERATIONS ---

  @Roles(Role.ADMIN)
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

  @Roles(Role.ADMIN)
  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateSessionDto>,
    @Req() req: RequestWithUser,
  ) {
    const user = req.user;
    return this.sessionsService.update(id, dto, user.sub, user.role);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) {
    const user = req.user;
    return this.sessionsService.remove(id, user.sub, user.role);
  }

  // --- NEW PHASE 14 VIDEO UPLOAD OPERATION ---

  @Roles(Role.ADMIN)
  @Post(':id/video/upload/init')
  async initUpload(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { filename: string; mimetype: string; fileSize: number },
    @Req() req: RequestWithUser,
  ) {
    if (!body.filename || !body.mimetype || typeof body.fileSize !== 'number') {
      throw new BadRequestException('Filename, mimetype, and fileSize are required.');
    }

    if (!(MIME_TYPES.VIDEO as readonly string[]).includes(body.mimetype)) {
      throw new BadRequestException(`Unsupported MIME type: "${body.mimetype}". Accepted: ${MIME_TYPES.VIDEO.join(', ')}`);
    }

    if (body.fileSize > UPLOAD_LIMITS.VIDEO) {
      throw new BadRequestException(`File size exceeds the limit of ${UPLOAD_LIMITS.VIDEO} bytes.`);
    }

    // Authorization check
    await this.sessionsService.verifySessionOwnershipById(id, req.user.sub, req.user.role);

    if (this.cloudflareService?.isConfigured()) {
      const { uploadUrl, objectKey, assetUrl } =
        await this.cloudflareService.createDirectUploadUrl({
          filename: body.filename,
        });

      return {
        uploadUrl,
        objectKey,
        assetUrl,
        provider: 'CLOUDFLARE_STREAM',
        expiresIn: 3600,
      };
    }

    const { uploadUrl, objectKey, assetUrl } = await this.storageService.generatePresignedUrl(
      'videos',
      body.filename,
      body.mimetype,
      body.fileSize,
    );

    return { uploadUrl, objectKey, assetUrl, provider: 'R2', expiresIn: 3600 };
  }

  @Roles(Role.ADMIN)
  @Post(':id/video/upload/complete')
  async completeUpload(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { objectKey: string; assetUrl: string },
    @Req() req: RequestWithUser,
  ) {
    if (!body.objectKey || !body.assetUrl) {
      throw new BadRequestException('Object key and asset URL are required.');
    }

    // Authorization check (redundant since updateVideoUrl also checks, but good for validation phase)
    await this.sessionsService.verifySessionOwnershipById(id, req.user.sub, req.user.role);

    const isCloudflareStream =
      this.cloudflareService?.isConfigured() &&
      (Boolean(this.cloudflareService.extractVideoUid(body.objectKey)) ||
        body.assetUrl.includes('cloudflarestream.com'));

    const exists = isCloudflareStream
      ? await this.cloudflareService!.verifyVideoExists(body.objectKey)
      : await this.storageService.verifyR2Object(body.objectKey);

    if (!exists) {
      throw new BadRequestException('File not found in storage. Upload may have failed.');
    }

    const updatedSession = await this.sessionsService.updateVideoUrl(
      id,
      body.assetUrl,
      req.user.sub,
      req.user.role,
    );

    return {
      message: 'Lecture video uploaded and finalized successfully.',
      session: updatedSession,
    };
  }

  @Roles(Role.ADMIN)
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

    // 1. Upload directly to Cloudflare Stream (if configured) or R2 fallback
    const videoUrl = this.cloudflareService?.isConfigured()
      ? await this.cloudflareService.uploadVideoBuffer(
          file.buffer,
          file.originalname,
          file.mimetype,
        )
      : await this.storageService.uploadFile(file, 'videos');

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
