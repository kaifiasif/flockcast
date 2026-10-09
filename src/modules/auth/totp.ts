import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Time-based one-time codes (RFC 6238): HMAC-SHA1, 30-second steps, 6 digits. This is what
 * Google Authenticator, 1Password, Authy and every other authenticator app speak.
 */
const STEP_S = 30;
const DIGITS = 6;
/** Accept the previous and next step too, so a phone clock a little off still works. */
const DRIFT_STEPS = 1;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const index = BASE32.indexOf(ch);
    if (index < 0) throw new Error('Not a base32 secret.');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160 random bits, the size RFC 4226 recommends for HMAC-SHA1. */
export const newTotpSecret = () => base32Encode(randomBytes(20));

export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / STEP_S);

export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = (mac[mac.length - 1] as number) & 0x0f;
  const binary = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

/** The step the code belongs to, or null when it matches none in the allowed window. */
export function verifyTotp(secret: string, code: string, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const given = Buffer.from(code);
  const step = currentStep(now);
  for (let delta = -DRIFT_STEPS; delta <= DRIFT_STEPS; delta++) {
    if (timingSafeEqual(Buffer.from(totpCode(secret, step + delta)), given)) return step + delta;
  }
  return null;
}

/** The link authenticator apps read from the QR code. */
export function otpauthUri(secret: string, account: string, issuer = 'Flockcast'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(STEP_S) });
  return `otpauth://totp/${label}?${params}`;
}
