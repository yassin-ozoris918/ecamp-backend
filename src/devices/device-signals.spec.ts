import { cleanSignals, compareSignals, describeDevice, MATCH_PROBABLE, MATCH_SAME, type DeviceSignals } from './device-signals';
import { cleanPublicJwk, keyThumbprint } from './device-proof';

const base: DeviceSignals = { v: 1, os: 'Windows', platform: 'Windows', mobile: false, cores: 8, memory: 8, screen: '1920x1080', colorDepth: 24, touch: 0, tz: 'Africa/Cairo', gpu: 'Intel Iris Xe Graphics', gpuVendor: 'intel', model: null };

describe('compareSignals', () => {
  it('same machine in another browser stays a match despite expected differences', () => {
    expect(compareSignals(base, { ...base }).score).toBe(1);
    expect(compareSignals(base, { ...base, screen: '2560x1440' }).score).toBeGreaterThanOrEqual(MATCH_SAME); // external monitor
    expect(compareSignals(base, { ...base, memory: null }).score).toBeGreaterThanOrEqual(MATCH_SAME); // Firefox/Safari hide memory
    expect(compareSignals(base, { ...base, cores: 4 }).score).toBeGreaterThanOrEqual(MATCH_SAME); // Brave randomises
    expect(compareSignals(base, { ...base, gpu: 'Intel UHD Graphics' }).score).toBeGreaterThanOrEqual(MATCH_SAME); // other chip, same vendor
    expect(compareSignals(base, { ...base, gpu: '', gpuVendor: '' }).score).toBeGreaterThanOrEqual(MATCH_SAME); // WebGL blocked
    expect(compareSignals(base, { ...base, gpu: 'NVIDIA GeForce RTX 3050', gpuVendor: 'nvidia' }).score).toBeGreaterThanOrEqual(MATCH_PROBABLE); // dual-GPU laptop
  });

  it('a different machine does not match', () => {
    expect(compareSignals(base, { ...base, os: 'macOS' }).hardMismatch).toBe('os');
    const other = { ...base, cores: 16, screen: '1366x768', gpu: 'NVIDIA GeForce RTX 3060', gpuVendor: 'nvidia', tz: 'Europe/London' };
    expect(compareSignals(base, other).score).toBeLessThan(MATCH_PROBABLE);
    const phoneA = { ...base, os: 'Android', mobile: true, model: 'SM-A525F' };
    expect(compareSignals(phoneA, { ...phoneA, model: 'SM-S918B' }).hardMismatch).toBe('model');
    expect(compareSignals(phoneA, { ...phoneA, mobile: false }).hardMismatch).toBe('form_factor');
  });
});

describe('cleanSignals / describeDevice', () => {
  it('cleans untrusted input', () => {
    expect(cleanSignals(null)).toBeNull();
    expect(cleanSignals({ os: '' })).toBeNull();
    const c = cleanSignals({ os: 'Windows', cores: '9999', screen: '1920x1080; drop table', gpu: 'x'.repeat(500), mobile: 'yes' })!;
    expect(c.cores).toBe(512);
    expect(c.screen).toBe('');
    expect(c.gpu.length).toBe(120);
    expect(c.mobile).toBe(false);
  });
  it('names devices in plain words', () => {
    expect(describeDevice(base).label).toBe('Windows computer · Intel Iris Xe Graphics');
    expect(describeDevice({ ...base, os: 'Android', mobile: true, model: 'SM-A525F' }).label).toBe('Android phone · SM-A525F');
    expect(describeDevice({ ...base, os: 'iOS', mobile: true, gpu: 'Apple GPU' }, 'iPhone').label).toBe('iPhone');
    expect(describeDevice(null, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)').kind).toBe('mac');
  });
  it('accepts only P-256 public keys and gives them a stable id', () => {
    expect(cleanPublicJwk({ kty: 'RSA', n: 'x', e: 'AQAB' })).toBeNull();
    const k = { kty: 'EC', crv: 'P-256', x: 'f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU', y: 'x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0', d: 'secret' };
    const clean = cleanPublicJwk(k)!;
    expect(clean).not.toHaveProperty('d');
    expect(keyThumbprint(clean)).toBe(keyThumbprint({ ...clean }));
  });
});
