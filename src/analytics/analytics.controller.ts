import { Controller, Get, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN, Role.INSTRUCTOR)
@Controller('admin/analytics')
export class AnalyticsController {
  constructor(private prisma: PrismaService) {}

  @Get('at-risk')
  async getAtRiskStudents() {
    return this.prisma.studentRiskProfile.findMany({
      where: { isAtRisk: true },
      include: {
        student: {
          select: {
            id: true,
            fullName: true,
            email: true,
            parentPhoneNumber: true,
          }
        }
      },
      orderBy: { consecutiveFailures: 'desc' }
    });
  }
}
