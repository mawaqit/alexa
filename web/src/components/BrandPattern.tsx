// Purely decorative Islamic geometric star tessellation (an 8-point
// "khatam" construction), used behind the Landing screen's card. Plain
// inline SVG, not a library asset and not standing in for real photography
// — a culturally-grounded, honest alternative to a generic gradient blob.
// `currentColor` lets .landing-pattern (global.css) tint and fade it per
// theme without a second copy of the markup.
const TILE = 72;

function StarTile({ x, y }: { x: number; y: number }) {
  const c = TILE / 2;
  const r1 = TILE * 0.46;
  const r2 = TILE * 0.19;
  const points = Array.from({ length: 16 }, (_, i) => {
    const radius = i % 2 === 0 ? r1 : r2;
    const angle = (Math.PI / 8) * i - Math.PI / 2;
    return `${c + radius * Math.cos(angle)},${c + radius * Math.sin(angle)}`;
  }).join(" ");

  return (
    <polygon
      points={points}
      transform={`translate(${x} ${y})`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
    />
  );
}

export function BrandPattern() {
  const cols = 8;
  const rows = 12;
  const tiles = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      tiles.push({ x: col * TILE, y: row * TILE, key: `${row}-${col}` });
    }
  }

  return (
    <svg
      className="landing-pattern"
      viewBox={`0 0 ${cols * TILE} ${rows * TILE}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      {tiles.map(({ x, y, key }) => (
        <StarTile key={key} x={x} y={y} />
      ))}
    </svg>
  );
}
