"use client";

import dynamic from "next/dynamic";
import { useRef } from "react";
import { ParameterPanel } from "@/components/controls/ParameterPanel";
import { Toolbar } from "@/components/controls/Toolbar";
import { HelpDialog } from "@/components/help/HelpDialog";
import { MetricsPanel } from "@/components/metrics/MetricsPanel";
import { SimulationCanvas } from "@/components/simulation/SimulationCanvas";
import { useSimulation } from "@/hooks/useSimulation";
import { useSimulationStore } from "@/hooks/useSimulationStore";
import type { FrameSnapshot } from "@/types/simulation";

const ChartsPanel = dynamic(() => import("@/components/charts/ChartsPanel"), {
  ssr: false,
  loading: () => <section className="charts-panel"><p className="panel-note">グラフを準備しています。</p></section>,
});

export function Simulator() {
  const snapshotRef = useRef<FrameSnapshot | null>(null);
  const { stepOnce } = useSimulation(snapshotRef);
  const diagnostics = useSimulationStore((state) => state.diagnostics);

  return (
    <div className="app-shell">
      <Toolbar onStep={stepOnce} />
      <div className="workspace">
        <ParameterPanel />
        <main className="stage">
          <div className="stage-status">
            <span>{diagnostics?.modelLabel ?? "初期化しています"}</span>
            <span>{diagnostics ? `ステップ ${diagnostics.stepCount}` : ""}</span>
          </div>
          <SimulationCanvas snapshotRef={snapshotRef} />
        </main>
        <MetricsPanel />
      </div>
      <ChartsPanel />
      <HelpDialog />
    </div>
  );
}
