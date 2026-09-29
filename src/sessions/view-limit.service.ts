import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * ViewLimitService
 *
 * Manages the per-student, per-session view counting system.
 *
 * Key Design:
 *  - The limit is configured on Lecture.maxViews (null = unlimited).
 *  - Each video Session independently inherits that limit.
 *  - Usage is tracked in StudentSessionViewUsage (studentId, sessionId) → usedViews.
 *  - Idempotency is enforced via PlaybackSession tokens (one per viewing attempt).
 *    A PlaybackSession can only be consumed once, preventing duplicate increments
 *    from retries, React re-renders, or network issues.
 *  - Atomic consumption uses a conditional update to prevent race-condition overflows.
 *
 * Quizzes and Exams are NOT affected by this service.
 */
@Injectable()
export class ViewLimitService {
  constructor(private prisma: PrismaService) {}

  /**
   * Returns the current view usage for a student + session pair.
   * Also returns the inherited maxViews from the parent lecture.
   * If the session has no video, returns null for maxViews (no limit applies).
   */
  async getViewStatus(
    sessionId: string,
    studentId: string,
  ): Promise<{
    usedViews: number;
    maxViews: number | null;
    isExhausted: boolean;
  }> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { lecture: { select: { maxViews: true } } },
    });

    if (!session) throw new NotFoundException('Session not found');

    const maxViews = session.lecture.maxViews ?? null;

    const usage = await this.prisma.studentSessionViewUsage.findUnique({
      where: { studentId_sessionId: { studentId, sessionId } },
    });

    const usedViews = usage?.usedViews ?? 0;
    const isExhausted = maxViews !== null && usedViews >= maxViews;

    return { usedViews, maxViews, isExhausted };
  }

  /**
   * Checks whether a student is allowed to start a new playback of this session.
   * Throws ForbiddenException if the view limit is exhausted.
   * Does NOT consume a view — that happens via consumeView().
   */
  async assertCanWatch(sessionId: string, studentId: string): Promise<void> {
    const { isExhausted, usedViews, maxViews } = await this.getViewStatus(
      sessionId,
      studentId,
    );

    if (isExhausted) {
      throw new ForbiddenException(
        `You have reached the maximum number of views allowed for this session (${usedViews}/${maxViews}).`,
      );
    }
  }

  /**
   * Creates a new PlaybackSession token for a student + session.
   * This token is used for idempotent view consumption.
   * Tokens expire after 8 hours (enough for any reasonable viewing session).
   * A new token is issued even if a previous one exists — the student may have
   * started watching again in a new browser tab.
   */
  async createPlaybackSession(
    sessionId: string,
    studentId: string,
  ): Promise<string> {
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours

    const ps = await this.prisma.playbackSession.create({
      data: {
        studentId,
        sessionId,
        consumed: false,
        expiresAt,
      },
    });

    return ps.id;
  }

  /**
   * Atomically consumes one view for a student + session using an idempotency token.
   *
   * Rules:
   *  - If the PlaybackSession is already consumed → no-op (idempotent).
   *  - If the PlaybackSession is expired → BadRequestException.
   *  - If the PlaybackSession does not belong to this student/session → ForbiddenException.
   *  - If usedViews >= maxViews (race condition) → ForbiddenException.
   *  - Otherwise → atomically increments usedViews and marks token consumed.
   *
   * Returns the new usedViews count.
   */
  async consumeView(
    playbackSessionId: string,
    studentId: string,
    sessionId: string,
  ): Promise<{ usedViews: number; maxViews: number | null }> {
    // 1. Load and validate the playback session token
    const ps = await this.prisma.playbackSession.findUnique({
      where: { id: playbackSessionId },
    });

    if (!ps) {
      throw new NotFoundException('Playback session not found.');
    }
    if (ps.studentId !== studentId) {
      throw new ForbiddenException('This playback session does not belong to you.');
    }
    if (ps.sessionId !== sessionId) {
      throw new ForbiddenException('Playback session session mismatch.');
    }
    if (ps.consumed) {
      // Already consumed — idempotent. Return current state.
      const { usedViews, maxViews } = await this.getViewStatus(sessionId, studentId);
      return { usedViews, maxViews };
    }
    if (new Date() > ps.expiresAt) {
      throw new BadRequestException('Playback session has expired. Please reload the video.');
    }

    // 2. Get the inherited maxViews from the parent lecture
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { lecture: { select: { maxViews: true } } },
    });
    if (!session) throw new NotFoundException('Session not found');
    const maxViews = session.lecture.maxViews ?? null;

    // 3. Atomically increment usedViews and mark playback session consumed
    const result = await this.prisma.$transaction(async (tx) => {
      // Upsert the usage record
      let usage = await tx.studentSessionViewUsage.findUnique({
        where: { studentId_sessionId: { studentId, sessionId } },
      });

      if (!usage) {
        usage = await tx.studentSessionViewUsage.create({
          data: { studentId, sessionId, usedViews: 0 },
        });
      }

      // Atomic guard: if already at or over limit, deny (race condition safety)
      if (maxViews !== null && usage.usedViews >= maxViews) {
        // Mark the token as consumed so the frontend can't retry
        await tx.playbackSession.update({
          where: { id: playbackSessionId },
          data: { consumed: true },
        });
        throw new ForbiddenException(
          `You have reached the maximum number of views allowed for this session (${usage.usedViews}/${maxViews}).`,
        );
      }

      // Increment view count
      const updated = await tx.studentSessionViewUsage.update({
        where: { studentId_sessionId: { studentId, sessionId } },
        data: { usedViews: { increment: 1 } },
      });

      // Mark the idempotency token as consumed
      await tx.playbackSession.update({
        where: { id: playbackSessionId },
        data: { consumed: true },
      });

      return updated.usedViews;
    });

    return { usedViews: result, maxViews };
  }
}
