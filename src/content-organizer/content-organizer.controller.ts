import { Body, Controller, Get, HttpCode, Param, ParseEnumPipe, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ContentOrganizerService } from './content-organizer.service';
import type { MaterialKind } from './dto/content-organizer.dto';
import {
  LectureDestinationDto,
  MATERIAL_KINDS,
  MoveMaterialDto,
  RenameDto,
  ReorderLectureMaterialsDto,
} from './dto/content-organizer.dto';

/** Admin-only content re-organisation (move / copy / rename / reorder). */
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN)
@Controller('content')
export class ContentOrganizerController {
  constructor(private readonly organizer: ContentOrganizerService) {}

  /** Every course with its chapters and lectures — used by the "move / copy to…" pickers. */
  @Get('tree')
  tree() {
    return this.organizer.getTree();
  }

  @Post('lectures/:id/move')
  @HttpCode(200)
  moveLecture(@Param('id', ParseUUIDPipe) id: string, @Body() dto: LectureDestinationDto) {
    return this.organizer.moveLecture(id, dto);
  }

  @Post('lectures/:id/copy')
  copyLecture(@Param('id', ParseUUIDPipe) id: string, @Body() dto: LectureDestinationDto) {
    return this.organizer.copyLecture(id, dto);
  }

  @Put('lectures/:id/materials/order')
  reorderLectureMaterials(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReorderLectureMaterialsDto) {
    return this.organizer.reorderLectureMaterials(id, dto.ids);
  }

  @Post('materials/:kind/:id/move')
  @HttpCode(200)
  moveMaterial(
    @Param('kind', new ParseEnumPipe(Object.fromEntries(MATERIAL_KINDS.map((k) => [k, k])))) kind: MaterialKind,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveMaterialDto,
  ) {
    return this.organizer.moveMaterial(kind, id, dto);
  }

  @Patch('materials/:kind/:id')
  renameMaterial(
    @Param('kind', new ParseEnumPipe(Object.fromEntries(MATERIAL_KINDS.map((k) => [k, k])))) kind: MaterialKind,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenameDto,
  ) {
    return this.organizer.renameMaterial(kind, id, dto.title);
  }
}
