import { describe, expect, it } from "vitest";
import { stepWaterLevel } from "@/lib/physics/continuity";
import { DEFAULT_PARAMETERS } from "@/lib/parameters";
import { AnalyticalEngine } from "@/lib/solver/analytical";
import { NavierStokesEngine } from "@/lib/solver/navierStokes";
import type { SimulationParameters } from "@/types/simulation";

function params(overrides: Partial<SimulationParameters> = {}): SimulationParameters {
  return { ...DEFAULT_PARAMETERS, particleCount: 0, ...overrides };
}

describe("解析モデル", () => {
  const analyticalParams = params({
    solverKind: "analytical",
    waterDepth: 3,
    damHeight: 4,
    orificeDepth: 1,
    orificeHeight: 0.4,
    orificeWidth: 0.3,
    dischargeCoefficient: 0.62,
    resolution: 20,
    reservoirLength: 4,
    reservoirWidth: 2,
    damThickness: 0.4,
    downstreamLength: 2,
    inflowRate: 0,
    gravity: 9.80665,
  });

  it("出口平均流速は C_d√(2gh)、理論流速は √(2gh) になる", () => {
    const engine = new AnalyticalEngine();
    engine.initialize(analyticalParams);
    const diagnostics = engine.getDiagnostics();
    const ideal = Math.sqrt(2 * 9.80665 * 1);
    expect(diagnostics.theoreticalVelocity).toBeCloseTo(ideal, 8);
    expect(diagnostics.numericalMeanVelocity).toBeCloseTo(0.62 * ideal, 6);
    expect(diagnostics.theoreticalDischarge).toBeGreaterThan(0);
    expect(diagnostics.numericalDischarge).toBeCloseTo(diagnostics.theoreticalDischarge, 4);
    expect(diagnostics.nonFinite).toBe(false);
  });

  it("流入と理論流出の差だけ水位が変わる", () => {
    const engine = new AnalyticalEngine();
    engine.initialize(analyticalParams);
    const before = engine.getDiagnostics();
    const dt = 0.01;
    engine.step(dt);
    const after = engine.getDiagnostics();
    const expected = stepWaterLevel(before.waterLevel, before.reservoirArea, analyticalParams.inflowRate, before.theoreticalDischarge, dt);
    expect(after.waterLevel).toBeCloseTo(expected, 8);
    expect(Math.abs(after.massBalanceError)).toBeLessThan(1e-8);
  });

  it("粒子は解析速度場を参照して速度を持つ", () => {
    const engine = new AnalyticalEngine();
    engine.initialize({ ...analyticalParams, particleCount: 40, integrator: "rk4" });
    engine.step(0.05);
    const frame = engine.exportFrame();
    const moving = Array.from(frame.particlesVx).some((velocity, index) => Math.hypot(velocity, frame.particlesVy[index]) > 1e-4);
    expect(moving).toBe(true);
  });

  it("リセットで時刻と水位が初期値に戻る", () => {
    const engine = new AnalyticalEngine();
    engine.initialize(analyticalParams);
    engine.step(0.05);
    engine.reset();
    const diagnostics = engine.getDiagnostics();
    expect(diagnostics.time).toBe(0);
    expect(diagnostics.waterLevel).toBeCloseTo(3, 8);
    expect(diagnostics.stepCount).toBe(0);
  });
});

