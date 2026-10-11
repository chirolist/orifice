"use client";

import { useSimulationStore } from "@/hooks/useSimulationStore";
import type { Diagnostics } from "@/types/simulation";

export function MetricsPanel() {
  const diagnostics = useSimulationStore((state) => state.diagnostics);
  if (!diagnostics) {
    return <aside className="side-panel"><h2>計測</h2><p className="panel-note">計算の準備をしています。</p></aside>;
  }
  const ratio = diagnostics.theoreticalDischarge > 1e-8 ? diagnostics.numericalDischarge / diagnostics.theoreticalDischarge : null;
  return (
    <aside className="side-panel">
      <h2>リアルタイム計測</h2>
      <p className="model-label">{diagnostics.modelLabel}</p>
      <p className="panel-note">{diagnostics.velocitySource}</p>
      <dl className="metrics">
        <Metric label="水位" value={diagnostics.waterLevel} unit="m" note="貯水池の現在の水面高さです。" />
        <Metric label="オリフィス中心の水深" value={diagnostics.orificeCenterDepth} unit="m" note="現在の水面からオリフィス中心までの鉛直距離 h です。" />
        <Metric label="オリフィス断面積" value={diagnostics.orificeArea} unit="m²" note="水没している部分の面積です。部分水没は近似です。" />
        <Metric label="理論流速" value={diagnostics.theoreticalVelocity} unit="m/s" note="トリチェリの定理 v = √(2gh)。非粘性・準定常の理想値です。" />
        <Metric label="数値計算の平均流速" value={diagnostics.numericalMeanVelocity} unit="m/s" note={diagnostics.velocitySource} />
        <Metric label="理論流量" value={diagnostics.theoreticalDischarge} unit="m³/s" note="Q = C_d A √(2gh)。流出係数を含みます。" />
        <Metric label="数値計算の流量" value={diagnostics.numericalDischarge} unit="m³/s" note="出口流速の流束平均に断面積を掛けた値です。" />
        <Metric label="数値流量 / 理論流量" value={ratio} unit="—" note="1に近いほど理論式に近いです。差の原因は過渡、粘性、2次元性、境界、格子です。" />
        <Metric label="平均ゲージ圧" value={diagnostics.meanPressure} unit="Pa" note="流体セルの算術平均です。大気圧を0としたゲージ圧です。" />
        <Metric label="最大流速" value={diagnostics.maxSpeed} unit="m/s" note="流体セル中心の速度の最大値です。" />
        <Metric label="レイノルズ数" value={diagnostics.reynolds} unit="—" note={`${diagnostics.reynoldsDefinition} ${diagnostics.hydraulicDiameterNote}`} />
        <Metric label="フルード数" value={diagnostics.froude} unit="—" note={diagnostics.froudeDefinition} />
        <Metric label="ウェーバー数" value={diagnostics.weber} unit="—" note={diagnostics.weberDefinition} />
        <Metric label="オイラー数" value={diagnostics.euler} unit="—" note={diagnostics.eulerDefinition} />
        <Metric label="数値圧力のオイラー数" value={diagnostics.eulerNumerical} unit="—" note="オリフィス内の平均ゲージ圧を ρU² で割った値です。解析モードでは出しません。" />
        <Metric label="キャビテーション数" value={diagnostics.cavitation} unit="—" note={diagnostics.cavitationDefinition} />
        <Metric label="最小絶対圧力" value={diagnostics.minAbsolutePressure} unit="Pa" note="最小ゲージ圧に大気圧を加えた値です。負のゲージ圧だけではキャビテーションとしません。" />
        <Metric label="運動エネルギー" value={diagnostics.kineticEnergy} unit={diagnostics.energyUnit} note="奥行き1 mあたりの2次元積分です。粒子の数とは無関係です。" />
        <Metric label="位置エネルギー" value={diagnostics.potentialEnergy} unit={diagnostics.energyUnit} note="底面を基準にした奥行き1 mあたりの値です。" />
        <Metric label="発散誤差" value={diagnostics.divergenceL2} unit="1/s" note="流体セルの速度発散のRMSです。非圧縮の数値誤差の指標です。" />
        <Metric label="水位収支誤差" value={diagnostics.massBalanceError} unit="m³" note="累積した (Qin−Qout)Δt と貯水池体積変化の差です。上下限で止めた分が残ります。" />
        <Metric label="壁面法線速度" value={diagnostics.wallNormalSpeed} unit="m/s" note="固体境界に接する法線速度の最大絶対値です。" />
        <Metric label="壁近くの発散" value={diagnostics.nearWallDivergence} unit="1/s" note="壁または水面に接する流体セルの平均絶対発散です。" />
        <Metric label="計算時間" value={diagnostics.computeMilliseconds} unit="ms" note="直近ステップの計算時間です。描画フレームとは別です。" />
        <Metric label="模擬時刻 / ステップ" value={diagnostics.time} unit="s" note={`ステップ数 ${diagnostics.stepCount}。実際の刻み ${format(diagnostics.actualTimeStep, 4)} s。`} />
        <Metric label="圧力残差" value={diagnostics.pressureResidual} unit="Pa" note={`${diagnostics.pressureIterations} 回反復したあとの更新量の最大値です。`} />
        <Metric label="格子レイノルズ数" value={diagnostics.gridReynolds} unit="—" note="UΔx/ν です。大きいと、設定した粘性より数値拡散が優勢になり得ます。" />
      </dl>
      <p className="panel-note">{diagnostics.flowRegimeNote}</p>
      <p className="panel-note">代表流速 {format(diagnostics.representativeVelocity, 3)} m/s（{diagnostics.representativeVelocitySource}）、代表長さ {format(diagnostics.representativeLength, 3)} m。</p>
      <h3>この表示が意味すること</h3>
      <ul className="note-list">
        {diagnostics.approximations.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
      </ul>
      {diagnostics.warningMessages.length > 0 ? (
        <div className="messages">
          {diagnostics.warningMessages.map((message) => <p key={message} className="message warning">{message}</p>)}
        </div>
      ) : null}
    </aside>
  );
}

function Metric({ label, value, unit, note }: { label: string; value: number | null; unit: string; note: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <strong>{format(value, 3)}</strong>
        <small>{unit}</small>
        <span>{note}</span>
      </dd>
    </div>
  );
}

function format(value: number | null, digits: number): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs !== 0 && (abs < 0.001 || abs >= 100000)) return value.toExponential(2);
  return value.toFixed(digits);
}

export type { Diagnostics };
