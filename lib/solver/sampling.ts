export function bilinearClamp(
  field: Float64Array,
  stride: number,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  if (width <= 0 || height <= 0) return 0;
  if (width === 1 && height === 1) return field[0] ?? 0;
  const maxX = Math.max(0, width - 1);
  const maxY = Math.max(0, height - 1);
  const xc = Math.min(maxX, Math.max(0, x));
  const yc = Math.min(maxY, Math.max(0, y));
  const x0 = Math.min(maxX, Math.floor(xc));
  const y0 = Math.min(maxY, Math.floor(yc));
  const x1 = Math.min(maxX, x0 + 1);
  const y1 = Math.min(maxY, y0 + 1);
  const tx = xc - x0;
  const ty = yc - y0;
  const at = (i: number, j: number) => field[i + j * stride] ?? 0;
  const v00 = at(x0, y0);
  const v10 = at(x1, y0);
  const v01 = at(x0, y1);
  const v11 = at(x1, y1);
  return (1 - tx) * (1 - ty) * v00 + tx * (1 - ty) * v10 + (1 - tx) * ty * v01 + tx * ty * v11;
}
