import { Test, TestingModule } from '@nestjs/testing';
import { CourseAttachmentsService } from './course-attachments.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';

// ---------------------------------------------------------------------------
// Minimal mocks — only the Prisma model methods actually used by this service
// ---------------------------------------------------------------------------

const mockPrisma = {
  courseAttachment: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
  courseInstructor: {
    findFirst: jest.fn(),
  },
};

const mockStorage = {
  uploadFile: jest.fn(),
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('CourseAttachmentsService', () => {
  let service: CourseAttachmentsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CourseAttachmentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
      ],
    }).compile();

    service = module.get<CourseAttachmentsService>(CourseAttachmentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // create()
  // -------------------------------------------------------------------------

  describe('create()', () => {
    const mockFile = {
      originalname: 'syllabus.pdf',
      buffer: Buffer.from(''),
      mimetype: 'application/pdf',
    } as Express.Multer.File;

    const dto = { courseId: 'course-1', title: 'Syllabus' };
    const instructorId = 'instructor-1';

    it('should upload file and create attachment record for ADMIN (no ownership check)', async () => {
      mockStorage.uploadFile.mockResolvedValue('/uploads/courses/file.pdf');
      mockPrisma.courseAttachment.create.mockResolvedValue({
        id: 'att-1',
        title: 'Syllabus',
        courseId: 'course-1',
        fileUrl: '/uploads/courses/file.pdf',
      });

      const result = await service.create(mockFile, dto, instructorId, Role.ADMIN);

      expect(mockStorage.uploadFile).toHaveBeenCalledWith(mockFile, 'courses');
      expect(mockPrisma.courseAttachment.create).toHaveBeenCalledWith({
        data: {
          title: 'Syllabus',
          courseId: 'course-1',
          fileUrl: '/uploads/courses/file.pdf',
        },
      });
      expect(result.fileUrl).toBe('/uploads/courses/file.pdf');
    });

    it('should use file.originalname as title when dto.title is not provided', async () => {
      mockStorage.uploadFile.mockResolvedValue('/uploads/courses/file.pdf');
      mockPrisma.courseAttachment.create.mockResolvedValue({
        id: 'att-2',
        title: 'syllabus.pdf',
        courseId: 'course-1',
        fileUrl: '/uploads/courses/file.pdf',
      });

      await service.create(mockFile, { courseId: 'course-1', title: '' }, instructorId, Role.ADMIN);

      expect(mockPrisma.courseAttachment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ title: 'syllabus.pdf' }) }),
      );
    });

    it('should throw ForbiddenException when instructor does not own the course', async () => {
      mockPrisma.courseInstructor.findFirst.mockResolvedValue(null); // no mapping

      await expect(
        service.create(mockFile, dto, 'other-instructor', Role.INSTRUCTOR),
      ).rejects.toThrow(ForbiddenException);

      expect(mockStorage.uploadFile).not.toHaveBeenCalled();
    });

    it('should allow INSTRUCTOR who owns the course to create an attachment', async () => {
      mockPrisma.courseInstructor.findFirst.mockResolvedValue({ id: 'mapping-1' });
      mockStorage.uploadFile.mockResolvedValue('/uploads/courses/file.pdf');
      mockPrisma.courseAttachment.create.mockResolvedValue({
        id: 'att-3',
        title: 'Syllabus',
        courseId: 'course-1',
        fileUrl: '/uploads/courses/file.pdf',
      });

      const result = await service.create(mockFile, dto, instructorId, Role.INSTRUCTOR);

      expect(result.id).toBe('att-3');
    });
  });

  // -------------------------------------------------------------------------
  // findAllByCourse()
  // -------------------------------------------------------------------------

  describe('findAllByCourse()', () => {
    it('should return all attachments for a course ordered by createdAt asc', async () => {
      const attachments = [
        { id: 'att-1', title: 'Syllabus', courseId: 'course-1', fileUrl: '/url' },
      ];
      mockPrisma.courseAttachment.findMany.mockResolvedValue(attachments);

      const result = await service.findAllByCourse('course-1');

      expect(mockPrisma.courseAttachment.findMany).toHaveBeenCalledWith({
        where: { courseId: 'course-1' },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toEqual(attachments);
    });
  });

  // -------------------------------------------------------------------------
  // delete()
  // -------------------------------------------------------------------------

  describe('delete()', () => {
    it('should delete the attachment when instructor owns the course', async () => {
      mockPrisma.courseAttachment.findUnique.mockResolvedValue({
        id: 'att-1',
        courseId: 'course-1',
      });
      mockPrisma.courseInstructor.findFirst.mockResolvedValue({ id: 'mapping-1' });
      mockPrisma.courseAttachment.delete.mockResolvedValue({ id: 'att-1' });

      const result = await service.delete('att-1', 'instructor-1', Role.INSTRUCTOR);

      expect(mockPrisma.courseAttachment.delete).toHaveBeenCalledWith({ where: { id: 'att-1' } });
      expect(result).toEqual({ id: 'att-1' });
    });

    it('should throw NotFoundException when attachment does not exist', async () => {
      mockPrisma.courseAttachment.findUnique.mockResolvedValue(null);

      await expect(
        service.delete('nonexistent-id', 'instructor-1', Role.INSTRUCTOR),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when instructor does not own the course', async () => {
      mockPrisma.courseAttachment.findUnique.mockResolvedValue({
        id: 'att-1',
        courseId: 'course-1',
      });
      mockPrisma.courseInstructor.findFirst.mockResolvedValue(null); // no mapping

      await expect(
        service.delete('att-1', 'other-instructor', Role.INSTRUCTOR),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.courseAttachment.delete).not.toHaveBeenCalled();
    });

    it('should allow ADMIN to delete any attachment without ownership check', async () => {
      mockPrisma.courseAttachment.findUnique.mockResolvedValue({
        id: 'att-1',
        courseId: 'course-1',
      });
      mockPrisma.courseAttachment.delete.mockResolvedValue({ id: 'att-1' });

      await service.delete('att-1', 'any-user', Role.ADMIN);

      // ADMIN bypasses ownership; courseInstructor.findFirst should NOT be queried
      expect(mockPrisma.courseInstructor.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.courseAttachment.delete).toHaveBeenCalled();
    });
  });
});
