import { Controller, Get, UseInterceptors, Query, Param } from '@nestjs/common';
import { CacheInterceptor, CacheKey, CacheTTL } from '@nestjs/cache-manager';
import { CoursesService } from './courses.service';
import { ProgressService } from '../progress/progress.service';

@Controller('public/courses')
export class PublicController {
  constructor(
    private readonly coursesService: CoursesService,
    private readonly progressService: ProgressService,
  ) {}

  @UseInterceptors(CacheInterceptor)
  @CacheKey('all_published_courses')
  @CacheTTL(300000) // 5 minutes
  @Get()
  getPublishedCourses(@Query('audienceType') audienceType?: string) {
    return this.coursesService.getPublishedCourses(audienceType);
  }

  @Get(':courseId/preview')
  getCoursePreview(@Param('courseId') courseId: string) {
    // Calling getCourseSyllabus without a studentId fetches the structure but evaluates unlocks to false
    return this.progressService.getCourseSyllabus(courseId);
  }
}
