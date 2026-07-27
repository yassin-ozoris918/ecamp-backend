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
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { imageFileFilter, UPLOAD_LIMITS } from '../common/config/upload.config';
import { Patch } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { CoursesService } from './courses.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface';

// --- Missing Imports Added ---
import { CacheInterceptor, CacheKey, CacheTTL } from '@nestjs/cache-manager';
import { InstructorOwnershipInterceptor } from '../auth/interceptors/instructor-ownership.interceptor';
import { LevelIsolationGuard } from '../auth/guards/level-isolation.guard';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('courses')
export class CoursesController {
  constructor(
    private readonly coursesService: CoursesService,
    private readonly storageService: StorageService,
  ) {}

  // --- EXISTING CRUD OPERATIONS ---

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Get()
  findAll(
    @Req() req: RequestWithUser,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('search') search?: string,
    @Query('isPublished') isPublished?: string,
  ) {
    const user = req.user;
    const parsedSkip = skip ? parseInt(skip, 10) : 0;
    const parsedTake = take ? parseInt(take, 10) : 50;
    
    // Convert isPublished to boolean if present, otherwise undefined
    let publishedFilter: boolean | undefined = undefined;
    if (isPublished === 'true') publishedFilter = true;
    if (isPublished === 'false') publishedFilter = false;

    return this.coursesService.findAll(
      user.sub,
      user.role,
      parsedSkip,
      parsedTake,
      search,
      publishedFilter
    );
  }

  @Roles(Role.STUDENT)
  @UseGuards(LevelIsolationGuard)
  @Get('student')
  getCoursesForStudent(@Req() req: RequestWithUser) {
    const user = req.user;
    return this.coursesService.getCoursesForStudent(user.sub);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Post()
  create(
    @Body() createCourseDto: CreateCourseDto,
    @Req() req: RequestWithUser,
  ) {
    const user = req.user;
    return this.coursesService.create(createCourseDto, user.sub, user.role);
  }


  @Post(':id/instructors')
  @UseGuards(InstructorOwnershipInterceptor) // Only authorized teachers or ADMIN can add other instructors
  async addInstructorToCourse(@Param('id', ParseUUIDPipe) id: string, @Body() body: { instructorId: string }) {
    return this.coursesService.assignInstructor(id, body.instructorId);
  }

  @Get('student-catalog')
  async getCoursesForStudents(@Body() userProfile: { educationLevel: 'HIGH_SCHOOL' | 'UNIVERSITY' }) {
    return this.coursesService.findAllForStudents(userProfile.educationLevel);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @UseInterceptors(InstructorOwnershipInterceptor)
  @Delete(':id/instructors/:targetInstructorId')
  removeInstructor(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('targetInstructorId', ParseUUIDPipe) targetInstructorId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.coursesService.removeInstructor(
      id,
      targetInstructorId,
      req.user.sub,
      req.user.role,
    );
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @UseInterceptors(InstructorOwnershipInterceptor)
  @Post(':id/attachments')
  addAttachments(@Param('id', ParseUUIDPipe) id: string, @Body() body: { attachments: { title: string; fileUrl: string }[] }, @Req() req: RequestWithUser) {
    return this.coursesService.addAttachments(id, body.attachments, req.user.sub, req.user.role);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @UseInterceptors(InstructorOwnershipInterceptor)
  @Post(':id/intro')
  updateIntro(@Param('id', ParseUUIDPipe) id: string, @Body() body: { url: string }, @Req() req: RequestWithUser) {
    return this.coursesService.updateIntro(id, body.url, req.user.sub, req.user.role);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @UseInterceptors(InstructorOwnershipInterceptor)
  @Patch(':id/publish')
  publish(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) {
    return this.coursesService.publish(id, req.user.sub, req.user.role);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @UseInterceptors(InstructorOwnershipInterceptor)
  @Patch(':id/unpublish')
  unpublish(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) {
    return this.coursesService.unpublish(id, req.user.sub, req.user.role);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.coursesService.findOne(id);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @UseInterceptors(InstructorOwnershipInterceptor)
  @Get(':id/builder')
  getBuilderData(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) {
    const user = req.user;
    return this.coursesService.getBuilderData(id, user.sub, user.role);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @UseInterceptors(InstructorOwnershipInterceptor)
  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateCourseDto: CreateCourseDto,
    @Req() req: RequestWithUser,
  ) {
    const user = req.user;
    return this.coursesService.update(id, updateCourseDto, user.sub, user.role);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Post(':id/thumbnail')
  @UseInterceptors(
    InstructorOwnershipInterceptor,
    FileInterceptor('file', {
      limits: { fileSize: UPLOAD_LIMITS.THUMBNAIL },
      fileFilter: imageFileFilter,
    }),
  )
  async uploadThumbnail(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: RequestWithUser,
  ) {
    const user = req.user;
    const url = await this.storageService.uploadFile(file, 'courses');
    await this.coursesService.updateThumbnail(id, url, user.sub, user.role);
    return { message: 'Course thumbnail updated successfully', url };
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @UseInterceptors(InstructorOwnershipInterceptor)
  @Put(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: any,
    @Req() req: RequestWithUser,
  ) {
    const user = req.user;
    return this.coursesService.updateStatus(id, status, user.sub, user.role);
  }


  @Roles(Role.ADMIN)
  @Put(':id/transfer')
  transferOwnership(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('newOwnerEmail') newOwnerEmail: string,
  ) {
    return this.coursesService.transferOwnership(id, newOwnerEmail);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @UseInterceptors(InstructorOwnershipInterceptor)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) {
    const user = req.user;
    // We update this to soft delete!
    // Actually the remove in service does hard delete right now, let's update it in the service as well.
    return this.coursesService.remove(id, user.sub, user.role);
  }
}
