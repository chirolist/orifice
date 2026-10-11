import { reservoirArea, stepWaterLevel } from "@/lib/physics/continuity";
import { cavitationNumber, eulerNumber, flowRegimeNote, froudeNumber, reynoldsNumber, weberNumber } from "@/lib/physics/dimensionless";
import { hydraulicDiameter, orificeArea, theoreticalOrificeFlow } from "@/lib/physics/orifice";
import { kinematicViscosity } from "@/lib/physics/properties";
import { clampParameters } from "@/lib/parameters";
import { TracerSet, type VelocitySample } from "@/lib/particles/tracers";
import { bilinearClamp } from "@/lib/solver/sampling";
import { buildGridMetrics, cellIndex, classifyCells, type GridMetrics, uIndex, vIndex } from "@/lib/solver/grid";
import {
  CELL_FLUID,
  UNIMPLEMENTED_PHYSICS,
  type Diagnostics,
  type FrameSnapshot,
  type SimulationParameters,
  type TheoreticalFlow,
  type VelocityFieldView,
} from "@/types/simulation";

export interface FluidEngine {
  initialize(parameters: SimulationParameters): void;
  step(deltaTime: number): void;
  getVelocityField(): VelocityFieldView;
  getPressureField(): Float64Array;
  getVorticityField(): Float64Array;
  getDiagnostics(): Diagnostics;
  reset(): void;
  dispose(): void;
  exportFrame(): FrameSnapshot;
}

type Side = "fluid" | "open" | "blocked";

export abstract class FluidEngineBase implements FluidEngine {
  protected params: SimulationParameters = clampParameters({
    waterDepth: 1,
    damHeight: 1,
    orificeWidth: 0.2,
    orificeHeight: 0.2,
    orificeDepth: 0.4,
    orificeShape: "rectangular",
    density: 998.2,
    dynamicViscosity: 0.001,
    gravity: 9.80665,
    surfaceTension: 0.072,
    atmosphericPressure: 101325,
    dischargeCoefficient: 0.62,
    inflowRate: 0,
    resolution: 20,
    timeStep: 0.004,
    particleCount: 0,
    turbulenceModel: "laminar",
    simulationSpeed: 1,
    solverKind: "navier-stokes",
    integrator: "rk2",
    pressureMethod: "sor",
    advectionScheme: "semi-lagrangian",
    domainMode: "free-discharge",
    reservoirLength: 2,
    reservoirWidth: 2,
    downstreamLength: 2,
    damThickness: 0.3,
    vaporPressure: 2339,
    particleLifetime: 8,
    smagorinskyConstant: 0.12,
    pressureIterations: 20,
  });

  protected original: SimulationParameters = this.params;
  protected grid: GridMetrics = buildGridMetrics(this.params);
  protected waterLevel = 1;
  protected orificeElevation = 0.5;
  protected cell = new Uint8Array(0);
  protected u = new Float64Array(0);
  protected v = new Float64Array(0);
  protected p = new Float64Array(0);
  protected vorticity = new Float64Array(0);
  protected time = 0;
  protected stepCount = 0;
  protected massBalanceError = 0;
  protected failed = false;
  protected failMessage = "";
  protected lastDt = 0;
  protected requestedDt = 0;
  protected cflLimited = false;
  protected viscousLimited = false;
  protected stepTruncated = false;
  protected pressureIterationCount = 0;
  protected pressureResidual = 0;
  protected computeMs = 0;
  protected tracers = new TracerSet();
  private diagnosticCache: Diagnostics | null = null;
  private cacheStep = -1;
  protected disposed = false;

  abstract get solverLabel(): string;

  initialize(parameters: SimulationParameters): void {
    this.original = { ...parameters };
    this.params = clampParameters(parameters);
    this.waterLevel = this.params.waterDepth;
    this.orificeElevation = this.params.waterDepth - parameters.orificeDepth;
    this.grid = buildGridMetrics(this.params);
    this.allocate();
    this.time = 0;
    this.stepCount = 0;
    this.massBalanceError = 0;
    this.failed = false;
    this.failMessage = "";
    this.lastDt = 0;
    this.requestedDt = 0;
    this.cflLimited = false;
    this.viscousLimited = false;
    this.stepTruncated = false;
    this.disposed = false;
    this.pressureIterationCount = 0;
    this.pressureResidual = 0;
    this.computeMs = 0;
    this.classify();
    this.resetFields();
    this.seedParticles();
    this.invalidate();
  }

