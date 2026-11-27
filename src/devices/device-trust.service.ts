import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DeviceAttemptOutcome, Prisma, type StudentDevice, type DeviceBrowser } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { browserName, cleanSignals, compareSignals, describeDevice, MATCH_PROBABLE, MATCH_SAME, type DeviceSignals } from './device-signals';
import { cleanPublicJwk, keyThumbprint, verifyDeviceProof } from './device-proof';

/** What the browser sends with sign-in, registration and login renewal. */
export interface DeviceInput {
  signals?: unknown;
  key?: { jwk?: unknown; proof?: unknown } | null;
  keyError?: string;
  legacyId?: string | null;
  legacyFresh?: string | null;
}

export interface DeviceContext {
  ip?: string;
  userAgent?: string;
  /** The old x-device-id header (single hash), still sent by every client. */
  headerDeviceId?: string;
}

export interface DeviceGrant {
  deviceId: string | null;
  browserId: string | null;
}

/** Browsers allowed on one device before an admin has to approve more. */
export const MAX_BROWSERS_PER_DEVICE = 3;
const ATTEMPT_RETENTION_DAYS = 90;

type ActiveDevice = StudentDevice & { browsers: DeviceBrowser[] };

/**
 * Decides whether a student may use the device they're signing in from.
 *
 * - First sign-in: the device is linked to the account.
 * - Known browser (its private key signs a fresh challenge): allowed.
 * - New browser on the same machine (hardware details match): allowed and added, up to 3 browsers.
 * - Different machine: blocked, with a short-lived token to request a device change.
 * - Students linked before this system (single hash): upgraded on their next sign-in.
 */
