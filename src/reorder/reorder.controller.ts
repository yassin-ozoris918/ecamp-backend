import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ReorderService } from './reorder.service';
import { ReorderDto } from './dto/reorder.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.INSTRUCTOR, Role.ADMIN)
@Controller('reorder')
export class ReorderController {
  constructor(private readonly reorderService: ReorderService) {}

  @Post()
  reorder(@Body() dto: ReorderDto, @Req() req: RequestWithUser) {
    const user = req.user;
    return this.reorderService.reorder(dto.entityType, dto.parentId, dto.items, user.sub, user.role);
  }
}
