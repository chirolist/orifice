"use client";

import { useState } from "react";
import { validateParameters } from "@/lib/parameters";
import { kinematicViscosity } from "@/lib/physics/properties";
import { waterPropertiesAtTemperature } from "@/lib/physics/properties";
import { useSimulationStore } from "@/hooks/useSimulationStore";
import type { SimulationParameters } from "@/types/simulation";

export function ParameterPanel() {
  const params = useSimulationStore((state) => state.params);
  const setParam = useSimulationStore((state) => state.setParam);
  const replaceParams = useSimulationStore((state) => state.replaceParams);
  const [temperature, setTemperature] = useState(20);
  const messages = validateParameters(params);
  const nu = kinematicViscosity(params.dynamicViscosity, params.density);

  return (
    <aside className="side-panel">
      <h2>物理パラメータ</h2>
      <p className="panel-note">形状や物性を変えると速度場は初期化されます。単位はSIです。</p>
      <div className="messages">
        {messages.filter((message) => message.level !== "info").map((message) => (
          <p key={message.message} className={message.level === "error" ? "message error" : "message warning"}>{message.message}</p>
        ))}
      </div>

      <section>
        <h3>幾何</h3>
        <NumberField label="初期水深" unit="m" min={0.2} max={12} step={0.05} value={params.waterDepth} onChange={(value) => setParam("waterDepth", value)} hint="計算開始時の水位です。途中の水位は右側に出ます。" />
        <NumberField label="ダム高さ" unit="m" min={0.5} max={12} step={0.05} value={params.damHeight} onChange={(value) => setParam("damHeight", value)} />
        <NumberField label="オリフィス幅" unit="m" min={0.02} max={2} step={0.01} value={params.orificeWidth} onChange={(value) => setParam("orificeWidth", value)} hint="奥行き方向の幅です。2次元断面の開口高さとは別です。" />
        <NumberField label="オリフィス高さ" unit="m" min={0.02} max={2} step={0.01} value={params.orificeHeight} onChange={(value) => setParam("orificeHeight", value)} hint="円形では直径として断面積を計算します。" />
        <NumberField label="初期水面からの中心深さ" unit="m" min={-0.5} max={8} step={0.01} value={params.orificeDepth} onChange={(value) => setParam("orificeDepth", value)} hint="正なら水面より下です。オリフィスの位置はダムに固定され、水位が下がると深さは減ります。" />
        <SelectField label="オリフィス形状" value={params.orificeShape} onChange={(value) => setParam("orificeShape", value as SimulationParameters["orificeShape"])} options={[["rectangular", "長方形"], ["circular", "円形"], ["horizontal-slit", "横長スリット"], ["vertical-slit", "縦長スリット"]]} />
        <NumberField label="貯水池の長さ" unit="m" min={1} max={12} step={0.1} value={params.reservoirLength} onChange={(value) => setParam("reservoirLength", value)} />
        <NumberField label="貯水池の奥行き" unit="m" min={0.2} max={20} step={0.1} value={params.reservoirWidth} onChange={(value) => setParam("reservoirWidth", value)} hint="水位収支の水平断面積は、長さ×奥行きです。" />
        <NumberField label="ダム厚さ" unit="m" min={0.1} max={1.5} step={0.05} value={params.damThickness} onChange={(value) => setParam("damThickness", value)} />
        <NumberField label="下流長さ" unit="m" min={0.8} max={8} step={0.1} value={params.downstreamLength} onChange={(value) => setParam("downstreamLength", value)} />
      </section>

      <section>
        <h3>流体</h3>
        <NumberField label="密度 ρ" unit="kg/m³" min={500} max={2000} step={1} value={params.density} onChange={(value) => setParam("density", value)} />
        <NumberField label="粘性係数 μ" unit="Pa·s" min={0.0001} max={8} step={0.0001} value={params.dynamicViscosity} onChange={(value) => setParam("dynamicViscosity", value)} log hint="動粘度とは独立ではありません。ν = μ / ρ です。" />
        <NumberField label="動粘度 ν" unit="m²/s" min={1e-7} max={0.01} step={1e-7} value={nu} onChange={(value) => setParam("dynamicViscosity", value * params.density)} log hint="ここを変えると μ = νρ に更新します。密度を変えると ν が変わります。" />
        <NumberField label="重力加速度 g" unit="m/s²" min={1} max={20} step={0.01} value={params.gravity} onChange={(value) => setParam("gravity", value)} hint="標準重力は 9.80665 m/s² です。" />
        <NumberField label="表面張力 σ" unit="N/m" min={0} max={0.2} step={0.001} value={params.surfaceTension} onChange={(value) => setParam("surfaceTension", value)} hint="ウェーバー数の評価だけに使います。水面形状は変わりません。" />
        <NumberField label="大気圧" unit="Pa" min={0} max={200000} step={100} value={params.atmosphericPressure} onChange={(value) => setParam("atmosphericPressure", value)} />
        <NumberField label="蒸気圧" unit="Pa" min={0} max={101325} step={10} value={params.vaporPressure} onChange={(value) => setParam("vaporPressure", value)} hint="キャビテーション数の参照値です。相変化は解きません。" />
        <NumberField label="流出係数 Cd" unit="—" min={0.05} max={1} step={0.01} value={params.dischargeCoefficient} onChange={(value) => setParam("dischargeCoefficient", value)} hint="理論流量に使います。開口と流れの条件で変わる係数です。" />
        <NumberField label="流入量" unit="m³/s" min={0} max={1} step={0.01} value={params.inflowRate} onChange={(value) => setParam("inflowRate", value)} />
        <label className="field">
          <span className="field-label">水温から物性を入れる<small>℃</small></span>
          <span className="field-row">
            <input type="number" min={0} max={100} step={1} value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} />
            <button type="button" className="text-button" onClick={() => {
              const water = waterPropertiesAtTemperature(temperature);
              replaceParams({
                ...useSimulationStore.getState().params,
                density: water.density,
                dynamicViscosity: water.dynamicViscosity,
                surfaceTension: water.surfaceTension,
                vaporPressure: water.vaporPressure,
              });
            }}>水の表を反映</button>
          </span>
          <span className="field-hint">0〜100℃の近似表です。計算中の温度場はありません。反映はボタンを押したときだけです。</span>
        </label>
      </section>

      <section>
        <h3>数値計算と粒子</h3>
        <SelectField label="計算モデル" value={params.solverKind} onChange={(value) => setParam("solverKind", value as SimulationParameters["solverKind"])} options={[["navier-stokes", "2次元ナビエ・ストークス"], ["analytical", "解析モデル（トリチェリ）"]]} />
        <SelectField label="計算領域" value={params.domainMode} onChange={(value) => setParam("domainMode", value as SimulationParameters["domainMode"])} options={[["free-discharge", "自由放出（下流は運動学）"], ["downstream-channel", "下流チャンネル（単相）"]]} />
        <SelectField label="乱流の扱い" value={params.turbulenceModel} onChange={(value) => setParam("turbulenceModel", value as SimulationParameters["turbulenceModel"])} options={[["laminar", "層流NS（渦粘性なし）"], ["dns-attempt", "高解像度の試み（2次元）"], ["smagorinsky", "Smagorinsky型渦粘性"], ["visual-only", "描画だけの擾乱"]]} />
        <SelectField label="移流スキーム" value={params.advectionScheme} onChange={(value) => setParam("advectionScheme", value as SimulationParameters["advectionScheme"])} options={[["semi-lagrangian", "セミラグランジュ（RK2）"], ["upwind", "1次風上差分"]]} />
        <SelectField label="圧力解法" value={params.pressureMethod} onChange={(value) => setParam("pressureMethod", value as SimulationParameters["pressureMethod"])} options={[["sor", "SOR"], ["gauss-seidel", "Gauss-Seidel"], ["jacobi", "Jacobi"]]} />
        <SelectField label="粒子積分" value={params.integrator} onChange={(value) => setParam("integrator", value as SimulationParameters["integrator"])} options={[["euler", "オイラー法"], ["rk2", "2次ルンゲ・クッタ"], ["rk4", "4次ルンゲ・クッタ"]]} />
        <NumberField label="鉛直格子数" unit="—" min={20} max={96} step={4} value={params.resolution} onChange={(value) => setParam("resolution", Math.round(value))} hint="水平方向は正方形セルになるよう決まります。上限は96です。" />
        <NumberField label="時間刻み" unit="s" min={0.0005} max={0.02} step={0.0005} value={params.timeStep} onChange={(value) => setParam("timeStep", value)} hint="CFLと粘性でさらに制限されます。描画の遅さとは分離しています。" />
        <NumberField label="圧力反復" unit="回" min={8} max={80} step={1} value={params.pressureIterations} onChange={(value) => setParam("pressureIterations", Math.round(value))} />
        <NumberField label="粒子数" unit="—" min={0} max={3000} step={20} value={params.particleCount} onChange={(value) => setParam("particleCount", Math.round(value))} hint="粒子は速度場を見るトレーサーで、水の質量そのものではありません。" />
        <NumberField label="粒子寿命" unit="s" min={1} max={30} step={0.5} value={params.particleLifetime} onChange={(value) => setParam("particleLifetime", value)} />
        <NumberField label="シミュレーション速度" unit="倍" min={0.2} max={4} step={0.1} value={params.simulationSpeed} onChange={(value) => setParam("simulationSpeed", value)} hint="実時間に対する模擬時間の倍率です。物理の時間刻みは変えません。" />
        <NumberField label="Smagorinsky Cs" unit="—" min={0.02} max={0.3} step={0.01} value={params.smagorinskyConstant} onChange={(value) => setParam("smagorinskyConstant", value)} hint="渦粘性モードのときだけ運動方程式に入ります。" />
      </section>
    </aside>
  );
}

