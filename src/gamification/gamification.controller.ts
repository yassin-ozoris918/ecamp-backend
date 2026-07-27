import { Controller, Get, UseGuards, Req, Query } from '@nestjs/common';
import { GamificationService } from './gamification.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('gamification')
export class GamificationController {
  constructor(private readonly gamificationService: GamificationService) {}

  @Roles(Role.STUDENT, Role.ADMIN, Role.INSTRUCTOR)
  @Get('leaderboard')
  getLeaderboard(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    return this.gamificationService.getLeaderboard(parsedLimit);
  }

  @Roles(Role.STUDENT)
  @Get('my-stats')
  getMyStats(@Req() req: RequestWithUser) {
    return this.gamificationService.getMyStats(req.user.sub);
  }
}
