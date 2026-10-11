import { LIMITS, WATER_20C } from "@/lib/physics/constants";
import type { SimulationParameters, ValidationMessage } from "@/types/simulation";
import { kinematicViscosity } from "@/lib/physics/properties";
import { hydraulicDiameter, theoreticalOrificeFlow } from "@/lib/physics/orifice";
import { reynoldsNumber } from "@/lib/physics/dimensionless";

export const DEFAULT_PARAMETERS: SimulationParameters = {
  waterDepth: 3,
  damHeight: 4,
  orificeWidth: 0.4,
  orificeHeight: 0.3,
  orificeDepth: 1.2,
  orificeShape: "rectangular",
  density: WATER_20C.density,
  dynamicViscosity: WATER_20C.dynamicViscosity,
  gravity: 9.80665,
  surfaceTension: WATER_20C.surfaceTension,
  atmosphericPressure: WATER_20C.atmosphericPressure,
  dischargeCoefficient: 0.62,
  inflowRate: 0,
  resolution: 40,
  timeStep: 0.004,
  particleCount: 700,
  turbulenceModel: "laminar",
  simulationSpeed: 1,
  solverKind: "navier-stokes",
  integrator: "rk2",
  pressureMethod: "sor",
  advectionScheme: "semi-lagrangian",
  domainMode: "free-discharge",
  reservoirLength: 5,
  reservoirWidth: 4,
  downstreamLength: 4,
  damThickness: 0.45,
  vaporPressure: WATER_20C.vaporPressure,
  particleLifetime: 12,
  smagorinskyConstant: 0.12,
  pressureIterations: 28,
};

export function cloneParameters(params: SimulationParameters): SimulationParameters {
  return { ...params };
}

export function validateParameters(params: SimulationParameters): ValidationMessage[] {
  const messages: ValidationMessage[] = [];
  const push = (level: ValidationMessage["level"], message: string) => messages.push({ level, message });

  if (params.density <= 0) push("error", "密度は正の値にしてください。");
  if (params.dynamicViscosity < 0) push("error", "粘性係数は0以上にしてください。");
  if (params.gravity <= 0) push("error", "重力加速度は正の値にしてください。");
  if (params.waterDepth <= 0) push("error", "初期水深は正の値にしてください。");
  if (params.damHeight <= 0) push("error", "ダム高さは正の値にしてください。");
  if (params.waterDepth > params.damHeight + 1e-9) {
    push("warning", "初期水深がダム高さを超えています。計算では越流させず、水位をダム高さで止めます。");
  }
  if (params.orificeHeight <= 0 || params.orificeWidth <= 0) {
    push("error", "オリフィスの幅と高さは正の値にしてください。");
  }
  if (params.orificeHeight > params.damHeight) {
    push("warning", "開口高さがダム高さを超えています。開口はダム壁の内側に収めます。");
  }
  const elevation = params.waterDepth - params.orificeDepth;
  const bottom = elevation - params.orificeHeight / 2;
  const top = elevation + params.orificeHeight / 2;
  if (bottom < -1e-6 || top > params.damHeight + 1e-6) {
    push("warning", "オリフィスがダム壁面の外にはみ出します。計算時に壁の内側へ移します。");
  }
  if (top <= 0 || bottom >= params.waterDepth) {
    push("warning", "オリフィスが水面より上にあり、理論流量は0になります。");
  } else if (top > params.waterDepth) {
    push("warning", "オリフィスが部分的に水没しています。理論流量は水没高さの重心水深による近似です。");
  }
  if (params.dischargeCoefficient <= 0 || params.dischargeCoefficient > 1) {
    push("warning", "流出係数は通常0より大きく1以下です。形状と流れの条件で変わる係数であり、普遍定数ではありません。");
  }
  if (params.surfaceTension < 0) push("error", "表面張力係数は0以上にしてください。");
  if (params.surfaceTension === 0) push("warning", "表面張力係数が0のためウェーバー数は定義できません。");
  push("info", "表面張力を変えても水面形状は変わりません。界面力は未実装で、ウェーバー数の表示だけが変わります。");
  if (params.atmosphericPressure < 0) push("error", "大気圧は0以上にしてください。");
  if (params.inflowRate < 0) push("warning", "流入量が負です。貯水池から水を抜く操作として扱います。");
  if (params.timeStep > 0.02) {
    push("warning", "時間刻みが大きいです。CFL条件と粘性安定条件により、実際の刻みは自動的に小さくなります。");
  }
  if (params.resolution > 72) {
    push("warning", "解像度が高いため、一般的なPCでは計算が間に合わず実効速度が落ちることがあります。");
  }
  if (params.turbulenceModel === "visual-only") {
    push("info", "乱流の簡易表示は粒子描画だけの擾乱です。速度場・圧力場には加えていません。");
  }
  if (params.turbulenceModel === "dns-attempt") {
    push("info", "高解像度モードでも2次元計算は3次元乱流の直接数値計算にはなりません。");
  }
  if (params.turbulenceModel === "smagorinsky") {
    push("info", "Smagorinsky型の渦粘性は2次元の近似モデルです。RANSでも、解像できた乱流でもありません。");
  }
  if (params.solverKind === "analytical") {
    push("info", "解析モードの速度場はトリチェリ流速と運動学的噴流です。ナビエ・ストークス方程式の解ではありません。");
  } else if (params.domainMode === "free-discharge") {
    push("info", "数値計算は貯水池とオリフィス内です。水面形状は変えません。壁の外の落下は、出口速度を初期値にした運動学的な粒子です。");
  } else {
    push("info", "下流チャンネルは単相流体で満たしています。大気中の自由噴流ではありません。");
  }

  const nu = kinematicViscosity(params.dynamicViscosity, params.density);
  const theory = theoreticalOrificeFlow(params, Math.min(params.waterDepth, params.damHeight), elevation);
  const dh = hydraulicDiameter(params.orificeShape, params.orificeWidth, params.orificeHeight);
  const re = reynoldsNumber(theory.theoreticalVelocity, dh.value, nu);
  const dx = params.damHeight / Math.max(params.resolution, 1);
  const gridRe = reynoldsNumber(theory.theoreticalVelocity, dx, nu);
  if (Number.isFinite(re) && Number.isFinite(gridRe) && gridRe > 20 && params.solverKind === "navier-stokes") {
    push(
      "warning",
      `格子レイノルズ数 UΔx/ν が約 ${gridRe.toFixed(0)} です。この粘性では格子が粗く、数値拡散が分子粘性より支配的になり得ます。`,
    );
  }

  return messages;
}

