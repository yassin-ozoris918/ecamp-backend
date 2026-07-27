import { Test, TestingModule } from '@nestjs/testing';
import { ChapterAttachmentsController } from './chapter-attachments.controller';

describe('ChapterAttachmentsController', () => {
  let controller: ChapterAttachmentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChapterAttachmentsController],
    }).compile();

    controller = module.get<ChapterAttachmentsController>(ChapterAttachmentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
