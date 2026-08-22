import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CourseAttachmentsController } from './course-attachments.controller';
import { CourseAttachmentsService } from './course-attachments.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '@prisma/client';

// ---------------------------------------------------------------------------
// Minimal mock — only the service methods called by the controller
// ---------------------------------------------------------------------------

const mockCourseAttachmentsService = {
  create: jest.fn(),
  findAllByCourse: jest.fn(),
  delete: jest.fn(),
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('CourseAttachmentsController', () => {
  let controller: CourseAttachmentsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CourseAttachmentsController],
      providers: [
        { provide: CourseAttachmentsService, useValue: mockCourseAttachmentsService },
      ],
    })
      // Override guards so they don't require a real JWT/Passport setup in unit tests
      .overrideGuard(AuthGuard('jwt'))
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CourseAttachmentsController>(CourseAttachmentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // getByCourse()
  // -------------------------------------------------------------------------

  describe('getByCourse()', () => {
    it('should return attachments for the given course', async () => {
      const attachments = [{ id: 'att-1', title: 'Syllabus', courseId: 'course-1', fileUrl: '/url' }];
      mockCourseAttachmentsService.findAllByCourse.mockResolvedValue(attachments);

      const result = await controller.getByCourse('course-1');

      expect(mockCourseAttachmentsService.findAllByCourse).toHaveBeenCalledWith('course-1');
      expect(result).toEqual(attachments);
    });
  });

  // -------------------------------------------------------------------------
  // uploadAttachment()
  // -------------------------------------------------------------------------

  describe('uploadAttachment()', () => {
    const mockFile = {
      originalname: 'syllabus.pdf',
      buffer: Buffer.from(''),
      mimetype: 'application/pdf',
    } as Express.Multer.File;

    const mockReq = { user: { sub: 'instructor-1', role: Role.INSTRUCTOR } } as any;

    it('should call service.create and return the result', async () => {
      const created = { id: 'att-1', title: 'Syllabus', courseId: 'course-1', fileUrl: '/url' };
      mockCourseAttachmentsService.create.mockResolvedValue(created);

      const dto = { courseId: 'course-1', title: 'Syllabus' };
      const result = await controller.uploadAttachment(mockFile, dto, mockReq);

      expect(mockCourseAttachmentsService.create).toHaveBeenCalledWith(
        mockFile,
        dto,
        'instructor-1',
        Role.INSTRUCTOR,
      );
      expect(result).toEqual(created);
    });

    it('should throw InternalServerErrorException when file is missing', async () => {
      await expect(
        controller.uploadAttachment(undefined as any, { courseId: 'course-1', title: '' }, mockReq),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // -------------------------------------------------------------------------
  // deleteAttachment()
  // -------------------------------------------------------------------------

  describe('deleteAttachment()', () => {
    it('should call service.delete and return the result', async () => {
      mockCourseAttachmentsService.delete.mockResolvedValue({ id: 'att-1' });
      const mockReq = { user: { sub: 'instructor-1', role: Role.INSTRUCTOR } } as any;

      const result = await controller.deleteAttachment('att-1', mockReq);

      expect(mockCourseAttachmentsService.delete).toHaveBeenCalledWith(
        'att-1',
        'instructor-1',
        Role.INSTRUCTOR,
      );
      expect(result).toEqual({ id: 'att-1' });
    });
  });
});
