import { Controller, Post, Get, Delete, Patch, Param, Body, UseInterceptors, UploadedFile, UseGuards, InternalServerErrorException, Logger, Req, Res, Query, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { Readable } from 'stream';
import { FileInterceptor } from '@nestjs/platform-express';
import { attachmentFileFilter, UPLOAD_LIMITS } from '../common/config/upload.config';
import { AttachmentsService } from './attachments.service';
import { CreateAttachmentDto } from './dto/create-attachment.dto';
import { UpdateAttachmentDownloadDto } from './dto/update-attachment-download.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface';

@Controller('attachments')
@UseGuards(AuthGuard('jwt'))
export class AttachmentsController {
  private readonly logger = new Logger(AttachmentsController.name);

  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: UPLOAD_LIMITS.ATTACHMENT },
      fileFilter: attachmentFileFilter,
    }),
  )
  async uploadAttachment(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: CreateAttachmentDto,
    @Req() req: RequestWithUser,
  ) {
    try {
      this.logger.log('Upload received', { hasFile: !!file, lectureId: body?.lectureId });
      if (!file) throw new Error('File object is undefined from Multer');
      return await this.attachmentsService.create(file, body, req.user.sub, req.user.role);
    } catch (error: any) {
      this.logger.error('Upload failed', error instanceof Error ? error.message : 'Unknown error');
      throw new InternalServerErrorException(error.message || 'Upload failed');
    }
  }

  @Get('student/files')
  @UseGuards(RolesGuard)
  @Roles(Role.STUDENT)
  async getStudentFiles(
    @Req() req: RequestWithUser,
    @Query('search') search?: string,
    @Query('courseId') courseId?: string,
    @Query('accessFilter') accessFilter?: string,
  ) {
    return this.attachmentsService.getFilesForStudent(req.user.sub, search, courseId, accessFilter);
  }

  @Get(':id/view')
  async viewAttachment(
    @Param('id') id: string,
    @Req() req: RequestWithUser,
    @Query('download') download?: string,
  ) {
    const isDownload = download === 'true';
    if (req.user.role === Role.STUDENT) {
      const url = await this.attachmentsService.getStudentAttachmentViewUrl(req.user.sub, id, isDownload);
      // url === null => view-only file: the client must use GET :id/stream (no direct URL is ever issued)
      return { url, viewOnly: url === null };
    } else {
      const url = await this.attachmentsService.getInstructorAttachmentViewUrl(id, isDownload);
      return { url, viewOnly: false };
    }
  }

  /** Authenticated, inline-only byte stream used for view-only files. Never sets attachment disposition. */
  @Get(':id/stream')
  async streamAttachment(
    @Param('id') id: string,
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = req.user.role === Role.STUDENT
      ? await this.attachmentsService.getStudentAttachmentStream(req.user.sub, id)
      : await this.attachmentsService.getInstructorAttachmentStream(id);

    res.set({
      'Content-Type': file.contentType,
      'Content-Disposition': 'inline',
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
      ...(file.contentLength ? { 'Content-Length': String(file.contentLength) } : {}),
    });
    return new StreamableFile(file.stream as Readable);
  }

  @Get('lecture/:lectureId')
  async getByLecture(@Param('lectureId') lectureId: string, @Req() req: RequestWithUser) {
    const attachments = await this.attachmentsService.findAllByLecture(lectureId);
    
    if (req.user.role === Role.STUDENT) {
      const accessibleFiles: any[] = [];
      for (const att of attachments) {
        const hasAccess = await this.attachmentsService.hasFileAccess(req.user.sub, att.id);
        if (hasAccess) {
          const { fileUrl, ...safeAtt } = att;
          accessibleFiles.push(safeAtt);
        }
      }
      return accessibleFiles;
    }
    
    return attachments;
  }

  @Patch(':id/download-policy')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async updateDownloadPolicy(
    @Param('id') id: string,
    @Body() body: UpdateAttachmentDownloadDto,
    @Req() req: RequestWithUser,
  ) {
    return this.attachmentsService.updateDownloadPolicy(id, body.allowDownload, req.user.sub, req.user.role);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async deleteAttachment(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.attachmentsService.delete(id, req.user.sub, req.user.role);
  }
}
