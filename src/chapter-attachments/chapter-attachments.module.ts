import { Module } from '@nestjs/common';
import { ChapterAttachmentsService } from './chapter-attachments.service';
import { ChapterAttachmentsController } from './chapter-attachments.controller';

@Module({
  providers: [ChapterAttachmentsService],
  controllers: [ChapterAttachmentsController]
})
export class ChapterAttachmentsModule {}
