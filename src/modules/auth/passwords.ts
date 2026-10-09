import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Password hashing with scrypt from node:crypto: memory-hard, no native dependency to build.
 * Parameters follow OWASP's scrypt guidance (N=2^15, r=8, p=3, about 32 MiB per hash) and are
 * stored with every hash, so they can be raised later without breaking existing passwords.
 *
 * Stored form: scrypt$<N>$<r>$<p>$<salt base64>$<hash base64>
 */
const PARAMS = { N: 2 ** 15, r: 8, p: 3 };
const KEY_LENGTH = 32;

const derive = (password: string, salt: Buffer, opts: ScryptOptions & { N: number; r: number }) =>
  new Promise<Buffer>((resolve, reject) => {
    // maxmem must cover 128 * N * r bytes, plus headroom
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, { ...opts, maxmem: 256 * opts.N * opts.r }, (err, key) => (err ? reject(err) : resolve(key)));
  });

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await derive(password, Buffer.from(salt, 'base64'), { N: Number(n), r: Number(r), p: Number(p) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/**
 * Checked when an email has no account, so "no such account" takes as long as "wrong password"
 * and response timing does not reveal who has signed up.
 */
let decoy: Promise<string> | null = null;
export async function burnPasswordCheck(password: string): Promise<void> {
  decoy ??= hashPassword(randomBytes(16).toString('hex'));
  await verifyPassword(password, await decoy);
}
