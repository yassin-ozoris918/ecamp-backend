import { createHash } from 'crypto';

/**
 * Hardware details a browser reports about its machine. None of them is secret or unique on its own;
 * together they recognise "the same machine" across browsers. Values come from the client, so they
 * are cleaned and length-limited here.
 */
export interface DeviceSignals {
  v: 1;
  os: string;
  platform: string;
  mobile: boolean;
  cores: number;
  memory: number | null;
  screen: string;
  colorDepth: number;
  touch: number;
  tz: string;
  gpu: string;
  gpuVendor: string;
  model: string | null;
}

// eslint-disable-next-line no-control-regex
const str = (v: unknown, max = 80) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, '').trim().slice(0, max) : '');
const num = (v: unknown, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : 0;
};

/** Returns cleaned signals, or null when the payload isn't usable. */
export function cleanSignals(raw: unknown): DeviceSignals | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const os = str(r.os, 20);
  if (!os) return null;
  const screen = /^\d{2,5}x\d{2,5}$/.test(str(r.screen, 12)) ? str(r.screen, 12) : '';
  const memory = r.memory === null || r.memory === undefined ? null : num(r.memory, 0, 1024);
  return {
    v: 1,
    os,
    platform: str(r.platform, 20),
    mobile: r.mobile === true,
    cores: num(r.cores, 0, 512),
    memory,
    screen,
    colorDepth: num(r.colorDepth, 0, 64),
    touch: num(r.touch, 0, 64),
    tz: str(r.tz, 60),
    gpu: str(r.gpu, 120),
    gpuVendor: str(r.gpuVendor, 20),
    model: str(r.model, 60) || null,
  };
}

export interface SignalComparison {
  /** 0..1 — how likely it's the same machine. */
  score: number;
  /** A difference that rules out "same machine" (other OS, phone vs computer, other phone model). */
  hardMismatch: string | null;
}

/**
 * Compares two sets of hardware details. Expected differences between browsers on one machine are
 * tolerated: screen size (external monitor, display scaling), graphics chip on dual-GPU laptops,
 * Brave's randomised CPU count, and browsers that hide memory or the graphics chip.
 */
export function compareSignals(a: DeviceSignals, b: DeviceSignals): SignalComparison {
  if (a.os !== b.os) return { score: 0, hardMismatch: 'os' };
  if (a.mobile !== b.mobile && (a.os === 'Android' || b.os === 'Android')) return { score: 0, hardMismatch: 'form_factor' };
  if (a.model && b.model && a.model.toLowerCase() !== b.model.toLowerCase()) return { score: 0, hardMismatch: 'model' };

  let got = 0;
  let max = 0;
  const add = (weight: number, credit: number) => {
    max += weight;
    got += weight * credit;
  };

  // Graphics chip: strongest everyday signal. Same chip = full, same vendor = partial (dual-GPU laptops).
  if (a.gpu && b.gpu) {
    const ga = a.gpu.toLowerCase();
    const gb = b.gpu.toLowerCase();
    add(0.3, ga === gb ? 1 : a.gpuVendor && a.gpuVendor === b.gpuVendor ? 0.5 : 0.25);
  }
  // CPU threads: Brave may report fewer, never more.
  if (a.cores && b.cores) add(0.2, a.cores === b.cores ? 1 : Math.abs(a.cores - b.cores) <= 2 || Math.min(a.cores, b.cores) <= 2 ? 0.5 : 0);
  if (a.tz && b.tz) add(0.15, a.tz === b.tz ? 1 : 0);
  if (a.screen && b.screen) add(0.15, a.screen === b.screen ? 1 : 0.4);
  add(0.1, a.touch === b.touch ? 1 : (a.touch > 0) === (b.touch > 0) ? 0.6 : 0);
  if (a.colorDepth && b.colorDepth) add(0.05, a.colorDepth === b.colorDepth ? 1 : 0.5);
  if (a.memory && b.memory) add(0.05, a.memory === b.memory ? 1 : 0.3);
  if (a.model && b.model) add(0.3, 1); // same phone model (different models were rejected above)

  return { score: max ? Math.round((got / max) * 100) / 100 : 0, hardMismatch: null };
}

/** Same-machine thresholds. */
export const MATCH_SAME = 0.8;
export const MATCH_PROBABLE = 0.62;

export interface DeviceDescription {
  label: string;
  kind: string;
  category: 'desktop' | 'mobile' | 'tablet' | 'unknown';
}

/** A readable name: "Windows computer · Intel Iris Xe Graphics", "Android phone · SM-A525F", "iPhone". */
export function describeDevice(signals: DeviceSignals | null, userAgent?: string | null): DeviceDescription {
  const ua = userAgent || '';
  const os = signals?.os || (/(iPhone|iPad|iPod)/.test(ua) ? 'iOS' : /Android/i.test(ua) ? 'Android' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'Unknown');
  const gpu = signals?.gpu && !/^(apple gpu|webkit webgl)$/i.test(signals.gpu) ? signals.gpu : '';
  const withDetail = (base: string, detail?: string | null) => (detail ? `${base} · ${detail}` : base);
  switch (os) {
    case 'Windows':
      return { label: withDetail('Windows computer', gpu), kind: 'windows', category: 'desktop' };
    case 'macOS':
      return { label: withDetail('Mac', gpu), kind: 'mac', category: 'desktop' };
    case 'Linux':
      return { label: withDetail('Linux computer', gpu), kind: 'linux', category: 'desktop' };
    case 'iOS':
      return /iPad/.test(ua) || (signals && !signals.mobile && signals.touch > 1 && /Macintosh/.test(ua))
        ? { label: 'iPad', kind: 'ipad', category: 'tablet' }
        : { label: 'iPhone', kind: 'iphone', category: 'mobile' };
    case 'Android': {
      const phone = signals ? signals.mobile : /Mobile/i.test(ua);
      return phone
        ? { label: withDetail('Android phone', signals?.model), kind: 'android_phone', category: 'mobile' }
        : { label: withDetail('Android tablet', signals?.model), kind: 'android_tablet', category: 'tablet' };
    }
    default:
      return { label: 'Unknown device', kind: 'unknown', category: 'unknown' };
  }
}

/** "Chrome", "Edge", "Firefox", "Safari", "Samsung Internet", "Opera", "Brave" … */
export function browserName(userAgent?: string | null): string {
  const ua = userAgent || '';
  if (/Edg\//.test(ua)) return 'Edge';
  if (/SamsungBrowser\//.test(ua)) return 'Samsung Internet';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (/Firefox\/|FxiOS\//.test(ua)) return 'Firefox';
  if (/Brave/.test(ua)) return 'Brave';
  if (/Chrome\/|CriOS\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Browser';
}

/** Hash of the stable hardware details, to spot the same machine on several accounts. */
export function hardwareHash(s: DeviceSignals): string {
  return createHash('sha256')
    .update([s.os, s.mobile ? 'm' : 'd', s.cores, s.screen, s.gpu.toLowerCase(), s.model ?? '', s.tz].join('|'))
    .digest('hex')
    .slice(0, 24);
}
