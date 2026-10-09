import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import type { Context } from 'hono';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.yaml': 'text/yaml; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

/**
 * Serves the built web app from public/. Unknown paths fall back to index.html so client-side
 * routes load. Hashed files under /assets are cached forever; everything else is revalidated.
 */
export function serveWebApp(publicDir: string) {
  const root = normalize(publicDir + sep);
  return async (c: Context) => {
    const requested = c.req.path === '/' ? '/index.html' : decodeURIComponent(c.req.path);
    const file = normalize(join(root, requested));
    if (!file.startsWith(root)) return c.notFound();
    const data = await readFile(file).catch(() => null);
    if (!data) {
      const index = await readFile(join(root, 'index.html')).catch(() => null);
      return index ? c.body(index, 200, { 'content-type': MIME['.html'], 'cache-control': 'no-cache' }) : c.text('The web app has not been built. Run npm run build:web.', 503);
    }
    const cache = requested.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
    return c.body(data, 200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': cache });
  };
}
