import { create } from "zustand";
import { DEFAULT_PARAMETERS } from "@/lib/parameters";
import { parametersFromPreset, PRESETS } from "@/lib/presets";
import type { Diagnostics, DisplayMode, HistoryPoint, SimulationParameters } from "@/types/simulation";

export type ChartId = "discharge" | "velocity" | "level" | "pressure" | "energy" | "comparison";

const DEFAULT_CHARTS: Record<ChartId, boolean> = {
  discharge: true,
  velocity: true,
  level: true,
  pressure: true,
  energy: true,
  comparison: true,
};

interface SimulationState {
  params: SimulationParameters;
  baseline: SimulationParameters;
  revision: number;
  running: boolean;
  displayMode: DisplayMode;
  showVectors: boolean;
  showStreamlines: boolean;
  showParticles: boolean;
  showTrails: boolean;
  charts: Record<ChartId, boolean>;
  diagnostics: Diagnostics | null;
  history: HistoryPoint[];
  errorMessage: string | null;
  helpOpen: boolean;
  trailEpoch: number;
  clearTrails: () => void;
  setParam: <K extends keyof SimulationParameters>(key: K, value: SimulationParameters[K]) => void;
  replaceParams: (params: SimulationParameters) => void;
  applyPreset: (id: string) => void;
  setRunning: (running: boolean) => void;
  setDisplayMode: (mode: DisplayMode) => void;
  toggleOverlay: (key: "showVectors" | "showStreamlines" | "showParticles" | "showTrails") => void;
  toggleChart: (id: ChartId) => void;
  publish: (diagnostics: Diagnostics) => void;
  clearHistory: () => void;
  resetSimulation: () => void;
  restoreBaseline: () => void;
  setError: (message: string) => void;
  clearError: () => void;
  setHelpOpen: (open: boolean) => void;
}

function historyPoint(diagnostics: Diagnostics): HistoryPoint {
  return {
    t: diagnostics.time,
    qTheory: diagnostics.theoreticalDischarge,
    qNumerical: diagnostics.numericalDischarge,
    vTheory: diagnostics.theoreticalVelocity,
    vNumerical: diagnostics.numericalMeanVelocity,
    waterLevel: diagnostics.waterLevel,
    kineticEnergy: diagnostics.kineticEnergy,
    potentialEnergy: diagnostics.potentialEnergy,
    divergence: diagnostics.divergenceL2,
  };
}

export const useSimulationStore = create<SimulationState>((set) => ({
  params: DEFAULT_PARAMETERS,
  baseline: DEFAULT_PARAMETERS,
  revision: 0,
  running: false,
  displayMode: "speed",
  showVectors: false,
  showStreamlines: false,
  showParticles: true,
  showTrails: true,
  charts: DEFAULT_CHARTS,
  diagnostics: null,
  history: [],
  errorMessage: null,
  helpOpen: false,
  trailEpoch: 0,
  setParam: (key, value) => set((state) => ({ params: { ...state.params, [key]: value }, errorMessage: null })),
  replaceParams: (params) => set({ params, errorMessage: null }),
  applyPreset: (id) => {
    const preset = PRESETS.find((item) => item.id === id);
    if (!preset) return;
    const params = parametersFromPreset(preset);
    set((state) => ({ params, baseline: params, revision: state.revision + 1, running: false, errorMessage: null }));
  },
  setRunning: (running) => set({ running }),
  setDisplayMode: (displayMode) => set({ displayMode }),
  toggleOverlay: (key) => set((state) => ({ [key]: !state[key] })),
  toggleChart: (id) => set((state) => ({ charts: { ...state.charts, [id]: !state.charts[id] } })),
  publish: (diagnostics) => set((state) => {
    const point = historyPoint(diagnostics);
    const last = state.history[state.history.length - 1];
    let history = state.history;
    if (!last || point.t + 1e-6 < last.t) history = [point];
    else if (point.t - last.t >= 0.05) history = [...state.history, point].slice(-240);
    return {
      diagnostics,
      history,
      errorMessage: diagnostics.nonFinite ? diagnostics.warningMessages[0] ?? "計算が発散しました。" : state.errorMessage,
      running: diagnostics.nonFinite ? false : state.running,
    };
  }),
  clearHistory: () => set({ history: [] }),
  resetSimulation: () => set((state) => ({ revision: state.revision + 1, running: false, errorMessage: null })),
  restoreBaseline: () => set((state) => ({
    params: state.baseline,
    revision: state.revision + 1,
    running: false,
    errorMessage: null,
  })),
  setError: (message) => set({ errorMessage: message, running: false }),
  clearError: () => set({ errorMessage: null }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  clearTrails: () => set((state) => ({ trailEpoch: state.trailEpoch + 1 })),
}));

export function solverSignature(params: SimulationParameters): string {
  const comparable = { ...params, simulationSpeed: undefined };
  return JSON.stringify(comparable);
}