function NumberField({ label, unit, min, max, step, value, onChange, hint, log = false }: {
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  hint?: string;
  log?: boolean;
}) {
  const safe = Number.isFinite(value) ? value : min;
  const slider = log ? logPosition(safe, min, max) : Math.min(max, Math.max(min, safe));
  return (
    <label className="field">
      <span className="field-label">{label}<small>{unit}</small></span>
      <span className="field-row">
        <input
          type="range"
          min={log ? 0 : min}
          max={log ? 1 : max}
          step={log ? 0.001 : step}
          value={slider}
          onChange={(event) => onChange(log ? logValue(Number(event.target.value), min, max) : Number(event.target.value))}
        />
        <input type="number" step={step} value={Number.isFinite(value) ? value : ""} onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }} />
      </span>
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

function SelectField({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>
  );
}

function logPosition(value: number, min: number, max: number): number {
  const safeMin = Math.max(min, 1e-12);
  const safe = Math.min(max, Math.max(safeMin, value));
  return (Math.log10(safe) - Math.log10(safeMin)) / (Math.log10(max) - Math.log10(safeMin));
}

function logValue(position: number, min: number, max: number): number {
  const safeMin = Math.max(min, 1e-12);
  const log = Math.log10(safeMin) + position * (Math.log10(max) - Math.log10(safeMin));
  return 10 ** log;
}
