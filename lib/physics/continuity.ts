export function stepWaterLevel(
  waterLevel: number,
  reservoirArea: number,
  inflow: number,
  outflow: number,
  dt: number,
): number {
  if (reservoirArea <= 0) return waterLevel;
  return waterLevel + (dt * (inflow - outflow)) / reservoirArea;
}

export function reservoirArea(length: number, width: number): number {
  return Math.max(0, length) * Math.max(0, width);
}
