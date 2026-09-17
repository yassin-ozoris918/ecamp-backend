import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttemptStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StorageService } from '../storage/storage.service';
import { CloudflareService } from '../cloudflare/cloudflare.service';

@Injectable()
export class ProgressService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private storageService: StorageService,
    private cloudflareService: CloudflareService,
  ) {}

  async getStudentDashboard(studentId: string) {
    const lectureAccesses = await this.prisma.studentLectureAccess.findMany({
      where: { 
        studentId,
        lecture: { course: { status: 'PUBLISHED' } }
      },
      include: {
        lecture: {
          include: {
            course: {
              include: { instructors: { include: { instructor: { select: { id: true, fullName: true } } } } },
            },
            sessions: { where: { }, select: { id: true } },
            quizzes: { where: { }, select: { id: true } },
          },
        },
      },
    });

    const courseAccesses = await this.prisma.studentCourseAccess.findMany({
      where: {
        studentId,
        course: { status: 'PUBLISHED' }
      },
      include: {
        course: {
          include: {
            instructors: { include: { instructor: { select: { id: true, fullName: true } } } },
            lectures: {
               include: {
                  sessions: { where: { }, select: { id: true } },
                  quizzes: { where: { }, select: { id: true } },
               }
            }
          }
        }
      }
    });

    const coursesMap = new Map<string, {
      id: string;
      title: string;
      description: string | null;
      thumbnailUrl: string | null;
      instructorName: string;
      sessionIds: string[];
      quizIds: string[];
      isFree: boolean;
    }>();

    for (const access of lectureAccesses) {
      const course = access.lecture.course;
      if (!coursesMap.has(course.id)) {
        coursesMap.set(course.id, {
          id: course.id,
          title: course.title,
          description: course.description,
          thumbnailUrl: course.thumbnailUrl,
          instructorName: course.instructors[0]?.instructor?.fullName || 'Unknown',
          sessionIds: [],
          quizIds: [],
          isFree: course.isFree,
        });
      }
      const c = coursesMap.get(course.id)!;
      c.sessionIds.push(...access.lecture.sessions.map((s) => s.id));
      c.quizIds.push(...access.lecture.quizzes.map((q) => q.id));
    }

    for (const access of courseAccesses) {
      const course = access.course;
      if (!coursesMap.has(course.id)) {
        coursesMap.set(course.id, {
          id: course.id,
          title: course.title,
          description: course.description,
          thumbnailUrl: course.thumbnailUrl,
          instructorName: course.instructors[0]?.instructor?.fullName || 'Unknown',
          sessionIds: [],
          quizIds: [],
          isFree: course.isFree,
        });
      }
      const c = coursesMap.get(course.id)!;
      for (const lecture of course.lectures) {
         c.sessionIds.push(...lecture.sessions.map((s) => s.id));
         c.quizIds.push(...lecture.quizzes.map((q) => q.id));
      }
    }

    for (const c of coursesMap.values()) {
       c.sessionIds = [...new Set(c.sessionIds)];
       c.quizIds = [...new Set(c.quizIds)];
    }

    const allSessionIds = Array.from(coursesMap.values()).flatMap(c => c.sessionIds);
    const allQuizIds = Array.from(coursesMap.values()).flatMap(c => c.quizIds);

    const completedSessionIds = allSessionIds.length > 0
      ? new Set(
          (await this.prisma.sessionProgress.findMany({
            where: {
              studentId,
              sessionId: { in: allSessionIds },
              isCompleted: true,
            },
            select: { sessionId: true },
          })).map((r) => r.sessionId),
        )
      : new Set<string>();

    const passedQuizIds = allQuizIds.length > 0
      ? new Set(
          (await this.prisma.quizAttempt.findMany({
            where: {
              studentId,
              quizId: { in: allQuizIds },
              status: 'PASSED',
            },
            select: { quizId: true },
          })).map((r) => r.quizId),
        )
      : new Set<string>();

    return Array.from(coursesMap.values()).map((c) => {
      const totalSessions = c.sessionIds.length;
      const completedSessions = c.sessionIds.filter((id) => completedSessionIds.has(id)).length;
      const totalQuizzes = c.quizIds.length;
      const passedQuizzes = c.quizIds.filter((id) => passedQuizIds.has(id)).length;
      const denominator = totalSessions + totalQuizzes;

      return {
        id: c.id,
        title: c.title,
        description: c.description,
        thumbnailUrl: c.thumbnailUrl,
        instructorName: c.instructorName,
        progressPct: denominator > 0
          ? ((completedSessions + passedQuizzes) / denominator) * 100
          : 0,
        isFree: c.isFree,
      };
    });
  }

  async getLecturePlaylist(lectureId: string, studentId: string) {
    const lectureInfo = await this.prisma.lecture.findUnique({
      where: { id: lectureId, },
      include: { course: true, chapter: { select: { title: true } } },
    });

    if (!lectureInfo) throw new NotFoundException('Lecture not found');

    const access = await this.prisma.studentLectureAccess.findFirst({
      where: { studentId, lectureId, },
    });
    const courseAccess = await this.prisma.studentCourseAccess.findFirst({
      where: { studentId, courseId: lectureInfo.courseId, },
    });

    const now = new Date();
    let isFullyLocked = true;
    let isStarted = false;
    let applicableAccess: any = null;

    if (access) {
      let effectiveExpiresAt = access.expiresAt;
      if (access.expiresAt && access.timerPausedAt) {
        const timeSpentMs = now.getTime() - access.timerPausedAt.getTime();
        const maxExtensionMs = 2 * 60 * 60 * 1000; // 2 hours global max pause
        const actualExtensionMs = Math.max(0, Math.min(timeSpentMs, maxExtensionMs));
        effectiveExpiresAt = new Date(access.expiresAt.getTime() + actualExtensionMs);
      }
      
      if (lectureInfo.course.isFree) {
        effectiveExpiresAt = null;
      }
      
      if (!effectiveExpiresAt || now <= effectiveExpiresAt) {
        isFullyLocked = false;
        isStarted = access.isStarted;
        applicableAccess = { ...access, expiresAt: effectiveExpiresAt };
      }
    }
    
    if ((courseAccess || lectureInfo.course.isFree) && isFullyLocked) {
      if (lectureInfo.course.isFree || !courseAccess?.expiresAt || now <= courseAccess.expiresAt) {
        isFullyLocked = false;
        // courseAccess alone means lecture is NOT started yet
        isStarted = false;
        applicableAccess = courseAccess || { expiresAt: null };
      }
    }

    const sessions = await this.prisma.session.findMany({
      where: { lectureId, },
      include: { progress: { where: { studentId } } },
    });

    const quizzes = await this.prisma.quiz.findMany({
      where: { lectureId, },
      include: {
        attempts: {
          where: { studentId },
          orderBy: { createdAt: 'desc' },
        },
      },
    });



    const attachments = await this.prisma.attachment.findMany({
      where: { lectureId },
    });

    let playlist: any[] = [];

    // Mask content if they haven't started it yet or if they are fully locked
    if (isFullyLocked || !isStarted) {
      // STRICT WHITE-LISTING FOR LOCKED CONTENT
      playlist = [
        ...sessions.map((s) => ({
          id: s.id,
          type: 'SESSION',
          title: s.title,
          orderIndex: s.sortOrder,
          isCompleted: false,
          isLocked: true,
          video_url: null, // Hardcoded
          duration: s.duration,
        })),
        ...quizzes.map((q) => ({
          id: q.id,
          type: 'QUIZ',
          title: q.title,
          orderIndex: q.sortOrder,
          isCompleted: false,
          isLocked: true,
          questions: null, // Hardcoded
          timeLimit: q.timeLimit,
        })),
      ];
    } else {
      // Unlocked Content
      playlist = [
        ...sessions.map((s) => ({
          id: s.id,
          type: 'SESSION',
          title: s.title,
          orderIndex: s.sortOrder,
          isCompleted: s.progress.length > 0 ? s.progress[0].isCompleted : false,
          video_url: s.videoUrl,
          duration: s.duration,
        })),
        ...quizzes.map((q) => {
          const passedAttempt = q.attempts.find((a) => a.status === 'PASSED');
          const isCompleted = !!passedAttempt;
          const attemptsCount = q.attempts.length;
          const maxAttempts = q.maxAttempts;
          const isExhausted = attemptsCount >= maxAttempts && !isCompleted;
          const highestScore = q.attempts.length > 0
            ? Math.max(...q.attempts.map((a) => a.score))
            : 0;

          return {
            id: q.id,
            type: 'QUIZ',
            title: q.title,
            orderIndex: q.sortOrder,
            isCompleted,
            timeLimit: q.timeLimit,
            passGrade: q.passGrade,
            maxAttempts,
            attemptsCount,
            isExhausted,
            highestScore,
          };
        }),
      ];

      // Phase E Gatekeeper: Same-Lecture Progression Locking
      // Business rules:
      //   1. Session: must be manually completed to unlock next item
      //   2. Quiz passGrade=0: informational, always unlocks next on any submission
      //   3. Quiz passGrade>0: unlock next if PASSED or maxAttempts exhausted
      //   4. Student is NEVER permanently blocked
      playlist.sort((a, b) => a.orderIndex - b.orderIndex);
      
      let lockSubsequentItems = false;
      
      playlist = playlist.map((item) => {
        // If the sequence is locked, mask the item
        if (lockSubsequentItems) {
           item.isLocked = true;
           item.video_url = null;
           item.fileUrl = null;
           if (item.type === 'QUIZ') item.questions = null;
        } else {
           item.isLocked = false;
        }

        // Determine if this item blocks the next
        if (!lockSubsequentItems) {
          if (item.type === 'SESSION') {
            // Session blocks until manually completed
            if (!item.isCompleted) {
              lockSubsequentItems = true;
            }
          } else if (item.type === 'QUIZ' && item.passGrade > 0) {
            // Graded quiz: blocks permanently if NOT passed
            if (!item.isCompleted) {
              lockSubsequentItems = true;
            }
          }
          // passGrade=0 quizzes and attachments never block
        }
        
        return item;
      });
    }

    // Always sort by orderIndex in either case
    playlist.sort((a, b) => a.orderIndex - b.orderIndex);

    const allLectures = await this.prisma.lecture.findMany({
      where: { courseId: lectureInfo.courseId, },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, title: true },
    });

    // --- Navigation enrichment ---
    const courseTitle = lectureInfo.course.title;
    const chapterTitle = lectureInfo.chapter?.title || null;

    const [navChapters, navStandaloneLectures] = await Promise.all([
      this.prisma.chapter.findMany({
        where: { courseId: lectureInfo.courseId, },
        orderBy: { orderIndex: 'asc' },
        include: {
          lectures: {
            where: { },
            orderBy: { sortOrder: 'asc' },
            select: { id: true, title: true, thumbnailUrl: true },
          },
        },
      }),
      this.prisma.lecture.findMany({
        where: { courseId: lectureInfo.courseId, chapterId: null, },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, title: true, thumbnailUrl: true },
      }),
    ]);

    const navAccesses = await this.prisma.studentLectureAccess.findMany({
      where: { studentId, lecture: { courseId: lectureInfo.courseId }, },
      select: { lectureId: true },
    });
    const accessibleLectureIds = new Set(navAccesses.map((a) => a.lectureId));

    const orderedLectures: { id: string; title: string; thumbnailUrl: string | null }[] = [];

    for (const l of navStandaloneLectures) {
      if (accessibleLectureIds.has(l.id)) {
        orderedLectures.push(l);
      }
    }
    for (const ch of navChapters) {
      for (const l of ch.lectures) {
        if (accessibleLectureIds.has(l.id)) {
          orderedLectures.push(l);
        }
      }
    }

    const currentIdx = orderedLectures.findIndex((l) => l.id === lectureId);
    const previousLecture = currentIdx > 0
      ? {
          id: orderedLectures[currentIdx - 1].id,
          title: orderedLectures[currentIdx - 1].title,
          thumbnailUrl: orderedLectures[currentIdx - 1].thumbnailUrl,
        }
      : null;
    const nextLecture = currentIdx >= 0 && currentIdx < orderedLectures.length - 1
      ? {
          id: orderedLectures[currentIdx + 1].id,
          title: orderedLectures[currentIdx + 1].title,
          thumbnailUrl: orderedLectures[currentIdx + 1].thumbnailUrl,
        }
      : null;

    return {
      isLocked: isFullyLocked,
      isStarted: isStarted,
      expiresAt: applicableAccess?.expiresAt || null,
      access_expires_at: applicableAccess?.expiresAt || null,
      courseId: lectureInfo.courseId,
      playlist,
      lecture: lectureInfo,
      course: lectureInfo.course,
      allLectures,
      previousLecture,
      nextLecture,
      courseTitle,
      chapterTitle,
    };
  }

  // --- 2. Mark Video as Complete ---
  async checkItemUnlocked(
    lectureId: string,
    studentId: string,
    itemId: string,
  ) {
    const { playlist, isStarted, isLocked: isFullyLocked } = await this.getLecturePlaylist(lectureId, studentId);
    if (isFullyLocked) throw new ForbiddenException('You do not have access to this lecture.');
    if (!isStarted) throw new ForbiddenException('You must start the lecture first.');
    
    const item = playlist.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Item not found in playlist.');
    if (item.isLocked)
      throw new ForbiddenException('You must complete previous items first.');
  }

  async markSessionComplete(sessionId: string, studentId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId, },
    });

    if (!session) throw new NotFoundException('Session not found');

    // Check lock status
    await this.checkItemUnlocked(session.lectureId, studentId, sessionId);

    // Upsert ensures we update it if it exists, or create it if it doesn't
    const progress = await this.prisma.sessionProgress.upsert({
      where: {
        studentId_sessionId: { studentId, sessionId },
      },
      update: {
        isCompleted: true,
        completedAt: new Date(),
      },
      create: {
        studentId,
        sessionId,
        isCompleted: true,
        completedAt: new Date(),
      },
    });

    this.eventEmitter.emit('session.completed', { studentId, sessionId });

    return progress;
  }





  // --- Course Syllabus ---
  async getCourseSyllabus(courseId: string, studentId?: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId, },
      include: {
        instructors: { include: { instructor: { select: { fullName: true } } } },
      },
    });

    if (!course) throw new NotFoundException('Course not found');
    if (studentId && course.status !== 'PUBLISHED') throw new ForbiddenException('This course is not published.');

    // Fetch chapters and standalone lectures in a single query
    const chapters = await this.prisma.chapter.findMany({
      where: { courseId, },
      orderBy: { orderIndex: 'asc' },
      include: {
        lectures: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          include: {
            sessions: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
            quizzes: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });

    const standaloneLectures = await this.prisma.lecture.findMany({
      where: { courseId, chapterId: null, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      include: {
        sessions: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
        quizzes: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
      },
    });

    // Collect all lecture IDs for access checks
    const allLectures = [
      ...standaloneLectures,
      ...chapters.flatMap((ch) => ch.lectures),
    ];

    // If studentId is provided, check which lectures they have access to
    let accesses: any[] = [];
    let courseAccess: any = null;
    if (studentId) {
      accesses = await this.prisma.studentLectureAccess.findMany({
        where: { studentId, lectureId: { in: allLectures.map((l) => l.id) }, },
      });
      courseAccess = await this.prisma.studentCourseAccess.findFirst({
        where: { studentId, courseId },
      });
    }

    const formatLecture = (l: any) => {
      const access = accesses.find((a) => a.lectureId === l.id);

      let isUnlocked = course.isFree || !!access || !!courseAccess;
      const isStarted = access ? access.isStarted : false;
      let isExpired = false;

      if (!course.isFree) {
        // Check if the lecture access has expired
        if (access && access.expiresAt) {
          const now = new Date();
          let effectiveExpiresAt = access.expiresAt;
          if (access.timerPausedAt) {
            const timeSpentMs = now.getTime() - access.timerPausedAt.getTime();
            const maxExtensionMs = 2 * 60 * 60 * 1000; // 2 hours global max pause
            const actualExtensionMs = Math.max(0, Math.min(timeSpentMs, maxExtensionMs));
            effectiveExpiresAt = new Date(access.expiresAt.getTime() + actualExtensionMs);
          }
          if (now > effectiveExpiresAt) {
            isUnlocked = false;
            isExpired = true;
          }
        } else if (!access && courseAccess && courseAccess.expiresAt) {
          if (new Date() > courseAccess.expiresAt) {
            isUnlocked = false;
            isExpired = true;
          }
        }
      }

      // Format preview items (strip URLs)
      const items = [
        ...l.sessions.map((s: any) => ({
          id: s.id,
          type: 'SESSION',
          title: s.title,
          duration: s.duration,
          sortOrder: s.sortOrder,
        })),
        ...l.quizzes.map((q: any) => ({
          id: q.id,
          type: 'QUIZ',
          title: q.title,
          timeLimit: q.timeLimit,
          sortOrder: q.sortOrder,
        })),
      ].sort((a: any, b: any) => a.sortOrder - b.sortOrder);

      return {
        id: l.id,
        title: l.title,
        description: l.description,
        thumbnailUrl: l.thumbnailUrl,
        validityDays: l.validityDays,
        durationDays: l.durationDays,
        durationHours: l.durationHours,
        durationMinutes: l.durationMinutes,
        isUnlocked,
        isStarted,
        isExpired,
        chapterId: l.chapterId,
        items,
      };
    };

    const formattedChapters = chapters.map((ch) => ({
      id: ch.id,
      title: ch.title,
      description: ch.description,
      orderIndex: ch.orderIndex,
      lectures: ch.lectures.map(formatLecture),
    }));

    const formattedStandaloneLectures = standaloneLectures.map(formatLecture);

    // Fetch Published Exams
    const exams = await this.prisma.exam.findMany({
      where: { courseId },
      select: {
        id: true,
        title: true,
        description: true,
        timeLimit: true,
        passGrade: true,
        maxAttempts: true,
        _count: { select: { questions: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    let studentAttempts: any[] = [];
    if (studentId) {
      studentAttempts = await this.prisma.examAttempt.findMany({
        where: { studentId, examId: { in: exams.map((e) => e.id) } },
      });
    }

    const mappedExams = exams.map((exam) => {
      const attempts = studentAttempts.filter((a) => a.examId === exam.id);
      const passed = attempts.some((a) => a.status === 'PASSED');
      const attemptsCount = attempts.length;
      return {
        ...exam,
        attemptsCount,
        isPassed: passed,
      };
    });

    return {
      course,
      chapters: formattedChapters,
      standaloneLectures: formattedStandaloneLectures,
      exams: mappedExams,
    };
  }
}

