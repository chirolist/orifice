import { DEFAULT_PARAMETERS } from "@/lib/parameters";
import type { SimulationParameters } from "@/types/simulation";

export interface Preset {
  id: string;
  name: string;
  summary: string;
  params: Partial<SimulationParameters>;
}

export const PRESETS: Preset[] = [
  {
    id: "ideal",
    name: "理想的なオリフィス流出",
    summary: "解析モデルです。流出係数を0.98にし、√(2gh) に近い出口流速を見ます。ナビエ・ストークス方程式は解いていません。",
    params: {
      solverKind: "analytical",
      dischargeCoefficient: 0.98,
      waterDepth: 3.2,
      damHeight: 4.2,
      orificeWidth: 0.3,
      orificeHeight: 0.25,
      orificeDepth: 1.4,
      inflowRate: 0,
      dynamicViscosity: 1.002e-3,
      turbulenceModel: "laminar",
    },
  },
  {
    id: "viscous",
    name: "低流速・粘性支配の流れ",
    summary: "2次元ナビエ・ストークス、層流です。粘性係数を水より大きくし、レイノルズ数を下げます。層流かどうかはレイノルズ数だけでは断定しません。",
    params: {
      solverKind: "navier-stokes",
      turbulenceModel: "laminar",
      domainMode: "free-discharge",
      waterDepth: 2.2,
      damHeight: 3,
      orificeWidth: 0.35,
      orificeHeight: 0.35,
      orificeDepth: 0.8,
      dynamicViscosity: 4,
      resolution: 32,
      dischargeCoefficient: 0.62,
      inflowRate: 0,
    },
  },
  {
    id: "fast-jet",
    name: "高速噴流",
    summary: "水深の大きい自由放出です。貯水池内はナビエ・ストークス、ダム下流の落下粒子は運動学的追跡です。下流の気液界面は解いていません。",
    params: {
      solverKind: "navier-stokes",
      domainMode: "free-discharge",
      turbulenceModel: "laminar",
      waterDepth: 5,
      damHeight: 6,
      orificeWidth: 0.2,
      orificeHeight: 0.16,
      orificeDepth: 3.2,
      dynamicViscosity: 1.002e-3,
      resolution: 48,
      inflowRate: 0,
    },
  },
  {
    id: "draining",
    name: "水位が徐々に低下するダム",
    summary: "流入量0のナビエ・ストークスです。流出に応じて水位と理論流量が下がります。水面の形は水平のままです。",
    params: {
      solverKind: "navier-stokes",
      domainMode: "free-discharge",
      turbulenceModel: "laminar",
      waterDepth: 3.6,
      damHeight: 4.2,
      orificeWidth: 0.55,
      orificeHeight: 0.42,
      orificeDepth: 1.3,
      inflowRate: 0,
      resolution: 36,
      simulationSpeed: 1.5,
    },
  },
  {
    id: "small-opening",
    name: "小さな開口部からの流出",
    summary: "解析モデルです。開口を小さくし、断面積に比例して理論流量が減ることを確認します。",
    params: {
      solverKind: "analytical",
      waterDepth: 3,
      damHeight: 4,
      orificeWidth: 0.08,
      orificeHeight: 0.08,
      orificeDepth: 1.5,
      orificeShape: "rectangular",
      dischargeCoefficient: 0.64,
      inflowRate: 0,
    },
  },
  {
    id: "large-opening",
    name: "大きな開口部からの流出",
    summary: "解析モデルです。大きな長方形開口では、小さな開口より理論流量が大きくなります。2次元のため3次元の縮流は含まれません。",
    params: {
      solverKind: "analytical",
      waterDepth: 3.4,
      damHeight: 4.4,
      orificeWidth: 1.1,
      orificeHeight: 0.7,
      orificeDepth: 1.35,
      orificeShape: "rectangular",
      dischargeCoefficient: 0.6,
      inflowRate: 0,
    },
  },
  {
    id: "vortices",
    name: "渦が発生する噴流",
    summary: "下流を単相チャンネルとしてナビエ・ストークスで解きます。開口のせん断で渦度が出ますが、大気中の自由噴流でも3次元乱流でもありません。",
    params: {
      solverKind: "navier-stokes",
      domainMode: "downstream-channel",
      turbulenceModel: "laminar",
      advectionScheme: "semi-lagrangian",
      waterDepth: 3,
      damHeight: 4,
      orificeWidth: 0.3,
      orificeHeight: 0.45,
      orificeDepth: 1.5,
      dynamicViscosity: 0.08,
      resolution: 56,
      downstreamLength: 3.2,
      pressureIterations: 32,
      inflowRate: 0.02,
    },
  },
  {
    id: "reynolds",
    name: "レイノルズ数の違いを比較する実験",
    summary: "プリセット「低流速・粘性支配」と同じ系統のナビエ・ストークスで、粘性だけを下げています。代表長さは水力直径です。遷移の断定には使いません。",
    params: {
      solverKind: "navier-stokes",
      turbulenceModel: "laminar",
      domainMode: "free-discharge",
      waterDepth: 2.2,
      damHeight: 3,
      orificeWidth: 0.35,
      orificeHeight: 0.35,
      orificeDepth: 0.8,
      dynamicViscosity: 0.05,
      resolution: 40,
      dischargeCoefficient: 0.62,
      inflowRate: 0,
    },
  },
];

export function parametersFromPreset(preset: Preset): SimulationParameters {
  return { ...DEFAULT_PARAMETERS, ...preset.params };
}