@Injectable()
export class DeviceTrustService {
  private readonly logger = new Logger(DeviceTrustService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ─── Sign-in / registration ───────────────────────────────────────────────

  async checkSignIn(
    student: { id: string; deviceId: string | null },
    input: DeviceInput | undefined,
    ctx: DeviceContext,
    purpose: 'login' | 'register' | 'refresh',
  ): Promise<DeviceGrant> {
    const signals = cleanSignals(input?.signals);
    if (!signals) return this.legacyCheck(student, ctx);

    const desc = describeDevice(signals, ctx.userAgent);
    const bname = browserName(ctx.userAgent);
    const jwk = cleanPublicJwk(input?.key?.jwk);
    const proofOk = Boolean(jwk && verifyDeviceProof(jwk, input?.key?.proof, purpose));
    const thumb = jwk && proofOk ? keyThumbprint(jwk) : null;
    const legacyValues = [input?.legacyId, input?.legacyFresh, ctx.headerDeviceId].filter((v): v is string => typeof v === 'string' && v.length > 0);
    const base = {
      studentId: student.id,
      signals: signals as unknown as Prisma.InputJsonValue,
      label: desc.label,
      kind: desc.kind,
      publicKey: jwk ? JSON.stringify(jwk) : null,
      keyThumbprint: thumb,
      browserName: bname,
      ipAddress: ctx.ip ?? null,
      userAgent: ctx.userAgent?.slice(0, 400) ?? null,
    };
    const badProof = Boolean(jwk && !proofOk);

    const active = await this.activeDevice(student.id);

    // ── No trusted device yet ──
    if (!active) {
      if (student.deviceId && !legacyValues.includes(student.deviceId)) {
        // Linked with the old system to a device we can't compare against: block, but explain which one.
        const old = await this.prisma.deviceSession.findFirst({
          where: { studentId: student.id, deviceFingerprint: student.deviceId },
          orderBy: { lastLoginAt: 'desc' },
          select: { browser: true, createdAt: true },
        });
        const registered = describeDevice(null, old?.browser);
        return this.block(base, 'legacy_mismatch', null, {
          label: old?.browser ? registered.label : null,
          kind: registered.kind,
          since: old?.createdAt ?? null,
        });
      }
      const reason = student.deviceId ? 'upgraded' : 'first_device';
      const created = await this.prisma.$transaction(async (tx) => {
        const device = await tx.studentDevice.create({
          data: {
            studentId: student.id,
            signals: base.signals,
            label: desc.label,
            kind: desc.kind,
            category: desc.category,
            legacyId: student.deviceId ?? input?.legacyId ?? input?.legacyFresh ?? null,
          },
        });
        const browser = thumb ? await tx.deviceBrowser.create({ data: this.browserData(device.id, student.id, jwk!, thumb, bname, ctx) }) : null;
        if (!student.deviceId && device.legacyId) await tx.user.update({ where: { id: student.id }, data: { deviceId: device.legacyId } });
        await tx.deviceHistory.create({
          data: { studentId: student.id, deviceFingerprint: device.id, action: 'REGISTERED', ipAddress: ctx.ip, browser: ctx.userAgent },
        });
        return { device, browser };
      });
      await this.record({ ...base, outcome: 'BOUND', reason: badProof ? `${reason}_bad_proof` : reason, matchScore: 1, browserId: created.browser?.id ?? null });
      return { deviceId: created.device.id, browserId: created.browser?.id ?? null };
    }

    // ── Known browser ──
    if (thumb) {
      const known = active.browsers.find((b) => b.keyThumbprint === thumb);
      if (known) {
        const cmp = compareSignals(signals, active.signals as unknown as DeviceSignals);
        await this.touch(active.id, known.id, ctx);
        await this.record({
          ...base,
          outcome: 'ALLOWED',
          reason: cmp.hardMismatch || cmp.score < MATCH_PROBABLE ? 'known_browser_hardware_changed' : 'known_browser',
          matchScore: cmp.score,
          browserId: known.id,
        });
        return { deviceId: active.id, browserId: known.id };
      }
    }

    // ── New browser, or a browser that lost its key: compare the hardware ──
    const cmp = compareSignals(signals, active.signals as unknown as DeviceSignals);
    const legacyMatch = Boolean(active.legacyId && legacyValues.includes(active.legacyId));
    const score = legacyMatch ? Math.max(cmp.score, 0.9) : cmp.score;
    const registered = { label: active.label, kind: active.kind, since: active.createdAt };

    if (!legacyMatch && (cmp.hardMismatch || score < MATCH_PROBABLE)) {
      return this.block(base, cmp.hardMismatch ? `different_${cmp.hardMismatch}` : 'different_hardware', score, registered);
    }

    if (!thumb) {
      // No usable key (very old browser, private mode quirks, or a forged proof).
      if (score >= MATCH_SAME && !badProof) {
        await this.touch(active.id, null, ctx);
        await this.record({ ...base, outcome: 'ALLOWED', reason: 'no_key', matchScore: score, browserId: null });
        return { deviceId: active.id, browserId: null };
      }
      return this.block(base, badProof ? 'bad_proof' : 'no_key_doubtful', score, registered, 'NEEDS_APPROVAL');
    }

    if (active.browsers.length >= MAX_BROWSERS_PER_DEVICE) {
      return this.block(base, 'too_many_browsers', score, registered, 'NEEDS_APPROVAL');
    }

    const browser = await this.prisma.$transaction(async (tx) => {
      const b = await tx.deviceBrowser.upsert({
        where: { studentId_keyThumbprint: { studentId: student.id, keyThumbprint: thumb } },
        update: { deviceId: active.id, revokedAt: null, lastSeenAt: new Date(), userAgent: ctx.userAgent?.slice(0, 400), lastIp: ctx.ip, name: bname },
        create: this.browserData(active.id, student.id, jwk!, thumb, bname, ctx),
      });
      await tx.studentDevice.update({ where: { id: active.id }, data: { lastSeenAt: new Date() } });
      return b;
    });
    const reason = legacyMatch && cmp.score < MATCH_SAME ? 'legacy_match' : score >= MATCH_SAME ? 'hardware_match' : 'probable_match';
    await this.record({ ...base, outcome: 'NEW_BROWSER', reason, matchScore: score, browserId: browser.id });
    return { deviceId: active.id, browserId: browser.id };
  }

  /** Login renewal for a token tied to a browser: the browser must still be trusted and sign a fresh challenge. */
  async checkRefresh(studentId: string, browserId: string, input: DeviceInput | undefined, ctx: DeviceContext): Promise<DeviceBrowser> {
    const browser = await this.prisma.deviceBrowser.findFirst({
      where: { id: browserId, studentId, revokedAt: null, device: { status: 'ACTIVE' } },
    });
    if (!browser) throw new ForbiddenException({ message: 'auth.errors.deviceRevoked', code: 'DEVICE_REVOKED' });
    const jwk = cleanPublicJwk(safeJson(browser.publicKey));
    if (!jwk || !verifyDeviceProof(jwk, input?.key?.proof, 'refresh')) {
      throw new ForbiddenException({ message: 'auth.errors.deviceProofFailed', code: 'DEVICE_PROOF_FAILED' });
    }
    await this.touch(browser.deviceId, browser.id, ctx);
    return browser;
  }

  async saveBrowserRefreshToken(browserId: string, hash: string | null) {
    await this.prisma.deviceBrowser.updateMany({ where: { id: browserId }, data: { refreshTokenHash: hash } });
  }

  /** Clears the trusted device: the next sign-in links a new one. */
  async resetStudentDevice(studentId: string, ctx: DeviceContext, reason = 'admin_reset') {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const active = await tx.studentDevice.findMany({ where: { studentId, status: 'ACTIVE' }, select: { id: true } });
      await tx.studentDevice.updateMany({ where: { studentId, status: 'ACTIVE' }, data: { status: 'REVOKED', endedAt: now, endReason: reason } });
      await tx.deviceBrowser.updateMany({ where: { studentId, revokedAt: null }, data: { revokedAt: now, refreshTokenHash: null } });
      const user = await tx.user.findFirst({ where: { id: studentId }, select: { deviceId: true } });
      await tx.user.update({ where: { id: studentId }, data: { deviceId: null, refreshToken: null } });
      await tx.deviceSession.updateMany({ where: { studentId }, data: { deletedAt: now } });
      const fp = active[0]?.id ?? user?.deviceId;
      if (fp) {
        await tx.deviceHistory.create({ data: { studentId, deviceFingerprint: fp, action: 'RESET', ipAddress: ctx.ip, browser: ctx.userAgent } });
      }
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private activeDevice(studentId: string): Promise<ActiveDevice | null> {
    return this.prisma.studentDevice.findFirst({
      where: { studentId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      include: { browsers: { where: { revokedAt: null } } },
    });
  }

  /** Old app versions send only the single-hash id. Same rule as before, recorded in the new log. */
  private async legacyCheck(student: { id: string; deviceId: string | null }, ctx: DeviceContext): Promise<DeviceGrant> {
    const id = ctx.headerDeviceId;
    const base = { studentId: student.id, ipAddress: ctx.ip ?? null, userAgent: ctx.userAgent?.slice(0, 400) ?? null, browserName: browserName(ctx.userAgent) };
    if (!id) throw new ForbiddenException('auth.errors.deviceRequired');
    const active = await this.activeDevice(student.id);
    if (active) {
      if (active.legacyId === id) {
        await this.record({ ...base, outcome: 'LEGACY', reason: 'legacy_id', label: active.label, kind: active.kind });
        return { deviceId: active.id, browserId: null };
      }
      return this.block(base, 'legacy_mismatch', null, { label: active.label, kind: active.kind, since: active.createdAt });
    }
    if (student.deviceId && student.deviceId !== id) {
      return this.block(base, 'legacy_mismatch', null, { label: null, kind: 'unknown', since: null });
    }
    if (!student.deviceId) await this.prisma.user.update({ where: { id: student.id }, data: { deviceId: id } });
    await this.record({ ...base, outcome: 'LEGACY', reason: student.deviceId ? 'legacy_id' : 'legacy_first_device' });
    return { deviceId: null, browserId: null };
  }

  private async block(
    base: Record<string, unknown> & { studentId: string },
    reason: string,
    score: number | null,
    registered: { label: string | null; kind: string; since: Date | null },
    outcome: DeviceAttemptOutcome = 'BLOCKED',
  ): Promise<never> {
    const attempt = await this.record({ ...base, outcome, reason, matchScore: score });
    const pending = await this.prisma.deviceChangeRequest.findFirst({ where: { studentId: base.studentId, status: 'PENDING' }, select: { id: true } });
    const changeToken = await this.jwt.signAsync(
      { sub: base.studentId, aid: attempt.id, purpose: 'device-change' },
      { secret: this.config.get<string>('JWT_ACCESS_SECRET'), expiresIn: '30m' },
    );
    throw new ForbiddenException({
      message: 'auth.errors.unrecognizedDevice',
      code: 'UNRECOGNIZED_DEVICE',
      reason: outcome === 'NEEDS_APPROVAL' ? 'needs_approval' : 'other_device',
      registeredDevice: { label: registered.label, kind: registered.kind, since: registered.since },
      changeToken,
      pendingRequest: Boolean(pending),
    });
  }

  private browserData(deviceId: string, studentId: string, jwk: object, thumb: string, name: string, ctx: DeviceContext) {
    return {
      deviceId,
      studentId,
      publicKey: JSON.stringify(jwk),
      keyThumbprint: thumb,
      name,
      userAgent: ctx.userAgent?.slice(0, 400),
      lastIp: ctx.ip,
    };
  }

  private async touch(deviceId: string, browserId: string | null, ctx: DeviceContext) {
    const now = new Date();
    await Promise.all([
      this.prisma.studentDevice.updateMany({ where: { id: deviceId }, data: { lastSeenAt: now } }),
      browserId
        ? this.prisma.deviceBrowser.updateMany({ where: { id: browserId }, data: { lastSeenAt: now, lastIp: ctx.ip, userAgent: ctx.userAgent?.slice(0, 400) } })
        : Promise.resolve(),
    ]);
  }

  private async record(data: Prisma.DeviceLoginAttemptUncheckedCreateInput) {
    const attempt = await this.prisma.deviceLoginAttempt.create({ data, select: { id: true } });
    // Keep the table small without a scheduler: prune old rows now and then.
    if (Math.random() < 0.01) {
      const cutoff = new Date(Date.now() - ATTEMPT_RETENTION_DAYS * 86400000);
      this.prisma.deviceLoginAttempt.deleteMany({ where: { createdAt: { lt: cutoff } } }).catch((e) => this.logger.warn(`Pruning device attempts failed: ${e?.message ?? e}`));
    }
    return attempt;
  }
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
