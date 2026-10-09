import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  ParseUUIDPipe,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { TutorialsService } from './tutorials.service';
import { CreateCategoryDto, CreateTutorialDto, UpdateTutorialDto } from './dto/tutorial.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface';
import { FileInterceptor } from '@nestjs/platform-express';
import { videoFileFilter, UPLOAD_LIMITS, MIME_TYPES } from '../common/config/upload.config';
import { StorageService } from '../storage/storage.service';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('tutorials')
export class TutorialsController {
  constructor(
    private readonly tutorialsService: TutorialsService,
    private readonly storageService: StorageService,
  ) {}

  // --- Admin Endpoints ---

  @Roles(Role.ADMIN)
  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.tutorialsService.createCategory(dto);
  }

  @Roles(Role.ADMIN)
  @Patch('categories/:id')
  updateCategory(@Param('id', ParseUUIDPipe) id: string, @Body() dto: Partial<CreateCategoryDto>) {
    return this.tutorialsService.updateCategory(id, dto);
  }

  @Roles(Role.ADMIN)
  @Get('categories/all')
  findAllCategoriesAdmin() {
    return this.tutorialsService.findAllCategories(true);
  }

  @Roles(Role.ADMIN)
  @Post()
  createTutorial(@Body() dto: CreateTutorialDto) {
    return this.tutorialsService.createTutorial(dto);
  }

  @Roles(Role.ADMIN)
  @Get('all')
  findAllTutorialsAdmin() {
    return this.tutorialsService.findAllTutorials(true);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  updateTutorial(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTutorialDto) {
    return this.tutorialsService.updateTutorial(id, dto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  deleteTutorial(@Param('id', ParseUUIDPipe) id: string) {
    return this.tutorialsService.deleteTutorial(id);
  }

  // Upload Endpoints
  @Roles(Role.ADMIN)
  @Post(':id/video/upload/init')
  async initUpload(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { filename: string; mimetype: string; fileSize: number },
  ) {
    if (!body.filename || !body.mimetype || typeof body.fileSize !== 'number') {
      throw new BadRequestException('Filename, mimetype, and fileSize are required.');
    }
    if (!(MIME_TYPES.VIDEO as readonly string[]).includes(body.mimetype)) {
      throw new BadRequestException(`Unsupported MIME type.`);
    }
    if (body.fileSize > UPLOAD_LIMITS.VIDEO) {
      throw new BadRequestException(`File size exceeds limit.`);
    }

    const { uploadUrl, objectKey, assetUrl } = await this.storageService.generatePresignedUrl(
      'videos',
      body.filename,
      body.mimetype,
      body.fileSize,
    );
    return { uploadUrl, objectKey, assetUrl, expiresIn: 3600 };
  }

  @Roles(Role.ADMIN)
  @Post(':id/video/upload/complete')
  async completeUpload(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { objectKey: string; assetUrl: string },
  ) {
    if (!body.objectKey || !body.assetUrl) {
      throw new BadRequestException('Object key and asset URL required.');
    }
    const exists = await this.storageService.verifyR2Object(body.objectKey);
    if (!exists) {
      throw new BadRequestException('File not found in storage.');
    }
    return this.tutorialsService.updateTutorialVideoUrl(id, body.assetUrl);
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
  ) {
    if (!file) {
      throw new BadRequestException('No video file uploaded.');
    }
    const videoUrl = await this.storageService.uploadFile(file, 'videos');
    return this.tutorialsService.updateTutorialVideoUrl(id, videoUrl);
  }

  // --- Student Endpoints ---

  @Get('categories')
  findAllCategoriesActive() {
    return this.tutorialsService.findAllCategories(false);
  }

  @Get()
  findAllTutorialsStudent(@Req() req: RequestWithUser) {
    return this.tutorialsService.findTutorialsForStudent(req.user.sub);
  }

  @Get(':id')
  findOneTutorialStudent(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) {
    return this.tutorialsService.findOneTutorialForStudent(id, req.user.sub);
  }
}
