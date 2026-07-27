import { Test, TestingModule } from '@nestjs/testing';
import { CourseAttachmentsService } from './course-attachments.service';

describe('CourseAttachmentsService', () => {
  let service: CourseAttachmentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CourseAttachmentsService],
    }).compile();

    service = module.get<CourseAttachmentsService>(CourseAttachmentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
