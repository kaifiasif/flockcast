import { encode } from 'uqr';

/** Draws a QR code as SVG squares, so no markup string is injected into the page. */
export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const { data, size } = encode(value, { ecc: 'M', border: 2 });
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className={className} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="white" />
      {data.flatMap((row, y) => row.map((on, x) => (on ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="black" /> : null)))}
    </svg>
  );
}
