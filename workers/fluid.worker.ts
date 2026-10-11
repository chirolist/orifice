/// <reference lib="webworker" />

import { createEngine } from "@/lib/solver/createEngine";
import type { FluidEngine } from "@/lib/solver/engine";
import type { FrameSnapshot, WorkerRequest, WorkerResponse } from "@/types/simulation";

const scope = self as DedicatedWorkerGlobalScope;
let engine: FluidEngine | null = null;

function transferList(snapshot: FrameSnapshot): Transferable[] {
  return [
    snapshot.cell.buffer,
    snapshot.speed.buffer,
    snapshot.uCenter.buffer,
    snapshot.vCenter.buffer,
    snapshot.pressure.buffer,
    snapshot.vorticity.buffer,
    snapshot.particlesX.buffer,
    snapshot.particlesY.buffer,
    snapshot.particlesVx.buffer,
    snapshot.particlesVy.buffer,
    snapshot.particlesAge.buffer,
    snapshot.particlesKinematic.buffer,
  ];
}

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  try {
    if (message.type === "init") {
      engine?.dispose();
      engine = createEngine(message.params);
      const snapshot = engine.exportFrame();
      const response: WorkerResponse = { type: "frame", id: message.id, snapshot };
      scope.postMessage(response, transferList(snapshot));
      return;
    }
    if (!engine || message.type !== "step") return;
    for (let i = 0; i < message.substeps; i += 1) {
      engine.step(message.dt);
      if (engine.getDiagnostics().nonFinite) break;
    }
    const snapshot = engine.exportFrame();
    const response: WorkerResponse = { type: "frame", id: message.id, snapshot };
    scope.postMessage(response, transferList(snapshot));
  } catch (error) {
    const response: WorkerResponse = {
      type: "error",
      id: message.id,
      message: error instanceof Error ? error.message : "流体計算に失敗しました。",
    };
    scope.postMessage(response);
  }
};
