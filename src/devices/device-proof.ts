import { createHash, createPublicKey, verify, type JsonWebKey } from 'crypto';

/**
 * Proof that a request comes from a browser holding a specific private key (ECDSA P-256, created with
 * WebCrypto as non-exportable). The browser signs "purpose|timestamp|nonce"; we check the signature,
 * that the timestamp is recent and that the nonce wasn't used before.
 */
export interface DeviceProof {
  ts: number;
  nonce: string;
  sig: string;
}

const MAX_SKEW_MS = 5 * 60 * 1000;
const usedNonces = new Map<string, number>();

function rememberNonce(nonce: string): boolean {
  const now = Date.now();
  if (usedNonces.size > 5000) {
    for (const [n, exp] of usedNonces) if (exp < now) usedNonces.delete(n);
  }
  if (usedNonces.has(nonce)) return false;
  usedNonces.set(nonce, now + MAX_SKEW_MS * 2);
  return true;
}

/** Only P-256 public keys with x and y, nothing else. */
export function cleanPublicJwk(raw: unknown): { kty: 'EC'; crv: 'P-256'; x: string; y: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const k = raw as Record<string, unknown>;
  const b64 = /^[A-Za-z0-9_-]{40,60}$/;
  if (k.kty !== 'EC' || k.crv !== 'P-256' || typeof k.x !== 'string' || typeof k.y !== 'string' || !b64.test(k.x) || !b64.test(k.y)) return null;
  return { kty: 'EC', crv: 'P-256', x: k.x, y: k.y };
}

/** RFC 7638 thumbprint: a stable id for a public key. */
export function keyThumbprint(jwk: { crv: string; kty: string; x: string; y: string }): string {
  return createHash('sha256').update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })).digest('base64url');
}

export function verifyDeviceProof(jwk: { kty: string; crv: string; x: string; y: string }, proof: unknown, purpose: string): boolean {
  if (!proof || typeof proof !== 'object') return false;
  const p = proof as Partial<DeviceProof>;
  if (typeof p.ts !== 'number' || typeof p.nonce !== 'string' || typeof p.sig !== 'string') return false;
  if (p.nonce.length < 16 || p.nonce.length > 64 || p.sig.length > 200) return false;
  if (Math.abs(Date.now() - p.ts) > MAX_SKEW_MS) return false;
  try {
    const key = createPublicKey({ key: jwk as JsonWebKey, format: 'jwk' });
    const ok = verify('sha256', Buffer.from(`${purpose}|${p.ts}|${p.nonce}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(p.sig, 'base64url'));
    return ok && rememberNonce(p.nonce);
  } catch {
    return false;
  }
}
