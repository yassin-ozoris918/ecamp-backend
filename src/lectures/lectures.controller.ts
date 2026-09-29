import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { imageFileFilter, UPLOAD_LIMITS } from '../common/config/upload.config';
import { StorageService } from '../storage/storage.service';
import { LecturesService } from './lectures.service';
import { CreateLectureDto } from './dto/create-lecture.dto';
import { ReorderItemsPayloadDto } from './dto/reorder-items.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface';
import { RedeemCodeDto } from '../activation-codes/dto/redeem-code.dto';
import { DeviceRestrictionGuard } from '../auth/guards/device.guard';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { HttpCode, HttpStatus } from '@nestjs/common';
import { ViewLimitService } from '../sessions/view-limit.service';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('lectures')
export class LecturesController {
  constructor(
    private readonly lecturesService: LecturesService,
    private readonly storageService: StorageService,
    private readonly viewLimitService: ViewLimitService,
  ) {}

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Post()
  create(@Body() dto: CreateLectureDto, @Req() req: RequestWithUser) {
    const user = req.user;
    return this.lecturesService.create(dto, user.sub, user.role);
  }

  // Get secure playback token for Cloudflare + view-limit check + playback session token
  @Roles(Role.STUDENT)
  @UseGuards(DeviceRestrictionGuard)
  @Get('sessions/:id/stream-token')
  getSecureStreamToken(@Param('id') id: string, @Req() req: RequestWithUser) {
    const user = req.user;
    return this.lecturesService.getSecureStreamToken(id, user.sub);
  }

  // Get view status for a specific session (used by frontend to show usage)
  @Roles(Role.STUDENT)
  @UseGuards(DeviceRestrictionGuard)
  @Get('sessions/:id/view-status')
  getViewStatus(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.viewLimitService.getViewStatus(id, req.user.sub);
  }

  // Consume one view for a session (called when threshold is reached)
  // Uses playbackSessionId for idempotency — safe to retry.
  @Roles(Role.STUDENT)
  @UseGuards(DeviceRestrictionGuard)
  @Post('sessions/:id/consume-view')
  consumeView(
    @Param('id') id: string,
    @Body() body: { playbackSessionId: string },
    @Req() req: RequestWithUser,
  ) {
    if (!body.playbackSessionId) {
      throw new BadRequestException('playbackSessionId is required.');
    }
    return this.viewLimitService.consumeView(body.playbackSessionId, req.user.sub, id);
  }

  @Get('course/:courseId')
  findByCourse(@Param('courseId') courseId: string) {
    return this.lecturesService.findByCourse(courseId);
  }

  @Roles(Role.STUDENT)
  @Post(':id/start-access')
  startAccess(@Param('id') id: string, @Req() req: RequestWithUser) {
    const user = req.user;
    return this.lecturesService.startAccess(id, user.sub);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.lecturesService.findOne(id);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateLectureDto>,
    @Req() req: RequestWithUser,
  ) {
    const user = req.user;
    return this.lecturesService.update(id, dto, user.sub, user.role);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    const user = req.user;
    return this.lecturesService.remove(id, user.sub, user.role);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Put(':id/reorder')
  reorder(
    @Param('id') id: string,
    @Body() dto: ReorderItemsPayloadDto,
    @Req() req: RequestWithUser,
  ) {
    const user = req.user;
    return this.lecturesService.reorder(id, dto.items, user.sub, user.role);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Post(':id/thumbnail')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: UPLOAD_LIMITS.THUMBNAIL },
      fileFilter: imageFileFilter,
    }),
  )
  async uploadThumbnail(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: RequestWithUser,
  ) {
    const user = req.user;
    const url = await this.storageService.uploadFile(file, 'lectures');
    await this.lecturesService.updateThumbnail(id, url, user.sub, user.role);
    return { message: 'Lecture thumbnail updated successfully', url };
  }
}
