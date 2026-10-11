"use client";

import { PRESETS } from "@/lib/presets";
import { useSimulationStore } from "@/hooks/useSimulationStore";
import type { DisplayMode, SimulationParameters } from "@/types/simulation";

const MODES: [DisplayMode, string][] = [
  ["speed", "速度"],
  ["u", "水平速度"],
  ["v", "鉛直速度"],
  ["pressure", "圧力"],
  ["vorticity", "渦度"],
];

export function Toolbar({ onStep }: { onStep: () => void }) {
  const running = useSimulationStore((state) => state.running);
  const errorMessage = useSimulationStore((state) => state.errorMessage);
  const displayMode = useSimulationStore((state) => state.displayMode);
  const showVectors = useSimulationStore((state) => state.showVectors);
  const showStreamlines = useSimulationStore((state) => state.showStreamlines);
  const showParticles = useSimulationStore((state) => state.showParticles);
  const setRunning = useSimulationStore((state) => state.setRunning);
  const setDisplayMode = useSimulationStore((state) => state.setDisplayMode);
  const toggleOverlay = useSimulationStore((state) => state.toggleOverlay);
  const applyPreset = useSimulationStore((state) => state.applyPreset);
  const resetSimulation = useSimulationStore((state) => state.resetSimulation);
  const restoreBaseline = useSimulationStore((state) => state.restoreBaseline);
  const clearTrails = useSimulationStore((state) => state.clearTrails);
  const setHelpOpen = useSimulationStore((state) => state.setHelpOpen);
  const params = useSimulationStore((state) => state.params);
  const history = useSimulationStore((state) => state.history);

  return (
    <header className="toolbar">
      <div className="brand">
        <strong>ORIFICE</strong>
        <span>ダム・オリフィス流出シミュレーター</span>
      </div>
      <div className="toolbar-actions">
        <button type="button" onClick={() => setRunning(true)} disabled={running || Boolean(errorMessage)}>開始</button>
        <button type="button" onClick={() => setRunning(false)} disabled={!running}>一時停止</button>
        <button type="button" onClick={onStep} disabled={running}>1ステップ</button>
        <button type="button" onClick={resetSimulation}>リセット</button>
        <button type="button" onClick={restoreBaseline}>初期状態に戻す</button>
        <button type="button" onClick={clearTrails}>軌跡を消去</button>
        <label className="inline-select">
          表示
          <select value={displayMode} onChange={(event) => setDisplayMode(event.target.value as DisplayMode)}>
            {MODES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <button type="button" className={showVectors ? "active" : ""} onClick={() => toggleOverlay("showVectors")}>ベクトル</button>
        <button type="button" className={showStreamlines ? "active" : ""} onClick={() => toggleOverlay("showStreamlines")}>流線</button>
        <button type="button" className={showParticles ? "active" : ""} onClick={() => toggleOverlay("showParticles")}>粒子</button>
        <label className="inline-select">
          プリセット
          <select value="" onChange={(event) => { if (event.target.value) applyPreset(event.target.value); }}>
            <option value="">選択して適用</option>
            {PRESETS.map((preset) => <option key={preset.id} value={preset.id} title={preset.summary}>{preset.name}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => saveParameters(params)}>パラメータ保存</button>
        <label className="file-button">
          パラメータ読込
          <input type="file" accept="application/json" onChange={(event) => loadParameters(event.target.files?.[0])} />
        </label>
        <button type="button" onClick={saveImage}>画像保存</button>
        <button type="button" onClick={() => saveCsv(history)}>CSV</button>
        <button type="button" onClick={() => setHelpOpen(true)}>解説</button>
      </div>
      {errorMessage ? <p className="message error toolbar-error">{errorMessage}</p> : null}
    </header>
  );
}

function saveParameters(params: SimulationParameters): void {
  const json = JSON.stringify(params, null, 2);
  window.localStorage.setItem("orifice-parameters", json);
  downloadBlob(new Blob([json], { type: "application/json" }), "orifice-parameters.json");
}

async function loadParameters(file: File | undefined): Promise<void> {
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text()) as SimulationParameters;
    if (!parsed || typeof parsed.waterDepth !== "number" || typeof parsed.gravity !== "number") {
      useSimulationStore.getState().setError("パラメータファイルの形式を確認してください。");
      return;
    }
    useSimulationStore.getState().replaceParams({ ...useSimulationStore.getState().params, ...parsed });
    useSimulationStore.getState().clearError();
  } catch {
    useSimulationStore.getState().setError("パラメータファイルを読めませんでした。");
  }
}

function saveImage(): void {
  const canvas = document.querySelector(".simulation-canvas");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = "orifice-frame.png";
  link.click();
}

function saveCsv(history: { t: number; qTheory: number; qNumerical: number; vTheory: number; vNumerical: number; waterLevel: number; kineticEnergy: number; potentialEnergy: number; divergence: number }[]): void {
  const header = "time_s,Q_theory_m3_s,Q_numerical_m3_s,v_theory_m_s,v_numerical_m_s,water_level_m,kinetic_J_per_m,potential_J_per_m,divergence_1_s";
  const lines = history.map((point) => [point.t, point.qTheory, point.qNumerical, point.vTheory, point.vNumerical, point.waterLevel, point.kineticEnergy, point.potentialEnergy, point.divergence].join(","));
  downloadBlob(new Blob([[header, ...lines].join("\n")], { type: "text/csv" }), "orifice-history.csv");
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
