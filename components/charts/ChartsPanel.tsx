"use client";

import type { ReactNode } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { useSimulationStore, type ChartId } from "@/hooks/useSimulationStore";

const CHARTS: { id: ChartId; title: string }[] = [
  { id: "discharge", title: "流量の時間変化" },
  { id: "velocity", title: "平均流速の時間変化" },
  { id: "level", title: "水位の時間変化" },
  { id: "pressure", title: "オリフィス上流の圧力" },
  { id: "energy", title: "運動エネルギーと位置エネルギー" },
  { id: "comparison", title: "理論流量と数値流量" },
];

export default function ChartsPanel() {
  const charts = useSimulationStore((state) => state.charts);
  const toggleChart = useSimulationStore((state) => state.toggleChart);
  const history = useSimulationStore((state) => state.history);
  const profile = useSimulationStore((state) => state.diagnostics?.pressureProfile ?? []);

  return (
    <section className="charts-panel">
      <div className="chart-toggles">
        {CHARTS.map((chart) => (
          <label key={chart.id}>
            <input type="checkbox" checked={charts[chart.id]} onChange={() => toggleChart(chart.id)} />
            {chart.title}
          </label>
        ))}
      </div>
      <div className="chart-grid">
        {charts.discharge ? <ChartCard title="流量"><Series data={history} lines={[["qTheory", "理論流量", "#5eb0ff"], ["qNumerical", "数値流量", "#f0c14a"]]} /></ChartCard> : null}
        {charts.velocity ? <ChartCard title="平均流速"><Series data={history} lines={[["vTheory", "理論流速", "#5eb0ff"], ["vNumerical", "数値流速", "#f0c14a"]]} /></ChartCard> : null}
        {charts.level ? <ChartCard title="水位"><Series data={history} lines={[["waterLevel", "水位", "#9ad7ff"]]} /></ChartCard> : null}
        {charts.pressure ? <ChartCard title="オリフィス直前の圧力分布"><Series data={profile} xKey="y" lines={[["pressure", "ゲージ圧", "#d7c4ff"]]} /></ChartCard> : null}
        {charts.energy ? <ChartCard title="エネルギー（J/m）"><Series data={history} lines={[["kineticEnergy", "運動", "#ff8b6a"], ["potentialEnergy", "位置", "#7dcea0"]]} /></ChartCard> : null}
        {charts.comparison ? <ChartCard title="理論流量と数値流量"><Comparison data={history} /></ChartCard> : null}
      </div>
    </section>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="chart-card">
      <h3>{title}</h3>
      {children}
    </article>
  );
}

function Comparison({ data }: { data: { qTheory: number; qNumerical: number }[] }) {
  if (data.length === 0) return <p className="panel-note">データがまだありません。</p>;
  return (
    <ResponsiveContainer width="100%" height={150}>
      <ScatterChart margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#24344d" />
        <XAxis dataKey="qTheory" name="理論流量" stroke="#8ea0bb" tick={{ fontSize: 11 }} />
        <YAxis dataKey="qNumerical" name="数値流量" stroke="#8ea0bb" tick={{ fontSize: 11 }} width={46} />
        <Tooltip contentStyle={{ background: "#10192a", border: "1px solid #2c3e5c", fontSize: 12 }} />
        <Scatter data={data} fill="#f0c14a" isAnimationActive={false} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function Series({ data, lines, xKey = "t" }: {
  data: object[];
  lines: [string, string, string][];
  xKey?: string;
}) {
  if (data.length === 0) return <p className="panel-note">データがまだありません。</p>;
  return (
    <ResponsiveContainer width="100%" height={150}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#24344d" />
        <XAxis dataKey={xKey} stroke="#8ea0bb" tick={{ fontSize: 11 }} />
        <YAxis stroke="#8ea0bb" tick={{ fontSize: 11 }} width={46} />
        <Tooltip contentStyle={{ background: "#10192a", border: "1px solid #2c3e5c", fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {lines.map(([key, name, color]) => (
          <Line key={key} type="monotone" dataKey={key} name={name} stroke={color} dot={false} strokeWidth={1.6} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
