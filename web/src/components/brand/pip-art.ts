/**
 * Pip, the Flockcast mascot: a plush coral bird, drawn as a die-cut sticker. Each variant is one kind
 * of follower in a rehearsal (the skeptic in glasses, the fan in a party hat, the newcomer in a beanie)
 * plus a few for app states (sleepy while loading, a bandage when something breaks).
 *
 * The art is static markup with no user input in it, so the component renders it as SVG markup, and
 * `npm run stickers` writes the same art to standalone SVG and PNG sticker files.
 */
export type PipVariant = 'plain' | 'skeptic' | 'fan' | 'newcomer' | 'listener' | 'caster' | 'analyst' | 'sleepy' | 'oops';

interface Parts {
  /** drawn over the body, inside the sticker edge: hats, glasses, props */
  front?: string;
  /** replaces the default face */
  face?: string;
  /** floats outside the sticker edge: confetti, z's */
  loose?: string;
}

const INK = '#1C1917';
const eyes = `<ellipse cx="48" cy="46" rx="4.2" ry="5" fill="${INK}"/><ellipse cx="72" cy="46" rx="4.2" ry="5" fill="${INK}"/><circle cx="49.4" cy="44.2" r="1.5" fill="#fff"/><circle cx="73.4" cy="44.2" r="1.5" fill="#fff"/>`;
const beak = `<path d="M55 53 q5 -3 10 0 q-5 8 -10 0z" fill="#F2B15F"/>`;
const cheeks = `<ellipse cx="40" cy="55" rx="5" ry="3" fill="#F7A39B" opacity="0.8"/><ellipse cx="80" cy="55" rx="5" ry="3" fill="#F7A39B" opacity="0.8"/>`;
const FACE = eyes + beak + cheeks;