export function clampParameters(params: SimulationParameters): SimulationParameters {
  const next = { ...params };
  next.density = Math.max(0.01, next.density);
  next.dynamicViscosity = Math.max(0, next.dynamicViscosity);
  next.gravity = Math.max(0.01, next.gravity);
  next.damHeight = Math.max(0.2, next.damHeight);
  next.waterDepth = Math.min(Math.max(0.01, next.waterDepth), next.damHeight);
  next.orificeWidth = Math.max(0.01, next.orificeWidth);
  next.orificeHeight = Math.min(Math.max(0, next.orificeHeight), next.damHeight);
  next.dischargeCoefficient = Math.min(1.2, Math.max(0, next.dischargeCoefficient));
  next.surfaceTension = Math.max(0, next.surfaceTension);
  next.atmosphericPressure = Math.max(0, next.atmosphericPressure);
  next.vaporPressure = Math.max(0, next.vaporPressure);
  next.resolution = Math.round(Math.min(LIMITS.maxResolution, Math.max(LIMITS.minResolution, next.resolution)));
  next.timeStep = Math.min(LIMITS.maxTimeStep, Math.max(LIMITS.minTimeStep, next.timeStep));
  next.particleCount = Math.round(Math.min(LIMITS.maxParticles, Math.max(LIMITS.minParticles, next.particleCount)));
  next.particleLifetime = Math.max(0.2, next.particleLifetime);
  next.pressureIterations = Math.round(
    Math.min(LIMITS.maxPressureIterations, Math.max(LIMITS.minPressureIterations, next.pressureIterations)),
  );
  next.reservoirLength = Math.max(0.5, next.reservoirLength);
  next.reservoirWidth = Math.max(0.1, next.reservoirWidth);
  next.downstreamLength = Math.max(0.5, next.downstreamLength);
  next.damThickness = Math.max(0.05, next.damThickness);
  next.simulationSpeed = Math.min(8, Math.max(0.1, next.simulationSpeed));
  next.smagorinskyConstant = Math.min(0.4, Math.max(0, next.smagorinskyConstant));
  return next;
}
