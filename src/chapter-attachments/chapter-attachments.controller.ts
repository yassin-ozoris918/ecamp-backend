import { Controller, Post, Get, Delete, Param, Body, UseInterceptors, UploadedFile, UseGuards, InternalServerErrorException, Logger, Req } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { attachmentFileFilter, UPLOAD_LIMITS } from '../common/config/upload.config';
import { ChapterAttachmentsService } from './chapter-attachments.service';
import { CreateChapterAttachmentDto } from './dto/create-chapter-attachment.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface';

@Controller('chapter-attachments')
@UseGuards(AuthGuard('jwt'))
export class ChapterAttachmentsController {
  private readonly logger = new Logger(ChapterAttachmentsController.name);

  constructor(private readonly chapterAttachmentsService: ChapterAttachmentsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: UPLOAD_LIMITS.ATTACHMENT },
      fileFilter: attachmentFileFilter,
    }),
  )
  async uploadAttachment(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: CreateChapterAttachmentDto,
    @Req() req: RequestWithUser,
  ) {
    try {
      this.logger.log('Upload received', { hasFile: !!file, chapterId: body?.chapterId });
      if (!file) throw new Error('File object is undefined from Multer');
      return await this.chapterAttachmentsService.create(file, body, req.user.sub, req.user.role);
    } catch (error: any) {
      this.logger.error('Upload failed', error instanceof Error ? error.message : 'Unknown error');
      throw new InternalServerErrorException(error.message || 'Upload failed');
    }
  }

  @Get('chapter/:chapterId')
  async getByChapter(@Param('chapterId') chapterId: string) {
    return this.chapterAttachmentsService.findAllByChapter(chapterId);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  async deleteAttachment(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.chapterAttachmentsService.delete(id, req.user.sub, req.user.role);
  }
}
