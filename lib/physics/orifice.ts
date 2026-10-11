import type { OrificeShape, SimulationParameters, TheoreticalFlow } from "@/types/simulation";

export function orificeArea(shape: OrificeShape, width: number, height: number): number {
  if (height <= 0 || width <= 0) return 0;
  if (shape === "circular") return (Math.PI * height * height) / 4;
  return width * height;
}

export function hydraulicDiameter(shape: OrificeShape, width: number, height: number): { value: number; note: string } {
  if (height <= 0) return { value: 0, note: "開口高さが0のため水力直径を定義できません。" };
  if (shape === "circular") {
    return {
      value: height,
      note: "代表長さは円形開口の直径です。レイノルズ数・フルード数・ウェーバー数で共通に使います。",
    };
  }
  const dh = (2 * width * height) / (width + height);
  return {
    value: dh,
    note: "代表長さは長方形の水力直径 Dh = 2wh/(w+h) です。2次元スリットでは開口高さの2倍を使う定義もあります。",
  };
}

export function openingSpan(shape: OrificeShape, height: number): number {
  return height;
}

export function theoreticalOrificeFlow(
  params: Pick<
    SimulationParameters,
    "orificeShape" | "orificeWidth" | "orificeHeight" | "dischargeCoefficient" | "gravity" | "damHeight"
  >,
  waterLevel: number,
  orificeElevation: number,
): TheoreticalFlow {
  const half = Math.max(0, params.orificeHeight) / 2;
  let elevation = orificeElevation;
  let bottom = elevation - half;
  let top = elevation + half;
  if (params.orificeHeight > 0 && params.damHeight > 0) {
    if (bottom < 0) {
      bottom = 0;
      top = Math.min(params.damHeight, params.orificeHeight);
      elevation = (bottom + top) / 2;
    }
    if (top > params.damHeight) {
      top = params.damHeight;
      bottom = Math.max(0, top - params.orificeHeight);
      elevation = (bottom + top) / 2;
    }
  }

  const fullHeight = Math.max(0, top - bottom);
  if (fullHeight <= 0 || waterLevel <= bottom) {
    return {
      waterLevel,
      orificeElevation: elevation,
      orificeBottom: bottom,
      orificeTop: top,
      centroidDepth: 0,
      submergedHeight: 0,
      area: 0,
      partial: false,
      dry: true,
      theoreticalVelocity: 0,
      dischargeVelocity: 0,
      theoreticalDischarge: 0,
    };
  }

  const partial = waterLevel < top;
  const submergedHeight = partial ? waterLevel - bottom : fullHeight;
  const centroid = partial ? bottom + submergedHeight / 2 : elevation;
  const centroidDepth = Math.max(0, waterLevel - centroid);
  const fullArea = orificeArea(params.orificeShape, params.orificeWidth, params.orificeHeight);
  const area = partial ? fullArea * (submergedHeight / Math.max(params.orificeHeight, 1e-9)) : fullArea;
  const theoreticalVelocity = centroidDepth > 0 ? Math.sqrt(2 * params.gravity * centroidDepth) : 0;
  const cd = params.dischargeCoefficient;
  const dischargeVelocity = cd * theoreticalVelocity;
  const theoreticalDischarge = cd * area * theoreticalVelocity;

  return {
    waterLevel,
    orificeElevation: elevation,
    orificeBottom: bottom,
    orificeTop: top,
    centroidDepth,
    submergedHeight,
    area,
    partial,
    dry: false,
    theoreticalVelocity,
    dischargeVelocity,
    theoreticalDischarge,
  };
}
