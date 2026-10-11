import { describe, expect, it } from "vitest";
import { stepWaterLevel } from "@/lib/physics/continuity";
import { cavitationNumber, eulerNumber, froudeNumber, reynoldsNumber, weberNumber } from "@/lib/physics/dimensionless";
import { hydraulicDiameter, orificeArea, theoreticalOrificeFlow } from "@/lib/physics/orifice";
import { dynamicViscosityFromKinematic, kinematicViscosity, waterPropertiesAtTemperature } from "@/lib/physics/properties";
import { stableTimeStep } from "@/lib/physics/stability";
import { validateParameters } from "@/lib/parameters";
import { DEFAULT_PARAMETERS } from "@/lib/parameters";

describe("トリチェリの定理と流量", () => {
  it("理想流速は √(2gh) になる", () => {
    const gravity = 9.80665;
    const depth = 2;
    const flow = theoreticalOrificeFlow(
      {
        orificeShape: "rectangular",
        orificeWidth: 0.5,
        orificeHeight: 0.2,
        dischargeCoefficient: 1,
        gravity,
        damHeight: 5,
      },
      4,
      2,
    );
    expect(flow.centroidDepth).toBeCloseTo(2, 12);
    expect(flow.theoreticalVelocity).toBeCloseTo(Math.sqrt(2 * gravity * depth), 12);
    expect(flow.theoreticalDischarge).toBeCloseTo(0.5 * 0.2 * Math.sqrt(2 * gravity * depth), 12);
  });

  it("流出係数を含む流量 Q = C_d A √(2gh) になる", () => {
    const flow = theoreticalOrificeFlow(
      {
        orificeShape: "rectangular",
        orificeWidth: 0.3,
        orificeHeight: 0.25,
        dischargeCoefficient: 0.62,
        gravity: 9.80665,
        damHeight: 6,
      },
      3,
      1.5,
    );
    const velocity = Math.sqrt(2 * 9.80665 * 1.5);
    expect(flow.theoreticalVelocity).toBeCloseTo(velocity, 12);
    expect(flow.theoreticalDischarge).toBeCloseTo(0.62 * 0.3 * 0.25 * velocity, 12);
    expect(flow.dischargeVelocity).toBeCloseTo(0.62 * velocity, 12);
  });

  it("円形開口の面積は πD²/4 になる", () => {
    expect(orificeArea("circular", 1, 0.2)).toBeCloseTo((Math.PI * 0.2 * 0.2) / 4, 12);
    expect(hydraulicDiameter("circular", 1, 0.2).value).toBeCloseTo(0.2, 12);
  });

  it("水面より上では流量が0になる", () => {
    const flow = theoreticalOrificeFlow(
      {
        orificeShape: "rectangular",
        orificeWidth: 0.2,
        orificeHeight: 0.2,
        dischargeCoefficient: 0.7,
        gravity: 9.81,
        damHeight: 4,
      },
      1,
      2,
    );
    expect(flow.dry).toBe(true);
    expect(flow.theoreticalDischarge).toBe(0);
  });
});

describe("水位収支", () => {
  it("A dh/dt = Qin - Qout を陽的に積分する", () => {
    const next = stepWaterLevel(3, 10, 1, 3, 0.5);
    expect(next).toBeCloseTo(2.9, 12);
  });
});

describe("物性と無次元数", () => {
  it("動粘度は μ/ρ である", () => {
    expect(kinematicViscosity(1.002e-3, 998.2)).toBeCloseTo(1.002e-3 / 998.2, 12);
    expect(dynamicViscosityFromKinematic(1e-6, 1000)).toBeCloseTo(1e-3, 12);
  });

  it("20℃の水テーブルを返す", () => {
    const water = waterPropertiesAtTemperature(20);
    expect(water.density).toBeCloseTo(998.2, 6);
    expect(water.vaporPressure).toBeCloseTo(2339, 6);
  });

  it("レイノルズ数・フルード数・ウェーバー数・オイラー数・キャビテーション数", () => {
    expect(reynoldsNumber(2, 0.5, 1e-6)).toBeCloseTo(1e6, 6);
    expect(froudeNumber(2, 9.80665, 0.5)).toBeCloseTo(2 / Math.sqrt(9.80665 * 0.5), 10);
    expect(weberNumber(1000, 2, 0.5, 0.072)).toBeCloseTo((1000 * 4 * 0.5) / 0.072, 10);
    expect(eulerNumber(5000, 1000, 2)).toBeCloseTo(5000 / 4000, 10);
    expect(cavitationNumber(101325, 2339, 1000, 2)).toBeCloseTo((101325 - 2339) / (0.5 * 1000 * 4), 8);
  });
});

describe("時間刻みの安定条件", () => {
  it("大きな要求刻みをCFL条件で制限する", () => {
    const limit = stableTimeStep(10, 2, 0.1, 0.1, 1e-6, 9.80665);
    expect(limit.dt).toBeLessThan(0.03);
    expect(limit.cflLimited).toBe(true);
    expect(limit.dt).toBeCloseTo((0.45 * 0.1) / 2, 12);
  });
});

describe("パラメータ検証", () => {
  it("水深がダム高さを超えると警告する", () => {
    const messages = validateParameters({ ...DEFAULT_PARAMETERS, waterDepth: 8, damHeight: 4 });
    expect(messages.some((message) => message.level === "warning" && message.message.includes("ダム高さ"))).toBe(true);
  });
});
