import { Controller, Post, Body, Res, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { ExportService } from './export.service';
import { ExportRequestDto } from './dto/export-request.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async export(@Body() dto: ExportRequestDto, @Res() res: Response) {
    await this.exportService.export(dto.entity, dto.format, dto.filters, res);
  }
}
