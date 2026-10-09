/** Writes Pip's stickers as standalone SVG files into public_static/stickers, served with the app. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { PIP_VARIANTS, pipFile, type PipVariant } from '../src/components/brand/pip-art.ts';

const out = new URL('../public_static/stickers/', import.meta.url);
mkdirSync(out, { recursive: true });
for (const v of Object.keys(PIP_VARIANTS) as PipVariant[]) writeFileSync(new URL(`pip-${v}.svg`, out), pipFile(v));
console.log(`wrote ${Object.keys(PIP_VARIANTS).length} stickers to ${out.pathname}`);
