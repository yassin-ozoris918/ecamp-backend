import { Test, TestingModule } from '@nestjs/testing';
import { ProfileUpdateRequestsService } from './profile-update-requests.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { EducationLevel } from '@prisma/client';

describe('ProfileUpdateRequestsService', () => {
  let service: ProfileUpdateRequestsService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileUpdateRequestsService,
        {
          provide: PrismaService,
          useValue: {
            profileUpdateRequest: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            user: {
              update: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<ProfileUpdateRequestsService>(ProfileUpdateRequestsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('approve', () => {
    it('A. HIGH_SCHOOL student: profile update request containing parentPhoneNumber -> approval updates parentPhoneNumber successfully', async () => {
      const mockRequest = {
        id: 'req1',
        status: 'PENDING',
        studentId: 'hs_student1',
        requestedFullName: 'New Name',
        requestedPhoneNumber: '123456789',
        requestedParentPhone: '987654321',
        student: { educationLevel: EducationLevel.HIGH_SCHOOL }
      };

      (prisma.profileUpdateRequest.findUnique as jest.Mock).mockResolvedValue(mockRequest);

      await service.approve('req1', 'admin1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'hs_student1' },
        data: {
          fullName: 'New Name',
          phoneNumber: '123456789',
          parentPhoneNumber: '987654321'
        }
      });
    });

    it('B. UNIVERSITY student: profile update request containing parentPhoneNumber -> approval does NOT persist parentPhoneNumber', async () => {
      const mockRequest = {
        id: 'req2',
        status: 'PENDING',
        studentId: 'uni_student1',
        requestedFullName: 'New Uni Name',
        requestedPhoneNumber: '111222333',
        requestedParentPhone: '999888777', // Maliciously added
        student: { educationLevel: EducationLevel.UNIVERSITY }
      };

      (prisma.profileUpdateRequest.findUnique as jest.Mock).mockResolvedValue(mockRequest);

      await service.approve('req2', 'admin1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'uni_student1' },
        data: {
          fullName: 'New Uni Name',
          phoneNumber: '111222333',
          // parentPhoneNumber MUST be absent/undefined here
        }
      });
    });

    it('C. UNIVERSITY student: existing parentPhoneNumber is null and malicious/legacy request attempts to set it -> remains null (omitted)', async () => {
      const mockRequest = {
        id: 'req3',
        status: 'PENDING',
        studentId: 'uni_student2',
        requestedFullName: null,
        requestedPhoneNumber: null,
        requestedParentPhone: 'malicious', // Only wants to update this
        student: { educationLevel: EducationLevel.UNIVERSITY }
      };

      (prisma.profileUpdateRequest.findUnique as jest.Mock).mockResolvedValue(mockRequest);

      await service.approve('req3', 'admin1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'uni_student2' },
        data: {
          fullName: undefined,
          phoneNumber: undefined,
        }
      });
    });

    it('D. Ensure unrelated profile-update fields still work normally for both levels', async () => {
      // University Name change
      const mockUniReq = {
        id: 'req4',
        status: 'PENDING',
        studentId: 'u3',
        requestedFullName: 'Uni Only Name',
        student: { educationLevel: EducationLevel.UNIVERSITY }
      };
      (prisma.profileUpdateRequest.findUnique as jest.Mock).mockResolvedValueOnce(mockUniReq);
      
      await service.approve('req4', 'admin1');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u3' },
        data: { fullName: 'Uni Only Name', phoneNumber: undefined }
      });

      // High School Phone change
      const mockHsReq = {
        id: 'req5',
        status: 'PENDING',
        studentId: 'h3',
        requestedPhoneNumber: '123',
        student: { educationLevel: EducationLevel.HIGH_SCHOOL }
      };
      (prisma.profileUpdateRequest.findUnique as jest.Mock).mockResolvedValueOnce(mockHsReq);
      
      await service.approve('req5', 'admin1');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'h3' },
        data: { fullName: undefined, phoneNumber: '123', parentPhoneNumber: undefined }
      });
    });
  });
});