describe("ナビエ・ストークス", () => {
  const closed = params({
    solverKind: "navier-stokes",
    waterDepth: 4,
    damHeight: 4,
    orificeHeight: 0,
    orificeDepth: 0,
    resolution: 16,
    reservoirLength: 3,
    downstreamLength: 1,
    damThickness: 0.5,
    dynamicViscosity: 0,
    pressureIterations: 40,
    pressureMethod: "sor",
    timeStep: 0.002,
    domainMode: "free-discharge",
  });

  it("閉じた水槽では静水圧が重力と釣り合い流速が残らない", () => {
    const engine = new NavierStokesEngine();
    engine.initialize(closed);
    for (let i = 0; i < 20; i += 1) engine.step(0.002);
    const diagnostics = engine.getDiagnostics();
    expect(diagnostics.nonFinite).toBe(false);
    expect(diagnostics.maxSpeed).toBeLessThan(0.02);
    expect(diagnostics.divergenceL2).toBeLessThan(0.02);
    expect(diagnostics.wallNormalSpeed).toBeLessThan(1e-8);
  });

  it("オリフィスを開くと下流向きの流出が生じ、発散は投影後に小さい", () => {
    const open = params({
      solverKind: "navier-stokes",
      waterDepth: 3,
      damHeight: 4,
      orificeDepth: 1,
      orificeHeight: 0.4,
      orificeWidth: 0.3,
      resolution: 20,
      reservoirLength: 3,
      damThickness: 0.4,
      downstreamLength: 1.6,
      dynamicViscosity: 0,
      pressureIterations: 30,
      timeStep: 0.004,
      inflowRate: 0,
      domainMode: "free-discharge",
      advectionScheme: "semi-lagrangian",
    });
    const engine = new NavierStokesEngine();
    engine.initialize(open);
    const theory = engine.getDiagnostics().theoreticalVelocity;
    for (let i = 0; i < 50; i += 1) engine.step(0.004);
    const diagnostics = engine.getDiagnostics();
    expect(diagnostics.nonFinite).toBe(false);
    expect(diagnostics.numericalMeanVelocity).toBeGreaterThan(0.25 * theory);
    expect(diagnostics.numericalMeanVelocity).toBeLessThan(2.5 * theory);
    expect(diagnostics.numericalDischarge).toBeGreaterThan(0);
    expect(diagnostics.divergenceL2).toBeLessThan(0.35);
    expect(diagnostics.wallNormalSpeed).toBeLessThan(1e-6);
    expect(Math.abs(diagnostics.massBalanceError)).toBeLessThan(1e-6);
  });

  it("格子解像度を変えても有限な流出になる", () => {
    const run = (resolution: number) => {
      const engine = new NavierStokesEngine();
      engine.initialize(params({
        waterDepth: 3,
        damHeight: 4,
        orificeDepth: 1,
        orificeHeight: 0.8,
        orificeWidth: 0.4,
        resolution,
        reservoirLength: 2.5,
        damThickness: 0.4,
        downstreamLength: 1.2,
        dynamicViscosity: 1e-3,
        pressureIterations: 20,
        timeStep: 0.005,
        domainMode: "free-discharge",
      }));
      for (let i = 0; i < 20; i += 1) engine.step(0.005);
      return engine.getDiagnostics();
    };
    const coarse = run(20);
    const finer = run(32);
    expect(coarse.nonFinite).toBe(false);
    expect(finer.nonFinite).toBe(false);
    expect(coarse.numericalDischarge).toBeGreaterThan(0);
    expect(finer.numericalDischarge).toBeGreaterThan(0);
    const ratio = coarse.numericalDischarge / finer.numericalDischarge;
    expect(ratio).toBeGreaterThan(0.2);
    expect(ratio).toBeLessThan(5);
  });

  it("過大な時間刻みは安定条件で短縮され、発散しない", () => {
    const engine = new NavierStokesEngine();
    engine.initialize(params({
      waterDepth: 3,
      damHeight: 4,
      orificeDepth: 1,
      orificeHeight: 0.4,
      resolution: 20,
      dynamicViscosity: 1e-3,
      pressureIterations: 16,
      domainMode: "free-discharge",
    }));
    engine.step(1);
    const diagnostics = engine.getDiagnostics();
    expect(diagnostics.nonFinite).toBe(false);
    expect(diagnostics.actualTimeStep).toBeLessThan(0.2);
    expect(diagnostics.cflLimited || diagnostics.stepCount === 1).toBe(true);
  });

  it("風上差分・Jacobi・Smagorinsky でも有限のまま進む", () => {
    const engine = new NavierStokesEngine();
    engine.initialize(params({
      waterDepth: 3,
      damHeight: 4,
      orificeDepth: 1.2,
      orificeHeight: 0.4,
      resolution: 20,
      pressureMethod: "jacobi",
      advectionScheme: "upwind",
      turbulenceModel: "smagorinsky",
      pressureIterations: 16,
      domainMode: "downstream-channel",
      downstreamLength: 1.5,
    }));
    for (let i = 0; i < 8; i += 1) engine.step(0.004);
    const diagnostics = engine.getDiagnostics();
    expect(diagnostics.nonFinite).toBe(false);
    expect(diagnostics.maxSpeed).toBeLessThan(100);
  });
});
