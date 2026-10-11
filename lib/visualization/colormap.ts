export interface Rgb {
  r: number;
  g: number;
  b: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) };
}

const SPEED_STOPS: Rgb[] = [
  { r: 18, g: 58, b: 120 },
  { r: 32, g: 112, b: 214 },
  { r: 46, g: 196, b: 186 },
  { r: 240, g: 196, b: 74 },
  { r: 226, g: 74, b: 58 },
];

const PRESSURE_STOPS: Rgb[] = [
  { r: 28, g: 22, b: 64 },
  { r: 64, g: 78, b: 168 },
  { r: 126, g: 196, b: 214 },
  { r: 236, g: 236, b: 230 },
];

export function sampleStops(stops: Rgb[], t: number): Rgb {
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(x));
  return mix(stops[index], stops[index + 1], x - index);
}

export function speedColor(t: number): Rgb {
  return sampleStops(SPEED_STOPS, t);
}

export function pressureColor(t: number): Rgb {
  return sampleStops(PRESSURE_STOPS, t);
}

export function divergingColor(t: number): Rgb {
  const x = Math.min(1, Math.max(-1, t));
  const negative: Rgb = { r: 58, g: 118, b: 214 };
  const zero: Rgb = { r: 236, g: 240, b: 244 };
  const positive: Rgb = { r: 214, g: 72, b: 64 };
  if (x < 0) return mix(zero, negative, -x);
  return mix(zero, positive, x);
}

export function cssColor(color: Rgb, alpha = 1): string {
  return `rgba(${color.r.toFixed(0)}, ${color.g.toFixed(0)}, ${color.b.toFixed(0)}, ${alpha})`;
}
