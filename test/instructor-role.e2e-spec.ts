import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  Role,
  EducationLevel,
  HighSchoolSystem,
  StudyMode,
  StudyLanguage,
  HighSchoolGrade,
  TraditionalBranch,
} from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { App } from 'supertest/types';

jest.setTimeout(120000);

describe('Instructor Read-Only Role (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let instructorToken: string;
  let studentToken: string;
  
  let assignedCourseId: string;
  let unassignedCourseId: string;
  let lectureId: string;
  let sessionId: string;
  let studentId: string;

  const suffix = Date.now();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    const jwt = app.get<JwtService>(JwtService);
    const password = await bcrypt.hash('password123', 10);

    // Create users
    const admin = await prisma.user.create({
      data: { email: `admin-inst-${suffix}@test.com`, fullName: 'Admin', role: Role.ADMIN, password, isActive: true },
    });
    
    const instructor = await prisma.user.create({
      data: { email: `instructor-${suffix}@test.com`, fullName: 'Instructor', role: Role.INSTRUCTOR, password, isActive: true },
    });

    const student = await prisma.user.create({
      data: {
        email: `stu-${suffix}@test.com`,
        fullName: 'Student',
        role: Role.STUDENT,
        password,
        isActive: true,
        educationLevel: EducationLevel.HIGH_SCHOOL,
        highSchoolSystem: HighSchoolSystem.TRADITIONAL,
        studyMode: StudyMode.ONLINE,
        studyLanguage: StudyLanguage.ARABIC,
        highSchoolGrade: HighSchoolGrade.GRADE_2,
        traditionalBranch: TraditionalBranch.SCIENCE,
      },
    });
    studentId = student.id;

    adminToken = jwt.sign({ sub: admin.id, email: admin.email, role: Role.ADMIN, isImpersonating: false }, { secret: 'test_secret' });
    instructorToken = jwt.sign({ sub: instructor.id, email: instructor.email, role: Role.INSTRUCTOR, isImpersonating: false }, { secret: 'test_secret' });
    studentToken = jwt.sign({ sub: student.id, email: student.email, role: Role.STUDENT, isImpersonating: false }, { secret: 'test_secret' });

    // Create Courses
    const assignedCourse = await prisma.course.create({
      data: {
        title: `Assigned Course ${suffix}`,
        status: 'PUBLISHED',
        audienceType: EducationLevel.HIGH_SCHOOL,
        targetHighSchoolSystem: HighSchoolSystem.TRADITIONAL,
        targetStudyMode: StudyMode.ONLINE,
        targetStudyLanguage: StudyLanguage.ARABIC,
        targetHighSchoolGrade: HighSchoolGrade.GRADE_2,
        targetTraditionalBranch: TraditionalBranch.SCIENCE,
      },
    });
    assignedCourseId = assignedCourse.id;

    const unassignedCourse = await prisma.course.create({
      data: {
        title: `Unassigned Course ${suffix}`,
        status: 'PUBLISHED',
        audienceType: EducationLevel.HIGH_SCHOOL,
        targetHighSchoolSystem: HighSchoolSystem.TRADITIONAL,
        targetStudyMode: StudyMode.ONLINE,
        targetStudyLanguage: StudyLanguage.ARABIC,
        targetHighSchoolGrade: HighSchoolGrade.GRADE_2,
        targetTraditionalBranch: TraditionalBranch.SCIENCE,
      },
    });
    unassignedCourseId = unassignedCourse.id;

    // Assign Instructor to Course
    await prisma.courseInstructor.create({
      data: { courseId: assignedCourseId, instructorId: instructor.id },
    });

    // Create Lecture and Session in assigned course
    const lecture = await prisma.lecture.create({
      data: {
        title: `Inst Lecture ${suffix}`,
        courseId: assignedCourseId,
        isPublished: true,
        maxViews: 3,
        durationDays: 3,
        durationHours: 0,
        durationMinutes: 0,
      },
    });
    lectureId = lecture.id;

    const session = await prisma.session.create({
      data: { lectureId, title: 'Inst Session', videoUrl: 'https://example.com/vid.mp4', isPublished: true },
    });
    sessionId = session.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ==================== Mutation Protections ====================

  it('Instructor cannot create courses (403)', async () => {
    await request(app.getHttpServer())
      .post('/courses')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ title: 'Hacked Course', audienceType: 'HIGH_SCHOOL' })
      .expect(403);
  });

  it('Instructor cannot edit courses (403)', async () => {
    await request(app.getHttpServer())
      .put(`/courses/${assignedCourseId}`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ title: 'Hacked Course' })
      .expect(403);
  });

  it('Instructor cannot delete courses (403)', async () => {
    await request(app.getHttpServer())
      .delete(`/courses/${assignedCourseId}`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .expect(403);
  });

  // ==================== Scoping & Analytics ====================

  it('Instructor can access assigned course details', async () => {
    const res = await request(app.getHttpServer())
      .get(`/instructor/courses/${assignedCourseId}`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .expect(200);
    expect(res.body.id).toBe(assignedCourseId);
  });

  it('Instructor CANNOT access unassigned course details (403)', async () => {
    await request(app.getHttpServer())
      .get(`/instructor/courses/${unassignedCourseId}`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .expect(403);
  });

  it('Instructor can view students for assigned course', async () => {
    const res = await request(app.getHttpServer())
      .get(`/instructor/courses/${assignedCourseId}/students`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .expect(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  // ==================== Lecture Streaming Bypass ====================

  it('Instructor bypasses limits to get stream token without activating', async () => {
    // The student has NOT activated anything. If student tries, it fails.
    await request(app.getHttpServer())
      .get(`/lectures/sessions/${sessionId}/stream-token`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(403); // Needs to activate / redeem code

    // But Instructor CAN stream it.
    const res = await request(app.getHttpServer())
      .get(`/lectures/sessions/${sessionId}/stream-token`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .expect(200);
      
    expect(res.body.playbackSessionId).toBe('instructor-bypass');
    expect(res.body.playbackUrl).toBe('https://example.com/vid.mp4');
  });

  it('Instructor consuming view does NOT increase usage count', async () => {
    const res = await request(app.getHttpServer())
      .post(`/lectures/sessions/${sessionId}/consume-view`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ playbackSessionId: 'instructor-bypass' })
      .expect(201); // Created but zero views

    expect(res.body.usedViews).toBe(0);
    
    // Check actual view status (which should return 0)
    const viewStatus = await request(app.getHttpServer())
      .get(`/lectures/sessions/${sessionId}/view-status`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .expect(200);
      
    expect(viewStatus.body.usedViews).toBe(0);
    expect(viewStatus.body.isExhausted).toBe(false);
  });
});
