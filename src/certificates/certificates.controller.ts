import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { CertificatesService } from './certificates.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  // Instructor manually issues a certificate to a student
  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Post('issue')
  issueCertificate(
    @Body() body: { studentEmail: string; courseId: string },
    @Req() req: RequestWithUser,
  ) {
    return this.certificatesService.issueCertificate(
      body.courseId,
      body.studentEmail,
      req.user.sub,
      req.user.role,
    );
  }

  // Instructor views certificates for a course
  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Get('course/:courseId')
  getCertificatesForCourse(@Param('courseId') courseId: string) {
    return this.certificatesService.getCertificatesForCourse(courseId);
  }

  // Student views their own certificates
  @Roles(Role.STUDENT)
  @Get('my')
  getMyCertificates(@Req() req: RequestWithUser) {
    const user = req.user;
    return this.certificatesService.getMyCertificates(user.sub);
  }
}
