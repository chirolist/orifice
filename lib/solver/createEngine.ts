import { AnalyticalEngine } from "@/lib/solver/analytical";
import type { FluidEngine } from "@/lib/solver/engine";
import { NavierStokesEngine } from "@/lib/solver/navierStokes";
import type { SimulationParameters } from "@/types/simulation";

export function createEngine(parameters: SimulationParameters): FluidEngine {
  const engine = parameters.solverKind === "analytical" ? new AnalyticalEngine() : new NavierStokesEngine();
  engine.initialize(parameters);
  return engine;
}
