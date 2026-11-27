/**
 * E2E: trusted devices. Browsers are simulated with real P-256 keys (like WebCrypto) signing
 * "purpose|ts|nonce", so signature checks, replay protection and token binding are exercised for real.
 * Needs a disposable Postgres in DATABASE_URL.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { generateKeyPairSync, randomBytes, sign, type KeyObject } from 'crypto';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ViewLimitService } from '../src/sessions/view-limit.service';

jest.setTimeout(180000);

class FakeBrowser {
  private priv: KeyObject;
  jwk: Record<string, string>;
  constructor(public ua: string) {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    this.priv = privateKey;
    const j = publicKey.export({ format: 'jwk' }) as Record<string, string>;
    this.jwk = { kty: j.kty, crv: j.crv, x: j.x, y: j.y };
  }
  proof(purpose: string, ts = Date.now()) {
    const nonce = randomBytes(16).toString('base64url');
    const sig = sign('sha256', Buffer.from(`${purpose}|${ts}|${nonce}`), { key: this.priv, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    return { ts, nonce, sig };
  }
  device(purpose: string, signals: object, extra: object = {}) {
    return { signals, key: { jwk: this.jwk, proof: this.proof(purpose) }, legacyId: null, legacyFresh: null, ...extra };
  }
}

const LAPTOP = { v: 1, os: 'Windows', platform: 'Windows', mobile: false, cores: 8, memory: 8, screen: '1920x1080', colorDepth: 24, touch: 0, tz: 'Africa/Cairo', gpu: 'Intel Iris Xe Graphics', gpuVendor: 'intel', model: null };
// Same laptop in Firefox on an external monitor: memory hidden, other screen size, dGPU in use.
const LAPTOP_FIREFOX = { ...LAPTOP, memory: null, screen: '2560x1440', gpu: 'Intel UHD Graphics', gpuVendor: 'intel' };
const PHONE = { v: 1, os: 'Android', platform: 'Android', mobile: true, cores: 8, memory: 4, screen: '915x412', colorDepth: 24, touch: 5, tz: 'Africa/Cairo', gpu: 'Adreno (TM) 619', gpuVendor: 'qualcomm', model: 'SM-A525F' };
const OTHER_LAPTOP = { ...LAPTOP, cores: 16, screen: '1366x768', gpu: 'NVIDIA GeForce RTX 3060', gpuVendor: 'nvidia', tz: 'Europe/London' };

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const EDGE = `${CHROME} Edg/131.0`;
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-A525F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';

describe('Trusted devices (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  const tag = `dev-${Date.now()}`;
  const password = 'Secret#123';
  let adminToken = '';
  const http = () => request(app.getHttpServer());
  const decode = (t: string) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString());

  const makeStudent = async (key: string, extra: object = {}) =>
    prisma.user.create({ data: { fullName: key, email: `${key}-${tag}@t.test`, password: await bcrypt.hash(password, 4), role: Role.STUDENT, ...extra } });
  // Each sign-in from its own address so the 5-per-minute login limit doesn't interfere.
  let ipCounter = 1;
  const nextIp = () => `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;
  const login = (email: string, device: object | undefined, ua: string, header = 'hdr') =>
    http()
      .post('/auth/login')
      .set('user-agent', ua)
      .set('x-device-id', header)
      .set('x-forwarded-for', nextIp())
      .send({ email, password, ...(device ? { device } : {}) });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.getHttpAdapter().getInstance().set('trust proxy', true);
    await app.init();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    const admin = await prisma.user.create({ data: { fullName: 'admin', email: `admin-${tag}@t.test`, password: 'x', role: Role.ADMIN } });
    adminToken = jwt.sign({ sub: admin.id, email: admin.email, role: Role.ADMIN }, { secret: process.env.JWT_ACCESS_SECRET || 'test_secret' });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.course.deleteMany({ where: { title: { endsWith: tag } } });
      await prisma.user.deleteMany({ where: { email: { endsWith: `${tag}@t.test` } } });
    }
    await app?.close();
  });

  it('links the first device, then lets other browsers on the same laptop in, and blocks other machines', async () => {
    const s = await makeStudent('alice');
    const chrome = new FakeBrowser(CHROME);

    const first = await login(s.email, chrome.device('login', LAPTOP), CHROME).expect(200);
    const claims = decode(first.body.accessToken);
    expect(claims.bid).toBeTruthy();
    expect(claims.did).toBeTruthy();
    expect(await prisma.studentDevice.count({ where: { studentId: s.id, status: 'ACTIVE' } })).toBe(1);

    // Same browser again
    await login(s.email, chrome.device('login', LAPTOP), CHROME).expect(200);

    // Edge and Firefox on the same laptop (Firefox on an external monitor) → added automatically
    const edge = new FakeBrowser(EDGE);
    const firefox = new FakeBrowser(FIREFOX);
    await login(s.email, edge.device('login', LAPTOP), EDGE).expect(200);
    const ff = await login(s.email, firefox.device('login', LAPTOP_FIREFOX), FIREFOX).expect(200);
    expect(decode(ff.body.accessToken).bid).not.toBe(claims.bid);
    expect(await prisma.deviceBrowser.count({ where: { studentId: s.id, revokedAt: null } })).toBe(3);

    // Signing in on Edge did not sign Chrome out: Chrome's refresh token still works
    const refreshed = await http()
      .post('/auth/refresh')
      .set('Authorization', `Bearer ${first.body.refreshToken}`)
      .send({ device: { key: { proof: chrome.proof('refresh') } } })
      .expect(200);
    expect(decode(refreshed.body.accessToken).bid).toBe(claims.bid);

    // A different laptop → blocked, with what to use instead and a change token
    const other = new FakeBrowser(CHROME);
    const blocked = await login(s.email, other.device('login', OTHER_LAPTOP), CHROME).expect(403);
    expect(blocked.body).toMatchObject({ code: 'UNRECOGNIZED_DEVICE', reason: 'other_device', pendingRequest: false });
    expect(blocked.body.registeredDevice.label).toBe('Windows computer · Intel Iris Xe Graphics');
    expect(blocked.body.changeToken).toBeTruthy();

    // A phone → blocked
    await login(s.email, new FakeBrowser(ANDROID).device('login', PHONE), ANDROID).expect(403);

    // A 4th browser on the laptop needs approval
    const fourth = await login(s.email, new FakeBrowser(CHROME).device('login', LAPTOP), CHROME).expect(403);
    expect(fourth.body.reason).toBe('needs_approval');
  });

  it('rejects forged and replayed proofs, and refresh without a valid proof', async () => {
    const s = await makeStudent('bob');
    const chrome = new FakeBrowser(CHROME);
    const ok = await login(s.email, chrome.device('login', LAPTOP), CHROME).expect(200);

    // Copying the public key but signing with another key (someone "copying the device") → not accepted as that browser
    const thief = new FakeBrowser(CHROME);
    const forged = { signals: LAPTOP, key: { jwk: chrome.jwk, proof: thief.proof('login') } };
    const res = await login(s.email, forged, CHROME).expect(403);
    expect(res.body.reason).toBe('needs_approval');
    const attempt = await prisma.deviceLoginAttempt.findFirst({ where: { studentId: s.id }, orderBy: { createdAt: 'desc' } });
    expect(attempt!.reason).toBe('bad_proof');

    // Replaying a captured proof
    const device = chrome.device('login', LAPTOP);
    await login(s.email, device, CHROME).expect(200);
    await login(s.email, device, CHROME).expect(403);

    // Old proof (10 minutes)
    await login(s.email, { signals: LAPTOP, key: { jwk: chrome.jwk, proof: chrome.proof('login', Date.now() - 600000) } }, CHROME).expect(403);

    // Refresh needs this browser's signature
    await http().post('/auth/refresh').set('Authorization', `Bearer ${ok.body.refreshToken}`).send({}).expect(403);
    await http()
      .post('/auth/refresh')
      .set('Authorization', `Bearer ${ok.body.refreshToken}`)
      .send({ device: { key: { proof: thief.proof('refresh') } } })
      .expect(403);
  });

  it('device change request → admin approves → the old device stops working at once', async () => {
    const s = await makeStudent('carol');
    const oldBrowser = new FakeBrowser(CHROME);
    const oldLogin = await login(s.email, oldBrowser.device('login', LAPTOP), CHROME).expect(200);
    await http().get('/users/me').set('Authorization', `Bearer ${oldLogin.body.accessToken}`).expect(200);

    const phone = new FakeBrowser(ANDROID);
    const blocked = await login(s.email, phone.device('login', PHONE), ANDROID).expect(403);
    await http().post('/devices/change-request').set('x-forwarded-for', nextIp()).send({ changeToken: 'nope' }).expect(403);
    await http().post('/devices/change-request').set('x-forwarded-for', nextIp()).send({ changeToken: blocked.body.changeToken, note: 'New phone' }).expect(200);

    // Shows as pending on the next blocked attempt and for the admin
    const again = await login(s.email, phone.device('login', PHONE), ANDROID).expect(403);
    expect(again.body.pendingRequest).toBe(true);
    await http().get('/admin/devices/requests').set('Authorization', `Bearer ${tokenFor(s)}`).expect(403);
    const list = await http().get('/admin/devices/requests').set('Authorization', `Bearer ${adminToken}`).expect(200);
    const req = list.body.find((r: any) => r.student.id === s.id);
    expect(req).toMatchObject({ label: 'Android phone · SM-A525F', note: 'New phone', hasKey: true, currentDevice: { label: 'Windows computer · Intel Iris Xe Graphics' } });

    await http().post(`/admin/devices/requests/${req.id}/approve`).set('Authorization', `Bearer ${adminToken}`).send({}).expect(201);
    await http().post(`/admin/devices/requests/${req.id}/approve`).set('Authorization', `Bearer ${adminToken}`).send({}).expect(400);

    // Old laptop: its access token is refused right away, and it can't sign in
    const revoked = await http().get('/users/me').set('Authorization', `Bearer ${oldLogin.body.accessToken}`).expect(401);
    expect(revoked.body.code).toBe('DEVICE_REVOKED');
    await login(s.email, oldBrowser.device('login', LAPTOP), CHROME).expect(403);
    // New phone: signs in straight away with the browser that asked
    await login(s.email, phone.device('login', PHONE), ANDROID).expect(200);
  });

  it('upgrades students linked by the old single-hash system without locking them out', async () => {
    const s = await makeStudent('dave', { deviceId: 'abc123' });
    const chrome = new FakeBrowser(CHROME);
    // Wrong old id → still blocked (we can't compare hardware for the old link)
    await login(s.email, chrome.device('login', LAPTOP, { legacyId: 'zzz' }), CHROME, 'zzz').expect(403);
    // Matching old id (cached in this browser) → upgraded to a trusted device
    const ok = await login(s.email, chrome.device('login', LAPTOP, { legacyId: 'abc123' }), CHROME, 'abc123').expect(200);
    expect(decode(ok.body.accessToken).bid).toBeTruthy();
    const dev = await prisma.studentDevice.findFirst({ where: { studentId: s.id, status: 'ACTIVE' } });
    expect(dev!.legacyId).toBe('abc123');

    // An old app version (no device details, only the header) keeps working on that device
    const legacy = await login(s.email, undefined, CHROME, 'abc123').expect(200);
    expect(decode(legacy.body.accessToken).bid).toBeUndefined();
    await login(s.email, undefined, CHROME, 'other').expect(403);
  });

  it('admin reset clears the device; demo accounts are never restricted', async () => {
    const s = await makeStudent('erin');
    const b = new FakeBrowser(CHROME);
    await login(s.email, b.device('login', LAPTOP), CHROME).expect(200);
    await http().post(`/admin/devices/students/${s.id}/reset`).set('Authorization', `Bearer ${adminToken}`).expect(201);
    expect(await prisma.studentDevice.count({ where: { studentId: s.id, status: 'ACTIVE' } })).toBe(0);
    await login(s.email, new FakeBrowser(ANDROID).device('login', PHONE), ANDROID).expect(200); // links the new device

    const demo = await makeStudent('demo', { isDemo: true });
    await login(demo.email, undefined, CHROME, '').expect(200);
  });

  it('one device streaming at a time', async () => {
    const s = await makeStudent('frank');
    const course = await prisma.course.create({ data: { title: `C ${tag}` } });
    const lecture = await prisma.lecture.create({ data: { courseId: course.id, title: 'L', orderIndex: 0 } });
    const session = await prisma.session.create({ data: { lectureId: lecture.id, title: 'S', videoUrl: 'https://x.test/v.mp4' } as any });
    const views = app.get(ViewLimitService);
    const a1 = await views.createPlaybackSession(session.id, s.id, 'browser-a');
    const a2 = await views.createPlaybackSession(session.id, s.id, 'browser-a'); // second tab, same browser
    expect((await views.heartbeat(a1, s.id)).active).toBe(true);
    const b1 = await views.createPlaybackSession(session.id, s.id, 'browser-b'); // another browser starts
    expect(await views.heartbeat(a1, s.id)).toEqual({ active: false, reason: 'playing_elsewhere' });
    expect((await views.heartbeat(a2, s.id)).active).toBe(false);
    expect((await views.heartbeat(b1, s.id)).active).toBe(true);
  });

  it('admin overview, suspicious list, attempts and student detail', async () => {
    const ov = await http().get('/admin/devices/overview').set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(ov.body.blocked24h).toBeGreaterThanOrEqual(3);
    const sus = await http().get('/admin/devices/suspicious').set('Authorization', `Bearer ${adminToken}`).expect(200);
    const alice = sus.body.find((r: any) => r.student?.email === `alice-${tag}@t.test`);
    expect(alice.reasons.map((r: any) => r.code)).toContain('blocked_attempts');
    const bob = sus.body.find((r: any) => r.student?.email === `bob-${tag}@t.test`);
    expect(bob.reasons.map((r: any) => r.code)).toContain('bad_proof');
    const attempts = await http().get('/admin/devices/attempts?outcome=problems&search=alice').set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(attempts.body.total).toBeGreaterThanOrEqual(3);
    const aliceId = alice.studentId;
    const detail = await http().get(`/admin/devices/students/${aliceId}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(detail.body.activeDevice.browsers).toHaveLength(3);
    const edge = detail.body.activeDevice.browsers[1];
    await http().post(`/admin/devices/browsers/${edge.id}/revoke`).set('Authorization', `Bearer ${adminToken}`).expect(201);
    const after = await http().get(`/admin/devices/students/${aliceId}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(after.body.activeDevice.browsers.find((b: any) => b.id === edge.id).revokedAt).toBeTruthy();
  });

  function tokenFor(u: { id: string; email: string }) {
    return jwt.sign({ sub: u.id, email: u.email, role: Role.STUDENT }, { secret: process.env.JWT_ACCESS_SECRET || 'test_secret' });
  }
});
