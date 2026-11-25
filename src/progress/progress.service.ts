import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttemptStatus } from '@prisma/client';
import { courseLevelAccessApplies, effectiveLectureAccess, isLectureLocked } from '../common/lecture-lock.policy';
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

    // Locked lecture: only its own lecture code (or admin/demo) opens it — never the course or free status.
    const access = effectiveLectureAccess(
      lectureInfo,
      await this.prisma.studentLectureAccess.findFirst({ where: { studentId, lectureId } }),
    );
    const courseAccess = courseLevelAccessApplies(lectureInfo)
      ? await this.prisma.studentCourseAccess.findFirst({ where: { studentId, courseId: lectureInfo.courseId } })
      : null;
    const courseIsFree = lectureInfo.course.isFree && courseLevelAccessApplies(lectureInfo);

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
      
      if (courseIsFree) {
        effectiveExpiresAt = null;
      }
      
      if (!effectiveExpiresAt || now <= effectiveExpiresAt) {
        isFullyLocked = false;
        isStarted = access.isStarted;
        applicableAccess = { ...access, expiresAt: effectiveExpiresAt };
      }
    }
    
    if ((courseAccess || courseIsFree) && isFullyLocked) {
      if (courseIsFree || !courseAccess?.expiresAt || now <= courseAccess.expiresAt) {
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

    // Load view usages for this student for all sessions in this lecture
    const viewUsages = await this.prisma.studentSessionViewUsage.findMany({
      where: { studentId, sessionId: { in: sessions.map(s => s.id) } },
    });
    const viewUsageMap = new Map<string, { usedViews: number, grantedViews: number }>();
    for (const vu of viewUsages) {
      viewUsageMap.set(vu.sessionId, { usedViews: vu.usedViews, grantedViews: vu.grantedViews });
    }
    // maxViews comes from the lecture (null = unlimited)
    const lectureMaxViews = lectureInfo.maxViews ?? null;

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
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
    });

    let playlist: any[] = [];

    // Mask content if they haven't started it yet or if they are fully locked
    if (isFullyLocked || !isStarted) {
      // STRICT WHITE-LISTING FOR LOCKED CONTENT
      playlist = [
        ...sessions.map((s) => {
          const usage = viewUsageMap.get(s.id) ?? { usedViews: 0, grantedViews: 0 };
          const effectiveMaxViews = lectureMaxViews !== null ? lectureMaxViews + usage.grantedViews : null;
          return {
            id: s.id,
            type: 'SESSION',
            title: s.title,
            orderIndex: s.sortOrder,
            isCompleted: false,
            isLocked: true,
            video_url: null, // Hardcoded
            duration: s.duration,
            // Include view limit info even in locked state so UI can explain
            maxViews: effectiveMaxViews,
            usedViews: usage.usedViews,
            isViewExhausted: effectiveMaxViews !== null && usage.usedViews >= effectiveMaxViews,
          };
        }),
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
        ...sessions.map((s) => {
          const usage = viewUsageMap.get(s.id) ?? { usedViews: 0, grantedViews: 0 };
          const effectiveMaxViews = lectureMaxViews !== null ? lectureMaxViews + usage.grantedViews : null;
          return {
            id: s.id,
            type: 'SESSION',
            title: s.title,
            orderIndex: s.sortOrder,
            isCompleted: s.progress.length > 0 ? s.progress[0].isCompleted : false,
            video_url: s.videoUrl,
            duration: s.duration,
            // View limit fields for the student to see usage
            maxViews: effectiveMaxViews,
            usedViews: usage.usedViews,
            isViewExhausted: effectiveMaxViews !== null && usage.usedViews >= effectiveMaxViews,
          };
        }),
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
        orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
        include: {
          lectures: {
            where: { },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            select: { id: true, title: true, thumbnailUrl: true },
          },
        },
      }),
      this.prisma.lecture.findMany({
        where: { courseId: lectureInfo.courseId, chapterId: null, },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, title: true, thumbnailUrl: true },
      }),
    ]);

    const navAccesses = await this.prisma.studentLectureAccess.findMany({
      where: { studentId, lecture: { courseId: lectureInfo.courseId }, },
      select: { lectureId: true, source: true, lecture: { select: { requiresOwnCode: true } } },
    });
    const accessibleLectureIds = new Set(
      navAccesses.filter((a) => effectiveLectureAccess(a.lecture, a)).map((a) => a.lectureId),
    );

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
      requiresOwnCode: isLectureLocked(lectureInfo),
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





  // --- Continue learning (student dashboard) ---
  /**
   * The lecture to resume (most recent activity, still open, not finished) and the student's
   * lectures/courses whose access ends soon. Uses the same access rules as the playlist.
   */
  async getContinueLearning(studentId: string) {
    const now = new Date();
    const SOON_LECTURE_MS = 72 * 60 * 60 * 1000;
    const SOON_COURSE_MS = 14 * 24 * 60 * 60 * 1000;
    const MAX_PAUSE_MS = 2 * 60 * 60 * 1000;

    const effectiveEnd = (a: { expiresAt: Date | null; timerPausedAt: Date | null }) => {
      if (!a.expiresAt) return null;
      if (!a.timerPausedAt) return a.expiresAt;
      const ext = Math.max(0, Math.min(now.getTime() - a.timerPausedAt.getTime(), MAX_PAUSE_MS));
      return new Date(a.expiresAt.getTime() + ext);
    };

    const lectureSelect = {
      id: true,
      title: true,
      requiresOwnCode: true,
      deletedAt: true,
      chapter: { select: { title: true } },
      course: { select: { id: true, title: true, status: true, isFree: true, deletedAt: true } },
      sessions: { where: { deletedAt: null }, orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }], select: { id: true, title: true } },
      quizzes: { where: { deletedAt: null }, select: { id: true } },
    };

    const [lectureAccess, courseAccess, recentProgress] = await Promise.all([
      this.prisma.studentLectureAccess.findMany({
        where: { studentId, isStarted: true },
        select: { lectureId: true, source: true, expiresAt: true, timerPausedAt: true, activatedAt: true, lecture: { select: lectureSelect } },
      }),
      this.prisma.studentCourseAccess.findMany({
        where: { studentId },
        select: { courseId: true, expiresAt: true, course: { select: { id: true, title: true, status: true, deletedAt: true } } },
      }),
      this.prisma.sessionProgress.findMany({
        where: { studentId },
        orderBy: { updatedAt: 'desc' },
        take: 30,
        select: { updatedAt: true, session: { select: { lectureId: true } } },
      }),
    ]);

    const visible = (c: { status: string; deletedAt: Date | null } | null | undefined) => !!c && c.status === 'PUBLISHED' && !c.deletedAt;

    // Last activity per lecture: latest session progress, else when the lecture was started.
    const lastActivity = new Map<string, number>();
    for (const p of recentProgress) {
      const id = p.session?.lectureId;
      if (id && !lastActivity.has(id)) lastActivity.set(id, p.updatedAt.getTime());
    }

    const lectureIds = lectureAccess.map((a) => a.lectureId);
    const sessionIds = lectureAccess.flatMap((a) => a.lecture.sessions.map((s) => s.id));
    const quizIds = lectureAccess.flatMap((a) => a.lecture.quizzes.map((q) => q.id));
    const [done, passed] = await Promise.all([
      sessionIds.length
        ? this.prisma.sessionProgress.findMany({ where: { studentId, isCompleted: true, sessionId: { in: sessionIds } }, select: { sessionId: true } })
        : Promise.resolve([] as { sessionId: string }[]),
      quizIds.length
        ? this.prisma.quizAttempt.findMany({ where: { studentId, status: 'PASSED', quizId: { in: quizIds } }, select: { quizId: true }, distinct: ['quizId'] })
        : Promise.resolve([] as { quizId: string }[]),
    ]);
    const doneSet = new Set(done.map((d) => d.sessionId));
    const passedSet = new Set(passed.map((q) => q.quizId));

    const lectures = lectureAccess
      .filter((a) => !a.lecture.deletedAt && visible(a.lecture.course) && effectiveLectureAccess(a.lecture, a))
      .map((a) => {
        const l = a.lecture;
        const free = l.course.isFree && courseLevelAccessApplies(l);
        const endsAt = free ? null : effectiveEnd(a);
        const doneCount = l.sessions.filter((s) => doneSet.has(s.id)).length + l.quizzes.filter((q) => passedSet.has(q.id)).length;
        const total = l.sessions.length + l.quizzes.length;
        return {
          lectureId: l.id,
          lectureTitle: l.title,
          chapterTitle: l.chapter?.title ?? null,
          courseId: l.course.id,
          courseTitle: l.course.title,
          done: doneCount,
          total,
          nextItemTitle: l.sessions.find((s) => !doneSet.has(s.id))?.title ?? null,
          accessEndsAt: endsAt,
          expired: !!endsAt && endsAt.getTime() <= now.getTime(),
          lastActivityAt: lastActivity.get(l.id) ?? a.activatedAt?.getTime() ?? 0,
        };
      })
      .filter((l) => lectureIds.includes(l.lectureId));

    const open = lectures.filter((l) => !l.expired);
    const byRecent = [...open].sort((a, b) => b.lastActivityAt - a.lastActivityAt);
    const resume = byRecent.find((l) => l.total === 0 || l.done < l.total) ?? null;

    const endingSoon = open
      .filter((l) => l.accessEndsAt && l.accessEndsAt.getTime() - now.getTime() <= SOON_LECTURE_MS && (l.total === 0 || l.done < l.total))
      .sort((a, b) => a.accessEndsAt!.getTime() - b.accessEndsAt!.getTime())
      .map(({ lastActivityAt: _ignored, ...rest }) => rest);

    const coursesEndingSoon = courseAccess
      .filter((c) => visible(c.course) && c.expiresAt && c.expiresAt > now && c.expiresAt.getTime() - now.getTime() <= SOON_COURSE_MS)
      .map((c) => ({ courseId: c.courseId, courseTitle: c.course.title, accessEndsAt: c.expiresAt }));

    if (!resume) return { resume: null, endingSoon, coursesEndingSoon };
    const { lastActivityAt: _ignored, ...resumeOut } = resume;
    return { resume: resumeOut, endingSoon, coursesEndingSoon };
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
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
      include: {
        lectures: {
          where: { deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: {
            sessions: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
            quizzes: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });

    const standaloneLectures = await this.prisma.lecture.findMany({
      where: { courseId, chapterId: null, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
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
    let isDemo = false;
    if (studentId) {
      const student = await this.prisma.user.findUnique({ where: { id: studentId }, select: { isDemo: true } });
      isDemo = (student as any)?.isDemo === true;
      accesses = await this.prisma.studentLectureAccess.findMany({
        where: { studentId, lectureId: { in: allLectures.map((l) => l.id) }, },
      });
      courseAccess = await this.prisma.studentCourseAccess.findFirst({
        where: { studentId, courseId },
      });
    }

    // Per-student progress + per-lecture content counts (for progress bars and "2 videos · 1 quiz · 3 files").
    const lectureIds = allLectures.map((l) => l.id);
    const sessionIds = allLectures.flatMap((l: any) => l.sessions.map((s: any) => s.id));
    const quizIds = allLectures.flatMap((l: any) => l.quizzes.map((q: any) => q.id));
    const [doneSessions, passedQuizzes, fileCounts] = await Promise.all([
      studentId && sessionIds.length
        ? this.prisma.sessionProgress.findMany({ where: { studentId, isCompleted: true, sessionId: { in: sessionIds } }, select: { sessionId: true } })
        : Promise.resolve([] as { sessionId: string }[]),
      studentId && quizIds.length
        ? this.prisma.quizAttempt.findMany({ where: { studentId, status: 'PASSED', quizId: { in: quizIds } }, select: { quizId: true }, distinct: ['quizId'] })
        : Promise.resolve([] as { quizId: string }[]),
      lectureIds.length
        ? this.prisma.attachment.groupBy({ by: ['lectureId'], where: { lectureId: { in: lectureIds }, deletedAt: null }, _count: { _all: true } })
        : Promise.resolve([] as { lectureId: string; _count: { _all: number } }[]),
    ]);
    const doneSessionSet = new Set(doneSessions.map((d) => d.sessionId));
    const passedQuizSet = new Set(passedQuizzes.map((q) => q.quizId));
    const filesByLecture = new Map(fileCounts.map((f) => [f.lectureId, f._count._all]));
    const courseAccessActive = !!courseAccess && (!courseAccess.expiresAt || new Date() <= courseAccess.expiresAt);

    const formatLecture = (l: any) => {
      const locked = isLectureLocked(l);
      const access = effectiveLectureAccess(l, accesses.find((a) => a.lectureId === l.id));
      const viaCourse = courseLevelAccessApplies(l) && !!courseAccess;
      const viaFree = courseLevelAccessApplies(l) && course.isFree;

      let isUnlocked = viaFree || !!access || viaCourse || isDemo;
      const isStarted = access ? access.isStarted : false;
      let isExpired = false;
      // When the student's own timer for this lecture ends (null = no timer / not started).
      let accessEndsAt: Date | null = null;

      if (!viaFree && !isDemo) {
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
          accessEndsAt = effectiveExpiresAt;
        } else if (!access && viaCourse && courseAccess.expiresAt) {
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
        requiresOwnCode: locked,
        chapterId: l.chapterId,
        accessEndsAt,
        progress: {
          done:
            l.sessions.filter((s: any) => doneSessionSet.has(s.id)).length +
            l.quizzes.filter((q: any) => passedQuizSet.has(q.id)).length,
          total: l.sessions.length + l.quizzes.length,
        },
        counts: { videos: l.sessions.length, quizzes: l.quizzes.length, files: filesByLecture.get(l.id) ?? 0 },
        durationSec: l.sessions.reduce((sum: number, s: any) => sum + (s.duration || 0), 0),
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
      // How this student can use the course (drives the course header: unlock vs. progress).
      access: {
        hasFullCourse: courseAccessActive,
        courseExpiresAt: courseAccess?.expiresAt ?? null,
        courseExpired: !!courseAccess && !courseAccessActive,
        isFree: course.isFree,
        isDemo,
      },
    };
  }
}

