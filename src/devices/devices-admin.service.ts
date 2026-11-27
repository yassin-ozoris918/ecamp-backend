import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, type DeviceAttemptOutcome } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DeviceTrustService } from './device-trust.service';
import { hardwareHash, type DeviceSignals } from './device-signals';
import { cleanPublicJwk } from './device-proof';

export interface RiskEntry {
  studentId: string;
  score: number;
  level: 'high' | 'medium' | 'low';
  reasons: { code: string; count?: number }[];
}

const DAY = 86400000;

/** Device change requests, the admin Devices page, and the account-sharing risk score. */
@Injectable()
export class DevicesAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly trust: DeviceTrustService,
  ) {}

  // ─── Student: request a device change (after a blocked sign-in) ─────────────

  async requestChange(changeToken: string, note?: string) {
    let payload: { sub: string; aid: string; purpose: string };
    try {
      payload = await this.jwt.verifyAsync(changeToken, { secret: this.config.get<string>('JWT_ACCESS_SECRET') });
    } catch {
      throw new ForbiddenException({ message: 'auth.errors.deviceChangeExpired', code: 'CHANGE_TOKEN_INVALID' });
    }
    if (payload.purpose !== 'device-change') throw new ForbiddenException('Invalid token');
    const attempt = await this.prisma.deviceLoginAttempt.findFirst({ where: { id: payload.aid, studentId: payload.sub } });
    if (!attempt || !attempt.signals) throw new BadRequestException('auth.errors.deviceChangeExpired');

    const data = {
      signals: attempt.signals as Prisma.InputJsonValue,
      label: attempt.label ?? 'Unknown device',
      kind: attempt.kind ?? 'unknown',
      category: categoryOf(attempt.kind),
      publicKey: attempt.keyThumbprint ? attempt.publicKey : null,
      keyThumbprint: attempt.keyThumbprint,
      browserName: attempt.browserName,
      note: note?.trim().slice(0, 500) || null,
      ipAddress: attempt.ipAddress,
      userAgent: attempt.userAgent,
    };
    // One open request per student: a newer attempt replaces the details of the pending one.
    const pending = await this.prisma.deviceChangeRequest.findFirst({ where: { studentId: payload.sub, status: 'PENDING' } });
    const req = pending
      ? await this.prisma.deviceChangeRequest.update({ where: { id: pending.id }, data })
      : await this.prisma.deviceChangeRequest.create({ data: { ...data, studentId: payload.sub } });
    return { status: req.status, requestedAt: req.updatedAt };
  }

  // ─── Admin ────────────────────────────────────────────────────────────────

  async overview() {
    const since24h = new Date(Date.now() - DAY);
    const since7d = new Date(Date.now() - 7 * DAY);
    const [pendingRequests, blocked24h, newBrowsers7d, studentsWithDevice, risk] = await Promise.all([
      this.prisma.deviceChangeRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.deviceLoginAttempt.count({ where: { createdAt: { gte: since24h }, outcome: { in: ['BLOCKED', 'NEEDS_APPROVAL'] } } }),
      this.prisma.deviceLoginAttempt.count({ where: { createdAt: { gte: since7d }, outcome: 'NEW_BROWSER' } }),
      this.prisma.studentDevice.count({ where: { status: 'ACTIVE' } }),
      this.risk(),
    ]);
    return {
      pendingRequests,
      blocked24h,
      newBrowsers7d,
      studentsWithDevice,
      highRisk: risk.filter((r) => r.level === 'high').length,
      mediumRisk: risk.filter((r) => r.level === 'medium').length,
    };
  }

  async requests(status: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING') {
    const rows = await this.prisma.deviceChangeRequest.findMany({
      where: { status },
      orderBy: { createdAt: status === 'PENDING' ? 'asc' : 'desc' },
      take: 200,
      include: {
        student: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phoneNumber: true,
            trustedDevices: { where: { status: 'ACTIVE' }, select: { label: true, kind: true, createdAt: true, lastSeenAt: true }, take: 1 },
          },
        },
      },
    });
    return rows.map(({ student, signals: _signals, publicKey: _pk, ...r }) => ({
      ...r,
      hasKey: Boolean(r.keyThumbprint),
      student: { id: student.id, fullName: student.fullName, email: student.email, phoneNumber: student.phoneNumber },
      currentDevice: student.trustedDevices[0] ?? null,
    }));
  }

  /** Approving moves the account to the requested device; the old one stops working at once. */
  async approve(requestId: string, adminId: string, reviewNote?: string) {
    const req = await this.prisma.deviceChangeRequest.findFirst({ where: { id: requestId } });
    if (!req) throw new NotFoundException('Request not found');
    if (req.status !== 'PENDING') throw new BadRequestException('This request was already handled');
    const now = new Date();
    const jwk = req.publicKey ? cleanPublicJwk(safeJson(req.publicKey)) : null;

    await this.prisma.$transaction(async (tx) => {
      const old = await tx.studentDevice.findFirst({ where: { studentId: req.studentId, status: 'ACTIVE' }, select: { id: true } });
      await tx.studentDevice.updateMany({ where: { studentId: req.studentId, status: 'ACTIVE' }, data: { status: 'REPLACED', endedAt: now, endReason: 'change_approved' } });
      await tx.deviceBrowser.updateMany({ where: { studentId: req.studentId, revokedAt: null }, data: { revokedAt: now, refreshTokenHash: null } });
      await tx.user.update({ where: { id: req.studentId }, data: { deviceId: null, refreshToken: null } });
      const device = await tx.studentDevice.create({
        data: { studentId: req.studentId, signals: req.signals as Prisma.InputJsonValue, label: req.label, kind: req.kind, category: req.category },
      });
      if (jwk && req.keyThumbprint) {
        await tx.deviceBrowser.upsert({
          where: { studentId_keyThumbprint: { studentId: req.studentId, keyThumbprint: req.keyThumbprint } },
          update: { deviceId: device.id, revokedAt: null, refreshTokenHash: null, lastSeenAt: now },
          create: {
            deviceId: device.id,
            studentId: req.studentId,
            publicKey: JSON.stringify(jwk),
            keyThumbprint: req.keyThumbprint,
            name: req.browserName ?? 'Browser',
            userAgent: req.userAgent,
            lastIp: req.ipAddress,
          },
        });
      }
      await tx.deviceHistory.create({
        data: { studentId: req.studentId, deviceFingerprint: old?.id ?? device.id, action: 'REPLACED', ipAddress: req.ipAddress, browser: req.userAgent },
      });
      await tx.deviceChangeRequest.update({ where: { id: req.id }, data: { status: 'APPROVED', reviewedById: adminId, reviewedAt: now, reviewNote: reviewNote?.slice(0, 500) } });
    });
    return { ok: true };
  }

  async reject(requestId: string, adminId: string, reviewNote?: string) {
    const res = await this.prisma.deviceChangeRequest.updateMany({
      where: { id: requestId, status: 'PENDING' },
      data: { status: 'REJECTED', reviewedById: adminId, reviewedAt: new Date(), reviewNote: reviewNote?.slice(0, 500) },
    });
    if (!res.count) throw new BadRequestException('This request was already handled');
    return { ok: true };
  }

  async attempts(opts: { search?: string; outcome?: string; studentId?: string; skip?: number; take?: number }) {
    const take = Math.min(Math.max(opts.take ?? 50, 1), 200);
    const where: Prisma.DeviceLoginAttemptWhereInput = {};
    if (opts.studentId) where.studentId = opts.studentId;
    if (opts.outcome === 'problems') where.outcome = { in: ['BLOCKED', 'NEEDS_APPROVAL'] };
    else if (opts.outcome && ['BOUND', 'ALLOWED', 'NEW_BROWSER', 'LEGACY', 'BLOCKED', 'NEEDS_APPROVAL'].includes(opts.outcome)) where.outcome = opts.outcome as DeviceAttemptOutcome;
    const q = opts.search?.trim();
    if (q) {
      where.OR = [
        { student: { fullName: { contains: q, mode: 'insensitive' } } },
        { student: { email: { contains: q, mode: 'insensitive' } } },
        { student: { phoneNumber: { contains: q } } },
        { ipAddress: { contains: q } },
        { label: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.deviceLoginAttempt.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: opts.skip ?? 0,
        take,
        select: {
          id: true,
          outcome: true,
          reason: true,
          matchScore: true,
          label: true,
          kind: true,
          browserName: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
          student: { select: { id: true, fullName: true, email: true } },
        },
      }),
      this.prisma.deviceLoginAttempt.count({ where }),
    ]);
    return { items, total };
  }

  async suspicious() {
    const risk = (await this.risk()).filter((r) => r.level !== 'low').slice(0, 100);
    const students = await this.prisma.user.findMany({
      where: { id: { in: risk.map((r) => r.studentId) } },
      select: { id: true, fullName: true, email: true, phoneNumber: true },
    });
    const byId = new Map(students.map((s) => [s.id, s]));
    return risk.map((r) => ({ ...r, student: byId.get(r.studentId) ?? null }));
  }

  async studentDevices(studentId: string) {
    const [devices, requests, attempts, risk] = await Promise.all([
      this.prisma.studentDevice.findMany({
        where: { studentId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          status: true,
          label: true,
          kind: true,
          category: true,
          createdAt: true,
          lastSeenAt: true,
          endedAt: true,
          endReason: true,
          browsers: {
            orderBy: { createdAt: 'asc' },
            select: { id: true, name: true, createdAt: true, lastSeenAt: true, lastIp: true, revokedAt: true },
          },
        },
      }),
      this.prisma.deviceChangeRequest.findMany({
        where: { studentId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, status: true, label: true, kind: true, browserName: true, note: true, createdAt: true, reviewedAt: true, reviewNote: true },
      }),
      this.attempts({ studentId, take: 30 }),
      this.risk([studentId]),
    ]);
    return {
      activeDevice: devices.find((d) => d.status === 'ACTIVE') ?? null,
      pastDevices: devices.filter((d) => d.status !== 'ACTIVE'),
      requests,
      attempts: attempts.items,
      risk: risk[0] ?? { studentId, score: 0, level: 'low', reasons: [] },
      maxBrowsers: 3,
    };
  }

  /**
   * Who does a watermark belong to? The code on the video is the first 8 characters of the account id.
   * Also lists the student's recent videos with watermark trouble.
   */
  async watermarkLookup(code: string) {
    const clean = code.replace(/[^0-9a-f]/gi, '').toLowerCase();
    if (clean.length !== 8) throw new BadRequestException('The code has 8 letters and numbers, e.g. 4F9A2C1B');
    const students = await this.prisma.user.findMany({
      where: { id: { startsWith: clean } },
      take: 5,
      select: { id: true, fullName: true, email: true, phoneNumber: true, role: true, isActive: true, createdAt: true },
    });
    const risk = students.length ? await this.risk(students.map((s) => s.id)) : [];
    const tampers = students.length
      ? await this.prisma.playbackSession.findMany({
          where: { studentId: { in: students.map((s) => s.id) }, tamperCount: { gt: 0 } },
          orderBy: { lastTamperAt: 'desc' },
          take: 10,
          select: { studentId: true, tamperCount: true, lastTamperAt: true, lastTamperKind: true, videoSession: { select: { title: true } } },
        })
      : [];
    return students.map((s) => ({
      ...s,
      risk: risk.find((r) => r.studentId === s.id) ?? { studentId: s.id, score: 0, level: 'low', reasons: [] },
      tampers: tampers
        .filter((t) => t.studentId === s.id)
        .map((t) => ({ video: t.videoSession?.title ?? null, count: t.tamperCount, at: t.lastTamperAt, kind: t.lastTamperKind })),
    }));
  }

  async revokeBrowser(browserId: string) {
    const res = await this.prisma.deviceBrowser.updateMany({ where: { id: browserId, revokedAt: null }, data: { revokedAt: new Date(), refreshTokenHash: null } });
    if (!res.count) throw new NotFoundException('Browser not found or already removed');
    return { ok: true };
  }

  resetStudent(studentId: string, ip?: string, userAgent?: string) {
    return this.trust.resetStudentDevice(studentId, { ip, userAgent });
  }

  // ─── Risk score ───────────────────────────────────────────────────────────

  /**
   * Signs of account sharing over the last 30 days (device changes over 90). Each sign adds points;
   * 50+ is high, 20+ medium. Reasons are codes the admin page turns into plain sentences.
   */
  async risk(onlyStudentIds?: string[]): Promise<RiskEntry[]> {
    const since30 = new Date(Date.now() - 30 * DAY);
    const since90 = new Date(Date.now() - 90 * DAY);
    const scope = onlyStudentIds ? { studentId: { in: onlyStudentIds } } : {};

    const [attemptGroups, badProofs, blockedLabels, sharedKeys, activeDevices, takeovers, changes, tampers] = await Promise.all([
      this.prisma.deviceLoginAttempt.groupBy({ by: ['studentId', 'outcome'], where: { ...scope, createdAt: { gte: since30 } }, _count: { _all: true } }),
      this.prisma.deviceLoginAttempt.groupBy({ by: ['studentId'], where: { ...scope, createdAt: { gte: since30 }, reason: { in: ['bad_proof'] } }, _count: { _all: true } }),
      this.prisma.deviceLoginAttempt.groupBy({ by: ['studentId', 'label'], where: { ...scope, createdAt: { gte: since30 }, outcome: { in: ['BLOCKED', 'NEEDS_APPROVAL'] } } }),
      this.prisma.$queryRaw<{ studentId: string }[]>(Prisma.sql`
        SELECT DISTINCT b."studentId" FROM "DeviceBrowser" b
        WHERE b."revokedAt" IS NULL AND b."keyThumbprint" IN (
          SELECT "keyThumbprint" FROM "DeviceBrowser" WHERE "revokedAt" IS NULL GROUP BY "keyThumbprint" HAVING COUNT(DISTINCT "studentId") > 1
        )`),
      this.prisma.studentDevice.findMany({ where: { status: 'ACTIVE' }, select: { studentId: true, signals: true } }),
      this.prisma.playbackSession.groupBy({ by: ['studentId'], where: { ...scope, supersededAt: { gte: since30 } }, _count: { _all: true } }),
      this.prisma.deviceHistory.groupBy({ by: ['studentId'], where: { ...scope, createdAt: { gte: since90 }, action: { in: ['RESET', 'REPLACED'] } }, _count: { _all: true } }),
      this.prisma.playbackSession.groupBy({ by: ['studentId'], where: { ...scope, tamperCount: { gt: 0 }, lastTamperAt: { gte: since30 } }, _count: { _all: true } }),
    ]);

    const entries = new Map<string, RiskEntry>();
    const add = (studentId: string, points: number, code: string, count?: number) => {
      if (onlyStudentIds && !onlyStudentIds.includes(studentId)) return;
      const e = entries.get(studentId) ?? { studentId, score: 0, level: 'low' as const, reasons: [] };
      e.score += points;
      e.reasons.push({ code, count });
      entries.set(studentId, e);
    };

    const blocked = new Map<string, number>();
    const newBrowsers = new Map<string, number>();
    for (const g of attemptGroups) {
      if (g.outcome === 'BLOCKED' || g.outcome === 'NEEDS_APPROVAL') blocked.set(g.studentId, (blocked.get(g.studentId) ?? 0) + g._count._all);
      if (g.outcome === 'NEW_BROWSER') newBrowsers.set(g.studentId, g._count._all);
    }
    for (const [id, n] of blocked) add(id, Math.min(40, 8 * n), 'blocked_attempts', n);
    const distinctBlocked = new Map<string, number>();
    for (const g of blockedLabels) distinctBlocked.set(g.studentId, (distinctBlocked.get(g.studentId) ?? 0) + 1);
    for (const [id, n] of distinctBlocked) if (n >= 2) add(id, 10, 'several_devices', n);
    for (const [id, n] of newBrowsers) if (n > 2) add(id, Math.min(20, 10 * (n - 2)), 'many_new_browsers', n);
    for (const g of badProofs) add(g.studentId, Math.min(40, 20 * g._count._all), 'bad_proof', g._count._all);
    for (const r of sharedKeys) add(r.studentId, 40, 'browser_shared_with_other_account');

    const byHash = new Map<string, Set<string>>();
    for (const d of activeDevices) {
      const s = d.signals as unknown as DeviceSignals;
      if (!s?.os) continue;
      const h = hardwareHash({ ...s, gpu: s.gpu ?? '' });
      const set = byHash.get(h) ?? new Set<string>();
      set.add(d.studentId);
      byHash.set(h, set);
    }
    for (const set of byHash.values()) if (set.size > 1) for (const id of set) add(id, 15, 'same_hardware_as_other_account', set.size - 1);

    for (const g of takeovers) add(g.studentId, Math.min(25, 5 * g._count._all), 'playback_taken_over', g._count._all);
    for (const g of changes) add(g.studentId, Math.min(30, 10 * g._count._all), 'device_changes', g._count._all);
    for (const g of tampers) add(g.studentId, Math.min(40, 20 * g._count._all), 'watermark_tampered', g._count._all);

    return [...entries.values()]
      .map((e) => ({ ...e, score: Math.min(100, e.score), level: e.score >= 50 ? ('high' as const) : e.score >= 20 ? ('medium' as const) : ('low' as const) }))
      .sort((a, b) => b.score - a.score);
  }
}

function categoryOf(kind?: string | null) {
  if (kind === 'iphone' || kind === 'android_phone') return 'mobile';
  if (kind === 'ipad' || kind === 'android_tablet') return 'tablet';
  if (kind === 'windows' || kind === 'mac' || kind === 'linux') return 'desktop';
  return 'unknown';
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
