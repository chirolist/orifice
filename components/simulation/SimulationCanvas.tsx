"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { drawFrame } from "@/lib/visualization/renderer";
import type { FrameSnapshot } from "@/types/simulation";
import { useSimulationStore } from "@/hooks/useSimulationStore";

export function SimulationCanvas({ snapshotRef }: { snapshotRef: MutableRefObject<FrameSnapshot | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trails = useRef<{ x: number; y: number }[][]>([]);
  const ages = useRef<Float32Array>(new Float32Array(0));
  const generation = useRef(-1);
  const displayMode = useSimulationStore((state) => state.displayMode);
  const showVectors = useSimulationStore((state) => state.showVectors);
  const showStreamlines = useSimulationStore((state) => state.showStreamlines);
  const showParticles = useSimulationStore((state) => state.showParticles);
  const showTrails = useSimulationStore((state) => state.showTrails);
  const trailEpoch = useSimulationStore((state) => state.trailEpoch);

  useEffect(() => {
    trails.current = [];
    ages.current = new Float32Array(0);
  }, [trailEpoch]);

  useEffect(() => {
    let frameId = 0;
    const loop = () => {
      const canvas = canvasRef.current;
      const frame = snapshotRef.current;
      if (canvas && frame) {
        syncTrails(frame, trails.current, ages, generation);
        drawFrame(canvas, frame, {
          displayMode,
          showVectors,
          showStreamlines,
          showParticles,
          showTrails,
          visualPerturbation: frame.diagnostics.turbulenceModel === "visual-only",
          trails: trails.current,
        });
      }
      frameId = window.requestAnimationFrame(loop);
    };
    frameId = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frameId);
  }, [displayMode, showParticles, showStreamlines, showTrails, showVectors, snapshotRef]);

  return <canvas ref={canvasRef} className="simulation-canvas" aria-label="ダムとオリフィスの断面シミュレーション" />;
}

function syncTrails(
  frame: FrameSnapshot,
  trails: { x: number; y: number }[][],
  ages: MutableRefObject<Float32Array>,
  generation: MutableRefObject<number>,
): void {
  if (generation.current !== frame.trailGeneration || trails.length !== frame.particleCount) {
    generation.current = frame.trailGeneration;
    trails.length = frame.particleCount;
    ages.current = new Float32Array(frame.particleCount);
    for (let i = 0; i < frame.particleCount; i += 1) {
      trails[i] = [];
      ages.current[i] = frame.particlesAge[i] ?? 0;
    }
  }
  for (let i = 0; i < frame.particleCount; i += 1) {
    const age = frame.particlesAge[i] ?? 0;
    if (age + 1e-6 < ages.current[i]) trails[i] = [];
    ages.current[i] = age;
    const trail = trails[i] ?? [];
    const x = frame.particlesX[i];
    const y = frame.particlesY[i];
    const last = trail[trail.length - 1];
    if (!last || Math.hypot(last.x - x, last.y - y) > 0.01) trail.push({ x, y });
    if (trail.length > 18) trail.shift();
    trails[i] = trail;
  }
}
