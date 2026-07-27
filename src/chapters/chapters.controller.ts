import { Controller, Post, Body, Param, Put, Delete, UseGuards, Req, Get } from '@nestjs/common';
import { ChaptersService } from './chapters.service';
import { CreateChapterDto, UpdateChapterDto } from './dto/create-chapter.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('chapters')
export class ChaptersController {
  constructor(private readonly chaptersService: ChaptersService) {}

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Post()
  create(@Body() dto: CreateChapterDto, @Req() req: RequestWithUser) {
    return this.chaptersService.create(dto, req.user.sub, req.user.role);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Get('course/:courseId')
  findAllByCourse(@Param('courseId') courseId: string) {
    return this.chaptersService.findAllByCourse(courseId);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateChapterDto, @Req() req: RequestWithUser) {
    return this.chaptersService.update(id, dto, req.user.sub, req.user.role);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.chaptersService.remove(id, req.user.sub, req.user.role);
  }
}
