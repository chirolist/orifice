"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { solverSignature, useSimulationStore } from "@/hooks/useSimulationStore";
import type { FrameSnapshot, WorkerRequest, WorkerResponse } from "@/types/simulation";

export function useSimulation(snapshotRef: MutableRefObject<FrameSnapshot | null>): {
  stepOnce: () => void;
} {
  const workerRef = useRef<Worker | null>(null);
  const inFlight = useRef(false);
  const wallOrigin = useRef(0);
  const requestId = useRef(0);

  const alignClock = () => {
    const speed = Math.max(0.1, useSimulationStore.getState().params.simulationSpeed);
    const simTime = snapshotRef.current?.diagnostics.time ?? 0;
    wallOrigin.current = performance.now() - (simTime / speed) * 1000;
  };

  const requestStep = () => {
    const worker = workerRef.current;
    const state = useSimulationStore.getState();
    if (!worker || inFlight.current || !state.running || document.hidden) return;
    const speed = Math.max(0.1, state.params.simulationSpeed);
    const target = ((performance.now() - wallOrigin.current) / 1000) * speed;
    const simTime = snapshotRef.current?.diagnostics.time ?? 0;
    if (simTime >= target - 1e-4) return;
    const substeps = Math.min(8, Math.max(1, Math.round((target - simTime) / state.params.timeStep)));
    inFlight.current = true;
    const message: WorkerRequest = { type: "step", substeps, dt: state.params.timeStep, id: requestId.current };
    worker.postMessage(message);
  };

  useEffect(() => {
    const worker = new Worker(new URL("../workers/fluid.worker.ts", import.meta.url));
    workerRef.current = worker;
    let disposed = false;
    let timer = 0;

    const sendInit = () => {
      inFlight.current = true;
      requestId.current += 1;
      useSimulationStore.getState().clearHistory();
      const message: WorkerRequest = { type: "init", params: useSimulationStore.getState().params, id: requestId.current };
      worker.postMessage(message);
    };

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (disposed || event.data.id !== requestId.current) return;
      inFlight.current = false;
      if (event.data.type === "error") {
        useSimulationStore.getState().setError(event.data.message);
        return;
      }
      snapshotRef.current = event.data.snapshot;
      useSimulationStore.getState().publish(event.data.snapshot.diagnostics);
      if (useSimulationStore.getState().running) requestStep();
    };
    worker.onerror = () => {
      useSimulationStore.getState().setError("流体計算ワーカーを起動できませんでした。");
    };

    sendInit();
    alignClock();

    const unsubscribe = useSimulationStore.subscribe((state, previous) => {
      if (state.params.simulationSpeed !== previous.params.simulationSpeed) alignClock();
      if (state.running && !previous.running) {
        alignClock();
        requestStep();
      }
      const paramsChanged = solverSignature(state.params) !== solverSignature(previous.params);
      const resetChanged = state.revision !== previous.revision;
      if (!paramsChanged && !resetChanged) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        sendInit();
        alignClock();
      }, 180);
    });

    const onVisibility = () => {
      if (!document.hidden) {
        alignClock();
        requestStep();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    const pump = window.setInterval(() => requestStep(), 120);

    return () => {
      disposed = true;
      unsubscribe();
      window.clearTimeout(timer);
      window.clearInterval(pump);
      document.removeEventListener("visibilitychange", onVisibility);
      worker.terminate();
      workerRef.current = null;
    };
    // The worker lives for the lifetime of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stepOnce = () => {
    const worker = workerRef.current;
    if (!worker || inFlight.current) return;
    inFlight.current = true;
    const dt = useSimulationStore.getState().params.timeStep;
    const message: WorkerRequest = { type: "step", substeps: 1, dt, id: requestId.current };
    worker.postMessage(message);
  };

  return { stepOnce };
}
