/**
 * The hero's one background pattern: hairlines bending together like a murmuration's flight path,
 * with a few coral dots riding them. Deterministic, so it renders the same on every load.
 */
const LINES = 22;
const paths = Array.from({ length: LINES }, (_, i) => {
  const t = i / (LINES - 1);
  const y0 = 120 + t * 520;
  const bend = 180 * Math.sin(t * Math.PI);
  return `M-40 ${y0.toFixed(1)} C 320 ${(y0 - 260 + bend).toFixed(1)}, 760 ${(y0 + 220 - bend).toFixed(1)}, 1480 ${(y0 - 180 + t * 120).toFixed(1)}`;
});
const DOTS = [
  [1040, 168, 2.2],
  [1180, 330, 2.6],
  [1296, 296, 1.6],
];

export function Murmuration({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 1440 760" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="murmur-fade" x1="0" x2="1">
          <stop offset="0" stopColor="#E7E6E5" stopOpacity="0" />
          <stop offset="0.25" stopColor="#E7E6E5" />
          <stop offset="0.8" stopColor="#E7E6E5" />
          <stop offset="1" stopColor="#E7E6E5" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#murmur-fade)" strokeWidth="1">
        {paths.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <g fill="#E4544B" opacity="0.55">
        {DOTS.map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} />
        ))}
      </g>
    </svg>
  );
}
