export interface DimensionlessInput {
  density: number;
  dynamicViscosity: number;
  gravity: number;
  surfaceTension: number;
  velocity: number;
  length: number;
  pressureDifference: number;
  absolutePressure: number;
  vaporPressure: number;
}

export interface DimensionlessNumbers {
  reynolds: number;
  froude: number;
  weber: number;
  euler: number;
  cavitation: number | null;
}

export function reynoldsNumber(velocity: number, length: number, kinematicViscosity: number): number {
  if (kinematicViscosity <= 0 || length <= 0) return Number.NaN;
  return (Math.abs(velocity) * length) / kinematicViscosity;
}

export function froudeNumber(velocity: number, gravity: number, length: number): number {
  if (gravity <= 0 || length <= 0) return Number.NaN;
  return Math.abs(velocity) / Math.sqrt(gravity * length);
}

export function weberNumber(density: number, velocity: number, length: number, surfaceTension: number): number {
  if (surfaceTension <= 0 || length <= 0) return Number.NaN;
  return (density * velocity * velocity * length) / surfaceTension;
}

export function eulerNumber(pressureDifference: number, density: number, velocity: number): number {
  const denom = density * velocity * velocity;
  if (denom <= 0) return Number.NaN;
  return pressureDifference / denom;
}

export function cavitationNumber(
  absolutePressure: number,
  vaporPressure: number,
  density: number,
  velocity: number,
): number | null {
  const denom = 0.5 * density * velocity * velocity;
  if (denom <= 0) return null;
  return (absolutePressure - vaporPressure) / denom;
}

export function flowRegimeNote(reynolds: number): string {
  if (!Number.isFinite(reynolds)) return "レイノルズ数を計算できません。";
  if (reynolds < 500) {
    return "低レイノルズ数域です。粘性の影響が大きい流れですが、この値だけで層流とは断定しません。";
  }
  if (reynolds < 10000) {
    return "中間的なレイノルズ数です。遷移や不安定性は起こり得ますが、オリフィス噴流では形状・入口乱れ・自由せん断層にも依存します。";
  }
  return "高レイノルズ数域です。慣性の影響が大きい流れですが、この格子が乱流構造を解像していることは意味しません。";
}

export function dimensionlessNumbers(input: DimensionlessInput): DimensionlessNumbers {
  const nu = input.density > 0 ? input.dynamicViscosity / input.density : Number.NaN;
  return {
    reynolds: reynoldsNumber(input.velocity, input.length, nu),
    froude: froudeNumber(input.velocity, input.gravity, input.length),
    weber: weberNumber(input.density, input.velocity, input.length, input.surfaceTension),
    euler: eulerNumber(input.pressureDifference, input.density, input.velocity),
    cavitation: cavitationNumber(input.absolutePressure, input.vaporPressure, input.density, input.velocity),
  };
}
