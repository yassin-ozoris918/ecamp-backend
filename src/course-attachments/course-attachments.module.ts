import { Module } from '@nestjs/common';
import { CourseAttachmentsService } from './course-attachments.service';
import { CourseAttachmentsController } from './course-attachments.controller';

@Module({
  providers: [CourseAttachmentsService],
  controllers: [CourseAttachmentsController]
})
export class CourseAttachmentsModule {}
