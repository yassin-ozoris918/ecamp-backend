import { Test, TestingModule } from '@nestjs/testing';
import { CourseAttachmentsController } from './course-attachments.controller';

describe('CourseAttachmentsController', () => {
  let controller: CourseAttachmentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CourseAttachmentsController],
    }).compile();

    controller = module.get<CourseAttachmentsController>(CourseAttachmentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