  reset(): void {
    this.initialize(this.original);
  }

  dispose(): void {
    this.disposed = true;
    this.cell = new Uint8Array(0);
    this.u = new Float64Array(0);
    this.v = new Float64Array(0);
    this.p = new Float64Array(0);
    this.vorticity = new Float64Array(0);
    this.tracers.seed(0, [], 1);
  }

  abstract step(deltaTime: number): void;

  getVelocityField(): VelocityFieldView {
    return {
      u: this.u,
      v: this.v,
      nx: this.grid.nx,
      ny: this.grid.ny,
      dx: this.grid.dx,
      dy: this.grid.dy,
    };
  }

  getPressureField(): Float64Array {
    return this.p;
  }

  getVorticityField(): Float64Array {
    this.getDiagnostics();
    return this.vorticity;
  }

  getDiagnostics(): Diagnostics {
    if (this.diagnosticCache && this.cacheStep === this.stepCount && this.cacheTime() === this.time) {
      return this.diagnosticCache;
    }
    this.diagnosticCache = this.computeDiagnostics();
    this.cacheStep = this.stepCount;
    return this.diagnosticCache;
  }

  exportFrame(): FrameSnapshot {
    const diagnostics = this.getDiagnostics();
    const { nx, ny } = this.grid;
    const count = nx * ny;
    const speed = new Float32Array(count);
    const uCenter = new Float32Array(count);
    const vCenter = new Float32Array(count);
    const pressure = new Float32Array(count);
    const vorticity = new Float32Array(count);
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const index = cellIndex(i, j, nx);
        const velocity = this.centeredVelocity(i, j);
        uCenter[index] = velocity.u;
        vCenter[index] = velocity.v;
        speed[index] = Math.hypot(velocity.u, velocity.v);
        pressure[index] = this.p[index];
        vorticity[index] = this.vorticity[index];
      }
    }
    const particles = this.tracers.count;
    return {
      diagnostics,
      nx,
      ny,
      dx: this.grid.dx,
      dy: this.grid.dy,
      reservoirLength: this.grid.reservoirLength,
      damThickness: this.grid.damThickness,
      downstreamLength: this.grid.downstreamLength,
      damHeight: this.grid.damHeight,
      waterLevel: this.waterLevel,
      orificeBottom: this.currentTheory().orificeBottom,
      orificeTop: this.currentTheory().orificeTop,
      cell: new Uint8Array(this.cell),
      speed,
      uCenter,
      vCenter,
      pressure,
      vorticity,
      particlesX: Float32Array.from(this.tracers.x),
      particlesY: Float32Array.from(this.tracers.y),
      particlesVx: Float32Array.from(this.tracers.vx),
      particlesVy: Float32Array.from(this.tracers.vy),
      particlesAge: Float32Array.from(this.tracers.age),
      particlesKinematic: new Uint8Array(this.tracers.kinematic),
      particleCount: particles,
      trailGeneration: this.tracers.generation,
    };
  }

  clearTrails(): void {
    this.tracers.clearTrails();
  }

  protected abstract resetFields(): void;

  protected invalidate(): void {
    this.diagnosticCache = null;
  }

  protected allocate(): void {
    const { nx, ny } = this.grid;
    this.cell = new Uint8Array(nx * ny);
    this.u = new Float64Array((nx + 1) * ny);
    this.v = new Float64Array(nx * (ny + 1));
    this.p = new Float64Array(nx * ny);
    this.vorticity = new Float64Array(nx * ny);
  }

  protected classify(): number {
    const theory = this.currentTheory();
    return classifyCells(
      this.cell,
      this.grid,
      this.waterLevel,
      theory.orificeBottom,
      theory.orificeTop,
      this.params.domainMode,
    );
  }

  protected currentTheory(): TheoreticalFlow {
    return theoreticalOrificeFlow(this.params, this.waterLevel, this.orificeElevation);
  }

  protected advanceWater(dt: number, outflow: number): void {
    const area = reservoirArea(this.grid.reservoirLength, this.params.reservoirWidth);
    const previous = this.waterLevel;
    const unclamped = stepWaterLevel(previous, area, this.params.inflowRate, outflow, dt);
    const clamped = Math.min(this.grid.damHeight, Math.max(0, unclamped));
    this.massBalanceError += (this.params.inflowRate - outflow) * dt - area * (clamped - previous);
    this.waterLevel = clamped;
    this.classify();
    this.zeroBlockedFaces();
  }

  protected seedParticles(): void {
    this.tracers.seed(this.params.particleCount, this.reservoirSpots(), (this.stepCount + 1) * 997);
  }

  protected advanceParticles(dt: number): void {
    const spots = this.reservoirSpots();
    this.tracers.step(
      dt,
      spots,
      (x, y) => this.sampleAt(x, y),
      (x, y) => this.isSolidWorld(x, y),
      this.params.gravity,
      this.params.integrator,
      this.params.particleLifetime,
      { width: this.grid.nx * this.grid.dx, height: this.grid.damHeight },
    );
  }

  protected reservoirSpots(): { x: number; y: number }[] {
    const spots: { x: number; y: number }[] = [];
    const { nx, ny, dx, dy, reservoirCells } = this.grid;
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < reservoirCells; i += 1) {
        if (this.cell[cellIndex(i, j, nx)] !== CELL_FLUID) continue;
        spots.push({ x: (i + 0.5) * dx, y: (j + 0.5) * dy });
      }
    }
    return spots;
  }

  protected sampleAt(x: number, y: number): VelocitySample {
    const { nx, ny, dx, dy, damHeight } = this.grid;
    const width = nx * dx;
    if (x < 0 || y < 0 || x >= width || y >= damHeight) return { u: 0, v: 0, valid: false, solid: y < 0 };
    const i = Math.min(nx - 1, Math.floor(x / dx));
    const j = Math.min(ny - 1, Math.floor(y / dy));
    const type = this.cell[cellIndex(i, j, nx)];
    if (type !== CELL_FLUID) return { u: 0, v: 0, valid: false, solid: type === 0 };
    return { u: this.sampleU(x, y), v: this.sampleV(x, y), valid: true, solid: false };
  }

  protected isSolidWorld(x: number, y: number): boolean {
    if (y < 0) return true;
    const { nx, dx, dy, damHeight } = this.grid;
    if (x < 0 || y >= damHeight || x >= nx * dx) return false;
    const i = Math.min(nx - 1, Math.floor(x / dx));
    const j = Math.min(this.grid.ny - 1, Math.floor(y / dy));
    return this.cell[cellIndex(i, j, nx)] === 0;
  }

  protected sampleU(x: number, y: number): number {
    const { dx, dy, nx, ny } = this.grid;
    return bilinearClamp(this.u, nx + 1, nx + 1, ny, x / dx, y / dy - 0.5);
  }

  protected sampleV(x: number, y: number): number {
    const { dx, dy, nx, ny } = this.grid;
    return bilinearClamp(this.v, nx, nx, ny + 1, x / dx - 0.5, y / dy);
  }

  protected iu(i: number, j: number): number {
    return uIndex(i, j, this.grid.nx);
  }

  protected iv(i: number, j: number): number {
    return vIndex(i, j, this.grid.nx);
  }

  protected sideOf(i: number, j: number): Side {
    const { nx, ny } = this.grid;
    if (j < 0 || j >= ny || i < 0) return "blocked";
    if (i >= nx) return this.params.domainMode === "downstream-channel" ? "open" : "blocked";
    const type = this.cell[cellIndex(i, j, nx)];
    if (type === CELL_FLUID) return "fluid";
    if (type === 3) return "open";
    return "blocked";
  }

  protected faceProjects(a: Side, b: Side): boolean {
    if (a === "blocked" || b === "blocked") return false;
    return a === "fluid" || b === "fluid";
  }

  protected zeroBlockedFaces(): void {
    const { nx, ny } = this.grid;
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i <= nx; i += 1) {
        if (!this.faceProjects(this.sideOf(i - 1, j), this.sideOf(i, j))) this.u[this.iu(i, j)] = 0;
      }
    }
    for (let j = 0; j <= ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        if (!this.faceProjects(this.sideOf(i, j - 1), this.sideOf(i, j))) this.v[this.iv(i, j)] = 0;
      }
    }
  }

  protected measureExit(): { meanVelocity: number; discharge: number; height: number } {
    const theory = this.currentTheory();
    if (theory.dry || theory.submergedHeight <= 0) return { meanVelocity: 0, discharge: 0, height: 0 };
    const { ny, dy, nx, reservoirCells, damCells } = this.grid;
    const iCell = reservoirCells + damCells - 1;
    const iFace = reservoirCells + damCells;
    if (iCell < 0 || iFace > nx) return { meanVelocity: 0, discharge: 0, height: 0 };
    let flux = 0;
    let height = 0;
    for (let j = 0; j < ny; j += 1) {
      const y = (j + 0.5) * dy;
      if (y < theory.orificeBottom || y >= theory.orificeTop) continue;
      if (this.cell[cellIndex(iCell, j, nx)] !== CELL_FLUID) continue;
      flux += this.u[this.iu(iFace, j)] * dy;
      height += dy;
    }
    if (height <= 0) return { meanVelocity: 0, discharge: 0, height: 0 };
    const fullHeight = Math.max(theory.orificeTop - theory.orificeBottom, 1e-9);
    const fullArea = orificeArea(this.params.orificeShape, this.params.orificeWidth, this.params.orificeHeight);
    const area = fullArea * (height / fullHeight);
    return { meanVelocity: flux / height, discharge: (flux / height) * area, height };
  }

  protected maxFaceSpeed(): number {
    let max = 0;
    for (let i = 0; i < this.u.length; i += 1) max = Math.max(max, Math.abs(this.u[i]));
    for (let i = 0; i < this.v.length; i += 1) max = Math.max(max, Math.abs(this.v[i]));
    return max;
  }

  protected centeredVelocity(i: number, j: number): { u: number; v: number } {
    const { nx } = this.grid;
    if (this.cell[cellIndex(i, j, nx)] !== CELL_FLUID) return { u: 0, v: 0 };
    return {
      u: 0.5 * (this.u[this.iu(i, j)] + this.u[this.iu(i + 1, j)]),
      v: 0.5 * (this.v[this.iv(i, j)] + this.v[this.iv(i, j + 1)]),
    };
  }

  protected updateVorticity(): void {
    const { nx, ny, dx, dy } = this.grid;
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const index = cellIndex(i, j, nx);
        if (this.cell[index] !== CELL_FLUID) {
          this.vorticity[index] = 0;
          continue;
        }
        const left = i > 0 ? this.centeredVelocity(i - 1, j).v : this.centeredVelocity(i, j).v;
        const right = i < nx - 1 ? this.centeredVelocity(i + 1, j).v : this.centeredVelocity(i, j).v;
        const below = j > 0 ? this.centeredVelocity(i, j - 1).u : this.centeredVelocity(i, j).u;
        const above = j < ny - 1 ? this.centeredVelocity(i, j + 1).u : this.centeredVelocity(i, j).u;
        const dvdx = i > 0 && i < nx - 1 ? (right - left) / (2 * dx) : (right - left) / dx;
        const dudy = j > 0 && j < ny - 1 ? (above - below) / (2 * dy) : (above - below) / dy;
        this.vorticity[index] = dvdx - dudy;
      }
    }
  }

  protected assertFinite(): void {
    const fields = [this.u, this.v, this.p];
    for (const field of fields) {
      for (let i = 0; i < field.length; i += 1) {
        const value = field[i];
        if (!Number.isFinite(value) || Math.abs(value) > 1e7) {
          this.failed = true;
          this.failMessage = "速度または圧力が発散したため計算を停止しました。時間刻みを小さくするか、解像度と粘性を見直して再開してください。";
          field[i] = 0;
          return;
        }
      }
    }
  }

  protected fillHydrostatic(): void {
    const { nx, ny, dy } = this.grid;
    const rho = this.params.density;
    const g = this.params.gravity;
    for (let j = 0; j < ny; j += 1) {
      const y = (j + 0.5) * dy;
      const pressure = rho * g * Math.max(0, this.waterLevel - y);
      for (let i = 0; i < nx; i += 1) {
        const index = cellIndex(i, j, nx);
        this.p[index] = this.cell[index] === CELL_FLUID ? pressure : 0;
      }
    }
  }

  private cacheTime(): number {
    return this.time;
  }

  private computeDiagnostics(): Diagnostics {
    this.updateVorticity();
    const theory = this.currentTheory();
    const exit = this.measureExit();
    const { nx, ny, dx, dy } = this.grid;
    let fluid = 0;
    let pressureSum = 0;
    let minGauge = Number.POSITIVE_INFINITY;
    let maxSpeed = 0;
    let kinetic = 0;
    let potential = 0;
    let divSum = 0;
    let divMax = 0;
    let wallDivSum = 0;
    let wallDivCount = 0;
    let wallSpeed = 0;
    const profile: { y: number; pressure: number }[] = [];
    const profileI = Math.max(0, this.grid.reservoirCells - 1);
    const orificePressures: number[] = [];

    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const index = cellIndex(i, j, nx);
        if (this.cell[index] !== CELL_FLUID) continue;
        fluid += 1;
        const velocity = this.centeredVelocity(i, j);
        const speed = Math.hypot(velocity.u, velocity.v);
        maxSpeed = Math.max(maxSpeed, speed);
        pressureSum += this.p[index];
        minGauge = Math.min(minGauge, this.p[index]);
        kinetic += 0.5 * this.params.density * speed * speed * dx * dy;
        potential += this.params.density * this.params.gravity * (j + 0.5) * dy * dx * dy;
        const div = (this.u[this.iu(i + 1, j)] - this.u[this.iu(i, j)]) / dx + (this.v[this.iv(i, j + 1)] - this.v[this.iv(i, j)]) / dy;
        divSum += div * div;
        divMax = Math.max(divMax, Math.abs(div));
        const blockedNeighbor =
          this.sideOf(i - 1, j) === "blocked" ||
          this.sideOf(i + 1, j) === "blocked" ||
          this.sideOf(i, j - 1) === "blocked" ||
          this.sideOf(i, j + 1) === "blocked";
        if (blockedNeighbor) {
          wallDivSum += Math.abs(div);
          wallDivCount += 1;
        }
        const y = (j + 0.5) * dy;
        if (y >= theory.orificeBottom && y < theory.orificeTop && i >= this.grid.reservoirCells && i < this.grid.reservoirCells + this.grid.damCells) {
          orificePressures.push(this.p[index]);
        }
      }
      const y = (j + 0.5) * dy;
      profile.push({ y, pressure: this.p[cellIndex(profileI, j, nx)] ?? 0 });
    }

    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i <= nx; i += 1) {
        const projects = this.faceProjects(this.sideOf(i - 1, j), this.sideOf(i, j));
        if (!projects) wallSpeed = Math.max(wallSpeed, Math.abs(this.u[this.iu(i, j)]));
      }
    }

    const nu = kinematicViscosity(this.params.dynamicViscosity, this.params.density);
    const diameter = hydraulicDiameter(this.params.orificeShape, this.params.orificeWidth, this.params.orificeHeight);
    const useNumerical = this.params.solverKind === "analytical" ? Math.abs(exit.meanVelocity) > 0 : Math.abs(exit.meanVelocity) > Math.max(0.05, 0.15 * theory.theoreticalVelocity);
    const representative = useNumerical ? Math.abs(exit.meanVelocity) : theory.theoreticalVelocity;
    const velocitySource = useNumerical
      ? this.params.solverKind === "analytical"
        ? "解析速度場の出口平均流速"
        : "数値解の出口平均流速"
      : "トリチェリの理論流速 √(2gh)";
    const deltaP = this.params.density * this.params.gravity * theory.centroidDepth;
    const meanOrificePressure = orificePressures.length > 0 ? orificePressures.reduce((sum, value) => sum + value, 0) / orificePressures.length : 0;
    const minAbsolute = Number.isFinite(minGauge) ? minGauge + this.params.atmosphericPressure : null;
    const cavitation = representative > 0 && minAbsolute !== null
      ? cavitationNumber(minAbsolute, this.params.vaporPressure, this.params.density, representative)
      : null;
    const area = reservoirArea(this.grid.reservoirLength, this.params.reservoirWidth);
    const warnings = [...this.modelWarnings(theory)];
    if (this.failed) warnings.unshift(this.failMessage);
    if (this.cflLimited) warnings.push("時間刻みはCFL条件により要求値より小さくしています。");
    if (this.viscousLimited) warnings.push("時間刻みは粘性項の安定条件により要求値より小さくしています。");
    if (this.stepTruncated) warnings.push("1回のステップ内で安定な時間刻みを積みきれず、要求した時間より短く進みました。");
    if (minGauge < 0 && minAbsolute !== null && minAbsolute > this.params.vaporPressure) {
      warnings.push("ゲージ圧が負のセルがあります。絶対圧力は蒸気圧より高いので、これだけではキャビテーションではありません。");
    }
    if (minAbsolute !== null && minAbsolute < this.params.vaporPressure) {
      warnings.push("最小絶対圧力が設定蒸気圧を下回りました。相変化は解いていないため、キャビテーションが起きたとは判定しません。");
    }

    return {
      time: this.time,
      stepCount: this.stepCount,
      computeMilliseconds: this.computeMs,
      waterLevel: this.waterLevel,
      orificeCenterDepth: Math.max(0, this.waterLevel - theory.orificeElevation),
      orificeElevation: theory.orificeElevation,
      orificeArea: theory.area,
      submergedHeight: theory.submergedHeight,
      theoreticalVelocity: theory.theoreticalVelocity,
      numericalMeanVelocity: exit.meanVelocity,
      theoreticalDischarge: theory.theoreticalDischarge,
      numericalDischarge: exit.discharge,
      meanPressure: fluid > 0 ? pressureSum / fluid : 0,
      maxSpeed,
      minGaugePressure: Number.isFinite(minGauge) ? minGauge : 0,
      reynolds: reynoldsNumber(representative, diameter.value, nu),
      reynoldsDefinition: "Re = UL/ν。L は水力直径、U は下に示した代表流速です。",
      froude: froudeNumber(representative, this.params.gravity, diameter.value),
      froudeDefinition: "Fr = U / √(gL)。L はレイノルズ数と同じ水力直径です。",
      weber: weberNumber(this.params.density, representative, diameter.value, this.params.surfaceTension),
      weberDefinition: "We = ρU²L/σ。表面張力は指標の計算だけに使い、界面形状は変えていません。",
      euler: eulerNumber(deltaP, this.params.density, representative),
      eulerDefinition: "Eu = Δp/(ρU²)、Δp = ρgh。分母を ½ρU² にする定義では、理想トリチェリで 1 になります。",
      eulerNumerical: this.params.solverKind === "navier-stokes" && representative > 0.05
        ? eulerNumber(meanOrificePressure, this.params.density, representative)
        : null,
      cavitation,
      cavitationDefinition: "σ = (p_abs − p_v) / (½ρU²)。p_abs は計算された最小ゲージ圧に大気圧を加えた値です。",
      minAbsolutePressure: minAbsolute,
      kineticEnergy: kinetic,
      potentialEnergy: potential,
      energyUnit: "J/m",
      divergenceL2: fluid > 0 ? Math.sqrt(divSum / fluid) : 0,
      divergenceLinf: divMax,
      nearWallDivergence: wallDivCount > 0 ? wallDivSum / wallDivCount : 0,
      wallNormalSpeed: wallSpeed,
      massBalanceError: this.massBalanceError,
      actualTimeStep: this.lastDt,
      requestedTimeStep: this.requestedDt,
      cflLimited: this.cflLimited,
      viscousLimited: this.viscousLimited,
      pressureIterations: this.pressureIterationCount,
      pressureResidual: this.pressureResidual,
      solverKind: this.params.solverKind,
      turbulenceModel: this.params.turbulenceModel,
      domainMode: this.params.domainMode,
      modelLabel: this.solverLabel,
      velocitySource: this.velocitySourceText(),
      flowRegimeNote: flowRegimeNote(reynoldsNumber(representative, diameter.value, nu)),
      representativeVelocity: representative,
      representativeVelocitySource: velocitySource,
      representativeLength: diameter.value,
      hydraulicDiameterNote: diameter.note,
      gridReynolds: reynoldsNumber(representative, dx, nu),
      nonFinite: this.failed,
      approximations: this.approximations(),
      unimplemented: UNIMPLEMENTED_PHYSICS,
      warningMessages: warnings,
      pressureProfile: profile,
      reservoirArea: area,
      belowVaporPressure: minAbsolute !== null && minAbsolute < this.params.vaporPressure,
      cavitationModelActive: false,
      surfaceTensionForceActive: false,
      cellCount: nx * ny,
      fluidCellCount: fluid,
    };
  }

  protected abstract velocitySourceText(): string;

  protected abstract approximations(): string[];

  protected modelWarnings(theory: TheoreticalFlow): string[] {
    const warnings: string[] = [];
    if (theory.partial) warnings.push("オリフィスは部分水没です。理論式は水没部の重心水深を使った近似です。");
    if (theory.dry) warnings.push("オリフィスが水面より上にあるため、理論流量は0です。");
    if (this.params.turbulenceModel === "dns-attempt" && this.params.resolution < 64) {
      warnings.push("高解像度モードとしては格子が粗いです。2次元の細分化であり、3次元DNSではありません。");
    }
    const nu = kinematicViscosity(this.params.dynamicViscosity, this.params.density);
    const gridRe = reynoldsNumber(theory.theoreticalVelocity, this.grid.dx, nu);
    if (this.params.solverKind === "navier-stokes" && Number.isFinite(gridRe) && gridRe > 20) {
      warnings.push("格子レイノルズ数が大きく、設定した分子粘性より数値拡散が優勢になり得ます。");
    }
    return warnings;
  }
}
