import { Controller, Post, Get, Delete, Param, Body, UseInterceptors, UploadedFile, UseGuards, InternalServerErrorException, Logger, Req, Query } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { attachmentFileFilter, UPLOAD_LIMITS } from '../common/config/upload.config';
import { AttachmentsService } from './attachments.service';
import { CreateAttachmentDto } from './dto/create-attachment.dto';
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
  @Roles(Role.INSTRUCTOR, Role.ADMIN)
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
  async viewAttachment(@Param('id') id: string, @Req() req: RequestWithUser) {
    if (req.user.role === Role.STUDENT) {
      const url = await this.attachmentsService.getStudentAttachmentViewUrl(req.user.sub, id);
      return { url };
    } else {
      const url = await this.attachmentsService.getInstructorAttachmentViewUrl(id);
      return { url };
    }
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

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  async deleteAttachment(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.attachmentsService.delete(id, req.user.sub, req.user.role);
  }
}
