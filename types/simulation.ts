export type OrificeShape = "circular" | "rectangular" | "horizontal-slit" | "vertical-slit";

export type SolverKind = "analytical" | "navier-stokes";

export type TurbulenceModel = "laminar" | "dns-attempt" | "smagorinsky" | "visual-only";

export type Integrator = "euler" | "rk2" | "rk4";

export type PressureMethod = "jacobi" | "gauss-seidel" | "sor";

export type AdvectionScheme = "upwind" | "semi-lagrangian";

export type DomainMode = "free-discharge" | "downstream-channel";

export type DisplayMode = "speed" | "u" | "v" | "pressure" | "vorticity";

export interface SimulationParameters {
  waterDepth: number;
  damHeight: number;
  orificeWidth: number;
  orificeHeight: number;
  orificeDepth: number;
  orificeShape: OrificeShape;
  density: number;
  dynamicViscosity: number;
  gravity: number;
  surfaceTension: number;
  atmosphericPressure: number;
  dischargeCoefficient: number;
  inflowRate: number;
  resolution: number;
  timeStep: number;
  particleCount: number;
  turbulenceModel: TurbulenceModel;
  simulationSpeed: number;
  solverKind: SolverKind;
  integrator: Integrator;
  pressureMethod: PressureMethod;
  advectionScheme: AdvectionScheme;
  domainMode: DomainMode;
  reservoirLength: number;
  reservoirWidth: number;
  downstreamLength: number;
  damThickness: number;
  vaporPressure: number;
  particleLifetime: number;
  smagorinskyConstant: number;
  pressureIterations: number;
}

export interface TheoreticalFlow {
  waterLevel: number;
  orificeElevation: number;
  orificeBottom: number;
  orificeTop: number;
  centroidDepth: number;
  submergedHeight: number;
  area: number;
  partial: boolean;
  dry: boolean;
  theoreticalVelocity: number;
  dischargeVelocity: number;
  theoreticalDischarge: number;
}

export interface Diagnostics {
  time: number;
  stepCount: number;
  computeMilliseconds: number;
  waterLevel: number;
  orificeCenterDepth: number;
  orificeElevation: number;
  orificeArea: number;
  submergedHeight: number;
  theoreticalVelocity: number;
  numericalMeanVelocity: number;
  theoreticalDischarge: number;
  numericalDischarge: number;
  meanPressure: number;
  maxSpeed: number;
  minGaugePressure: number;
  reynolds: number;
  reynoldsDefinition: string;
  froude: number;
  froudeDefinition: string;
  weber: number;
  weberDefinition: string;
  euler: number;
  eulerDefinition: string;
  eulerNumerical: number | null;
  cavitation: number | null;
  cavitationDefinition: string;
  minAbsolutePressure: number | null;
  kineticEnergy: number;
  potentialEnergy: number;
  energyUnit: string;
  divergenceL2: number;
  divergenceLinf: number;
  nearWallDivergence: number;
  wallNormalSpeed: number;
  massBalanceError: number;
  actualTimeStep: number;
  requestedTimeStep: number;
  cflLimited: boolean;
  viscousLimited: boolean;
  pressureIterations: number;
  pressureResidual: number;
  solverKind: SolverKind;
  turbulenceModel: TurbulenceModel;
  domainMode: DomainMode;
  modelLabel: string;
  velocitySource: string;
  flowRegimeNote: string;
  representativeVelocity: number;
  representativeVelocitySource: string;
  representativeLength: number;
  hydraulicDiameterNote: string;
  gridReynolds: number;
  nonFinite: boolean;
  approximations: string[];
  unimplemented: string[];
  warningMessages: string[];
  pressureProfile: { y: number; pressure: number }[];
  reservoirArea: number;
  belowVaporPressure: boolean;
  cavitationModelActive: boolean;
  surfaceTensionForceActive: boolean;
  cellCount: number;
  fluidCellCount: number;
}

export interface VelocityFieldView {
  u: Float64Array;
  v: Float64Array;
  nx: number;
  ny: number;
  dx: number;
  dy: number;
}

export interface FrameSnapshot {
  diagnostics: Diagnostics;
  nx: number;
  ny: number;
  dx: number;
  dy: number;
  reservoirLength: number;
  damThickness: number;
  downstreamLength: number;
  damHeight: number;
  waterLevel: number;
  orificeBottom: number;
  orificeTop: number;
  cell: Uint8Array;
  speed: Float32Array;
  uCenter: Float32Array;
  vCenter: Float32Array;
  pressure: Float32Array;
  vorticity: Float32Array;
  particlesX: Float32Array;
  particlesY: Float32Array;
  particlesVx: Float32Array;
  particlesVy: Float32Array;
  particlesAge: Float32Array;
  particlesKinematic: Uint8Array;
  particleCount: number;
  trailGeneration: number;
}

export type WorkerRequest =
  | { type: "init"; params: SimulationParameters; id: number }
  | { type: "step"; substeps: number; dt: number; id: number };

export type WorkerResponse =
  | { type: "frame"; id: number; snapshot: FrameSnapshot }
  | { type: "error"; id: number; message: string };

export interface HistoryPoint {
  t: number;
  qTheory: number;
  qNumerical: number;
  vTheory: number;
  vNumerical: number;
  waterLevel: number;
  kineticEnergy: number;
  potentialEnergy: number;
  divergence: number;
}

export interface ValidationMessage {
  level: "info" | "warning" | "error";
  message: string;
}

export const CELL_SOLID = 0;
export const CELL_FLUID = 1;
export const CELL_LID = 2;
export const CELL_ATMOSPHERE = 3;

export const UNIMPLEMENTED_PHYSICS = [
  "自由水面の変形（VOF・Level Set・SPH）は未実装です。水面は水平線のまま圧力を大気圧に固定し、水位は体積収支だけで更新します。",
  "表面張力による界面力は運動方程式に入っていません。表面張力係数はウェーバー数の評価だけに使います。",
  "k-ε などの RANS は未実装です。選択できる渦粘性は Smagorinsky 型の2次元近似です。",
  "キャビテーションの相変化・蒸気泡は解いていません。キャビテーション数は圧力と蒸気圧からの参考指標です。",
  "円形オリフィスの3次元縮流は2次元断面では再現できません。",
  "水温テーブルは物性の初期値を入れるためのもので、計算中に温度場は解きません。",
];