export const PIP_VARIANTS: Record<PipVariant, Parts & { label: string; blurb: string }> = {
  plain: { label: 'Pip', blurb: 'Says hello.' },
  skeptic: {
    label: 'The skeptic',
    blurb: 'Asks where the number came from.',
    front: `<g fill="none" stroke="${INK}" stroke-width="2.4"><circle cx="48" cy="46" r="8.5" fill="#fff" fill-opacity=".25"/><circle cx="72" cy="46" r="8.5" fill="#fff" fill-opacity=".25"/><path d="M56.5 46 h7"/></g><path d="M40 33 q8 -5 15 0" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
  },
  fan: {
    label: 'The fan',
    blurb: 'Reposts before finishing the thread.',
    front: `<g transform="rotate(12 62 20)"><path d="M50 28 L61 4 L72 28 q-11 4 -22 0z" fill="#F2B15F"/><path d="M53.5 20 q7.5 2 15 0 M57 12 q4 1 8 0" stroke="#E4544B" stroke-width="2.4" fill="none"/><circle cx="61" cy="4" r="3.6" fill="#FBFAF9"/></g>`,
    loose: `<circle cx="10" cy="26" r="2.8" fill="#F2B15F"/><circle cx="110" cy="34" r="2.6" fill="#4F7A5A"/><circle cx="14" cy="44" r="2.4" fill="#E4544B"/><circle cx="108" cy="16" r="2.4" fill="${INK}"/>`,
  },
  newcomer: {
    label: 'The newcomer',
    blurb: 'Found you today. Needs the context.',
    front: `<path d="M33 34 c0 -22 54 -22 54 0z" fill="#4F7A5A"/><path d="M44 18 q2 8 0 14 M54 13 q1 10 0 19 M66 13 q-1 10 0 19 M76 18 q-2 8 0 14" stroke="#3E6449" stroke-width="1.6" fill="none"/><rect x="31" y="30" width="58" height="9" rx="4.5" fill="#3E6449"/><circle cx="60" cy="9" r="5.5" fill="#FBFAF9"/>`,
  },
  listener: {
    label: 'The lurker',
    blurb: 'Reads everything. Rarely replies.',
    front: `<path d="M26 50 q0 -40 34 -40 q34 0 34 40" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><rect x="18" y="44" width="12" height="20" rx="6" fill="${INK}"/><rect x="90" y="44" width="12" height="20" rx="6" fill="${INK}"/><rect x="21" y="48" width="6" height="12" rx="3" fill="#E4544B"/><rect x="93" y="48" width="6" height="12" rx="3" fill="#E4544B"/>`,
  },
  caster: {
    label: 'The amplifier',
    blurb: 'Quote-posts with a hot take.',
    front: `<g transform="rotate(-18 96 70)"><path d="M86 64 l20 -11 v30 l-20 -11z" fill="#F2B15F"/><rect x="80" y="63" width="8" height="10" rx="2" fill="${INK}"/></g>`,
    loose: `<path d="M110 50 q6 10 0 20 M115 46 q9 14 0 28" stroke="#C9443A" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
  },
  analyst: {
    label: 'The analyst',
    blurb: 'Checks every claim twice.',
    front: `<circle cx="94" cy="80" r="11" fill="#fff" fill-opacity=".55" stroke="${INK}" stroke-width="3.5"/><path d="M86 88 l-10 12" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`,
  },
  sleepy: {
    label: 'Sleepy Pip',
    blurb: 'Waiting for the crowd to wake up.',
    front: `<path d="M34 32 c2 -20 30 -26 46 -14 c10 8 16 20 18 30 c-6 -8 -12 -12 -18 -12 c-14 -4 -30 -4 -46 -4z" fill="#79716B"/><circle cx="98" cy="50" r="5" fill="#FBFAF9"/><rect x="31" y="29" width="54" height="8" rx="4" fill="#FBFAF9"/>`,
    face: `<path d="M43 47 q5 3 10 0 M67 47 q5 3 10 0" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round"/>${beak}${cheeks}`,
    loose: `<path d="M92 14 h7 l-7 8 h7 M104 4 h5 l-5 6 h5" stroke="#79716B" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  oops: {
    label: 'Oops Pip',
    blurb: 'Something broke.',
    front: `<g transform="rotate(-25 74 34)"><rect x="62" y="29" width="26" height="10" rx="5" fill="#F2D6B3"/><circle cx="72" cy="34" r="1" fill="#C9A47A"/><circle cx="78" cy="34" r="1" fill="#C9A47A"/></g>`,
    face: `<path d="M44 43 l8 6 M52 43 l-8 6 M68 43 l8 6 M76 43 l-8 6" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/><path d="M55 55 q5 -3 10 0 q-5 6 -10 0z" fill="#F2B15F"/>${cheeks}`,
  },
};

export const PIP_VIEWBOX = '-8 -10 136 136';

/** Inner SVG markup for one sticker. `id` keeps gradient and filter ids unique when several share a page. */
export function pipMarkup(id: string, variant: PipVariant): string {
  const v = PIP_VARIANTS[variant];
  return `<defs>
<radialGradient id="${id}-fur" cx="38%" cy="30%" r="75%"><stop offset="0" stop-color="#F27A70"/><stop offset="0.55" stop-color="#E4544B"/><stop offset="1" stop-color="#C9443A"/></radialGradient>
<radialGradient id="${id}-belly" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="#FBE9E6"/><stop offset="1" stop-color="#F5CFC8"/></radialGradient>
<filter id="${id}-edge" x="-20%" y="-20%" width="140%" height="140%">
<feMorphology in="SourceAlpha" operator="dilate" radius="3" result="d"/><feGaussianBlur in="d" stdDeviation="1.6" result="db"/>
<feComponentTransfer in="db" result="grow"><feFuncA type="discrete" tableValues="0 1 1 1 1 1 1 1"/></feComponentTransfer>
<feFlood flood-color="#fff"/><feComposite in2="grow" operator="in" result="edge"/>
<feGaussianBlur in="grow" stdDeviation="2.5" result="blur"/><feOffset in="blur" dy="3" result="off"/>
<feFlood flood-color="${INK}" flood-opacity="0.16"/><feComposite in2="off" operator="in" result="shadow"/>
<feMerge><feMergeNode in="shadow"/><feMergeNode in="edge"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>
</defs>
<g filter="url(#${id}-edge)">
<path d="M46 100 q-2 7 -7 8 M46 100 q0 8 2 9 M46 100 q3 7 7 7 M72 100 q-3 7 -7 7 M72 100 q0 8 -2 9 M72 100 q2 7 7 8" stroke="#C9443A" stroke-width="3.2" fill="none" stroke-linecap="round"/>
<path d="M90 78 q16 -4 20 -16 q-6 14 -2 22 q-8 -2 -18 2z" fill="#C9443A"/>
<path d="M60 22 c22 0 36 18 36 42 c0 24 -16 40 -36 40 c-20 0 -36 -16 -36 -40 c0 -24 14 -42 36 -42z" fill="url(#${id}-fur)"/>
<path d="M54 24 q-2 -12 6 -14 q-4 6 2 12 q2 -10 10 -9 q-6 4 -4 11z" fill="#E4544B"/>
<path d="M60 58 c14 0 22 10 22 22 c0 12 -10 19 -22 19 c-12 0 -22 -7 -22 -19 c0 -12 8 -22 22 -22z" fill="url(#${id}-belly)"/>
<path d="M60 61 c12 0 19 8 19 19 c0 10 -8 16 -19 16 c-11 0 -19 -6 -19 -16 c0 -11 7 -19 19 -19z" fill="none" stroke="#E9A69E" stroke-width="1.1" stroke-dasharray="2.4 2.4"/>
<path d="M26 62 q-10 8 -6 22 q8 -4 12 -14z M94 62 q10 8 6 22 q-8 -4 -12 -14z" fill="#D04A41"/>
${v.face ?? FACE}
${v.front ?? ''}
</g>
${v.loose ?? ''}`;
}

/** A standalone sticker file. */
export const pipFile = (variant: PipVariant, size = 512) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${PIP_VIEWBOX}" width="${size}" height="${size}">${pipMarkup(`pip-${variant}`, variant)}</svg>\n`;
