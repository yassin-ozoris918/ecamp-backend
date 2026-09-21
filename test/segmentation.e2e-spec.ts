import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EducationLevel, HighSchoolSystem, StudyMode, StudyLanguage, HighSchoolGrade, TraditionalBranch, Role, BaccalaureatePath } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { App } from 'supertest/types';

jest.setTimeout(60000); // Allow sufficient time for NestJS initialization

describe('Segmentation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let studentToken: string;
  let studentId: string;
  let instructorToken: string;
  let instructorId: string;
  let courseId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    
    // Clean up previous runs if any
    await prisma.studentCourseAccess.deleteMany({ where: { course: { title: { contains: 'E2E Seg Course' } } } });
    await prisma.course.deleteMany({ where: { title: { contains: 'E2E Seg Course' } } });
    await prisma.deviceSession.deleteMany({ where: { student: { email: { contains: '-seg-e2e@test.com' } } } });
    await prisma.deviceHistory.deleteMany({ where: { student: { email: { contains: '-seg-e2e@test.com' } } } });
    await prisma.user.deleteMany({ where: { email: { contains: '-seg-e2e@test.com' } } });

    const suffix = Date.now();
    const password = await bcrypt.hash('password123', 10);

    // Create users
    const admin = await prisma.user.create({ data: { email: `admin-seg-${suffix}@test.com`, fullName: 'Admin', role: Role.ADMIN, password, isActive: true } });
    const student = await prisma.user.create({ data: { email: `stu-seg-${suffix}@test.com`, fullName: 'Student', role: Role.STUDENT, password, educationLevel: EducationLevel.HIGH_SCHOOL, highSchoolSystem: HighSchoolSystem.TRADITIONAL, studyMode: StudyMode.ONLINE, studyLanguage: StudyLanguage.ARABIC, highSchoolGrade: HighSchoolGrade.GRADE_2, traditionalBranch: TraditionalBranch.SCIENCE, isActive: true } });
    const instructor = await prisma.user.create({ data: { email: `inst-seg-${suffix}@test.com`, fullName: 'Instructor', role: Role.INSTRUCTOR, password, isActive: true } });
    
    studentId = student.id;
    instructorId = instructor.id;

    // Login to get tokens
    const adminLogin = await request(app.getHttpServer()).post('/auth/login').send({ email: `admin-seg-${suffix}@test.com`, password: 'password123' });
    adminToken = adminLogin.body.accessToken;
    
    const studentLogin = await request(app.getHttpServer()).post('/auth/login').send({ email: `stu-seg-${suffix}@test.com`, password: 'password123', deviceId: 'test-device' });
    studentToken = studentLogin.body.accessToken;

    const instLogin = await request(app.getHttpServer()).post('/auth/login').send({ email: `inst-seg-${suffix}@test.com`, password: 'password123' });
    instructorToken = instLogin.body.accessToken;

    // Create a course
    const courseRes = await request(app.getHttpServer())
      .post('/courses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'E2E Seg Course',
        audienceType: EducationLevel.HIGH_SCHOOL,
        targetStudyLanguage: StudyLanguage.ENGLISH,
        targetStudyMode: StudyMode.ONLINE,
      });
    courseId = courseRes.body.id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.studentCourseAccess.deleteMany({ where: { course: { title: { contains: 'E2E Seg Course' } } } });
      await prisma.course.deleteMany({ where: { title: { contains: 'E2E Seg Course' } } });
      await prisma.deviceSession.deleteMany({ where: { student: { email: { contains: '-seg-e2e@test.com' } } } });
      await prisma.deviceHistory.deleteMany({ where: { student: { email: { contains: '-seg-e2e@test.com' } } } });
      await prisma.user.deleteMany({ where: { email: { contains: '-seg-e2e@test.com' } } });
      await prisma.$disconnect();
    }
    if (app) {
      await app.close();
    }
  });

  describe('Student PATCH Semantics', () => {
    it('Omitted field preserves existing value', async () => {
      await request(app.getHttpServer())
        .patch(`/users/profile`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ studyMode: StudyMode.CENTER })
        .expect(200);

      const user = await prisma.user.findUnique({ where: { id: studentId } });
      expect(user?.studyMode).toBe(StudyMode.CENTER);
      expect(user?.studyLanguage).toBe(StudyLanguage.ARABIC); // Preserved
    });

    it('Explicit null clears the field', async () => {
      // Set a faculty first
      await prisma.user.update({ where: { id: studentId }, data: { otherUniversityName: 'Cairo Univ', otherFacultyName: 'Engineering' } });

      await request(app.getHttpServer())
        .patch(`/users/profile`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ otherFacultyName: null, otherUniversityName: null })
        .expect(200);

      const user = await prisma.user.findUnique({ where: { id: studentId } });
      expect(user?.otherUniversityName).toBeNull();
      expect(user?.otherFacultyName).toBeNull();
    });

    it('Invalid merged state returns 400 and preserves database', async () => {
      // Existing: TRADITIONAL + GRADE_2 + SCIENCE
      await prisma.user.update({ where: { id: studentId }, data: { highSchoolSystem: HighSchoolSystem.TRADITIONAL, highSchoolGrade: HighSchoolGrade.GRADE_2, traditionalBranch: TraditionalBranch.SCIENCE } });

      const res = await request(app.getHttpServer())
        .patch(`/users/profile`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ highSchoolGrade: HighSchoolGrade.GRADE_3 }); // GRADE_3 with SCIENCE is invalid

      expect(res.status).toBe(400);

      const user = await prisma.user.findUnique({ where: { id: studentId } });
      // Database MUST remain unchanged
      expect(user?.highSchoolGrade).toBe(HighSchoolGrade.GRADE_2);
      expect(user?.traditionalBranch).toBe(TraditionalBranch.SCIENCE);
    });
  });

  describe('Course PATCH Semantics', () => {
    it('Updates field and preserves omitted', async () => {
      await request(app.getHttpServer())
        .put(`/courses/${courseId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'E2E Seg Course',
          audienceType: EducationLevel.HIGH_SCHOOL,
          targetStudyMode: StudyMode.CENTER
        })
        .expect(200);

      const course = await prisma.course.findUnique({ where: { id: courseId } });
      expect(course?.targetStudyMode).toBe(StudyMode.CENTER);
      expect(course?.targetStudyLanguage).toBe(StudyLanguage.ENGLISH); // Preserved
    });
    
    it('Null clears restriction', async () => {
      await request(app.getHttpServer())
        .put(`/courses/${courseId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'E2E Seg Course',
          audienceType: EducationLevel.HIGH_SCHOOL,
          targetStudyLanguage: null,
          targetStudyMode: StudyMode.CENTER
        })
        .expect(200);

      const course = await prisma.course.findUnique({ where: { id: courseId } });
      expect(course?.targetStudyLanguage).toBeNull();
      expect(course?.targetStudyMode).toBe(StudyMode.CENTER);
    });
  });

  describe('Course Persistence', () => {
    it('Creates with full targeting and returns it on fetch', async () => {
      const res = await request(app.getHttpServer())
        .post('/courses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Full Target E2E Seg Course',
          audienceType: EducationLevel.HIGH_SCHOOL,
          targetHighSchoolSystem: HighSchoolSystem.TRADITIONAL,
          targetHighSchoolGrade: HighSchoolGrade.GRADE_2,
          targetTraditionalBranch: TraditionalBranch.SCIENCE
        })
        .expect(201);
      
      const course = await prisma.course.findUnique({ where: { id: res.body.id } });
      expect(course?.targetHighSchoolSystem).toBe(HighSchoolSystem.TRADITIONAL);
      
      // Cleanup
      await prisma.course.delete({ where: { id: res.body.id } });
    });
  });

  describe('Admin Filters', () => {
    it('Filters correctly across multiple fields', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/users?educationLevel=HIGH_SCHOOL&highSchoolSystem=TRADITIONAL&traditionalBranch=SCIENCE')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      
      expect(Array.isArray(res.body.items)).toBeTruthy();
      // the test student we created matches this
      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Entitlement Preservation', () => {
    it('Retains StudentCourseAccess after unrelated profile segmentation changes', async () => {
      // Give student access
      await prisma.studentCourseAccess.create({
        data: {
          studentId,
          courseId
        }
      });

      // Change student segmentation
      await request(app.getHttpServer())
        .patch(`/users/profile`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ studyMode: StudyMode.CENTER })
        .expect(200);

      // Verify access still exists
      const access = await prisma.studentCourseAccess.findFirst({
        where: { studentId, courseId }
      });
      expect(access).toBeDefined();
      expect(access?.studentId).toBe(studentId);
    });
  });

  describe('Admin Exports', () => {
    it('Exports users with segmentation fields in CSV', async () => {
      const res = await request(app.getHttpServer())
        .post('/admin/export')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ entity: 'users', format: 'csv', filters: {} })
        .expect(200);
      
      const csv = res.text;
      expect(csv).toContain('Education Level');
      expect(csv).toContain('High School System');
      expect(csv).toContain('Study Mode');
      expect(csv).toContain('Study Language');
      expect(csv).toContain('Branch');
      expect(csv).toContain('Path');
      expect(csv).toContain('TRADITIONAL');
    });

    it('Exports courses with target fields in CSV', async () => {
      const res = await request(app.getHttpServer())
        .post('/admin/export')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ entity: 'courses', format: 'csv', filters: {} })
        .expect(200);
      
      const csv = res.text;
      expect(csv).toContain('Audience');
      expect(csv).toContain('Target High School System');
      expect(csv).toContain('Target Study Language');
      expect(csv).toContain('Target Traditional Branch');
      expect(csv).toContain('Target Baccalaureate Path');
    });
    it('Exports users in JSON with segmentation fields', async () => {
      const res = await request(app.getHttpServer())
        .post('/admin/export')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ entity: 'users', format: 'json', filters: {} })
        .expect(200);
      
      const json = res.body;
      expect(Array.isArray(json)).toBeTruthy();
      if (json.length > 0) {
        const firstUser = json[0];
        expect(firstUser).toHaveProperty('educationLevel');
        expect(firstUser).toHaveProperty('highSchoolSystem');
        expect(firstUser).toHaveProperty('studyMode');
        expect(firstUser).toHaveProperty('traditionalBranch');
        expect(firstUser).toHaveProperty('baccalaureatePath');
      }
    });

    it('Exports courses in JSON with target fields', async () => {
      const res = await request(app.getHttpServer())
        .post('/admin/export')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ entity: 'courses', format: 'json', filters: {} })
        .expect(200);
      
      const json = res.body;
      expect(Array.isArray(json)).toBeTruthy();
      if (json.length > 0) {
        const firstCourse = json[0];
        expect(firstCourse).toHaveProperty('audienceType');
        expect(firstCourse).toHaveProperty('targetHighSchoolSystem');
        expect(firstCourse).toHaveProperty('targetTraditionalBranch');
      }
    });

    it('Exports in binary formats (XLSX, PDF) without errors', async () => {
      // XLSX Users
      await request(app.getHttpServer())
        .post('/admin/export')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ entity: 'users', format: 'xlsx', filters: {} })
        .expect(200)
        .expect('Content-Type', /spreadsheetml/);
        
      // PDF Courses
      await request(app.getHttpServer())
        .post('/admin/export')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ entity: 'courses', format: 'pdf', filters: {} })
        .expect(200)
        .expect('Content-Type', /pdf/);
    });
  });
});
