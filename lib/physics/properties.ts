export interface WaterProperties {
  temperature: number;
  density: number;
  dynamicViscosity: number;
  surfaceTension: number;
  vaporPressure: number;
}

const WATER_TABLE: WaterProperties[] = [
  { temperature: 0, density: 999.8, dynamicViscosity: 1.792e-3, surfaceTension: 0.0756, vaporPressure: 611 },
  { temperature: 10, density: 999.7, dynamicViscosity: 1.307e-3, surfaceTension: 0.0742, vaporPressure: 1228 },
  { temperature: 20, density: 998.2, dynamicViscosity: 1.002e-3, surfaceTension: 0.07275, vaporPressure: 2339 },
  { temperature: 30, density: 995.7, dynamicViscosity: 0.797e-3, surfaceTension: 0.0712, vaporPressure: 4246 },
  { temperature: 40, density: 992.2, dynamicViscosity: 0.653e-3, surfaceTension: 0.0696, vaporPressure: 7381 },
  { temperature: 60, density: 983.2, dynamicViscosity: 0.467e-3, surfaceTension: 0.0662, vaporPressure: 19940 },
  { temperature: 80, density: 971.8, dynamicViscosity: 0.355e-3, surfaceTension: 0.0626, vaporPressure: 47373 },
  { temperature: 100, density: 958.4, dynamicViscosity: 0.282e-3, surfaceTension: 0.0589, vaporPressure: 101325 },
];

export function kinematicViscosity(dynamicViscosity: number, density: number): number {
  if (density <= 0) return Number.NaN;
  return dynamicViscosity / density;
}

export function dynamicViscosityFromKinematic(kinematic: number, density: number): number {
  return kinematic * density;
}

export function waterPropertiesAtTemperature(temperature: number): WaterProperties {
  const t = Math.min(100, Math.max(0, temperature));
  let upper = WATER_TABLE[WATER_TABLE.length - 1];
  let lower = WATER_TABLE[0];
  for (let i = 0; i < WATER_TABLE.length - 1; i += 1) {
    if (t >= WATER_TABLE[i].temperature && t <= WATER_TABLE[i + 1].temperature) {
      lower = WATER_TABLE[i];
      upper = WATER_TABLE[i + 1];
      break;
    }
  }
  const span = upper.temperature - lower.temperature;
  const f = span === 0 ? 0 : (t - lower.temperature) / span;
  const lerp = (a: number, b: number) => a + (b - a) * f;
  return {
    temperature: t,
    density: lerp(lower.density, upper.density),
    dynamicViscosity: lerp(lower.dynamicViscosity, upper.dynamicViscosity),
    surfaceTension: lerp(lower.surfaceTension, upper.surfaceTension),
    vaporPressure: lerp(lower.vaporPressure, upper.vaporPressure),
  };
}
