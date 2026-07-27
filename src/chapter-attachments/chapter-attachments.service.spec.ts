import { Test, TestingModule } from '@nestjs/testing';
import { ChapterAttachmentsService } from './chapter-attachments.service';

describe('ChapterAttachmentsService', () => {
  let service: ChapterAttachmentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChapterAttachmentsService],
    }).compile();

    service = module.get<ChapterAttachmentsService>(ChapterAttachmentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
