import { kinematicViscosity } from "@/lib/physics/properties";
import { stableTimeStep } from "@/lib/physics/stability";
import { FluidEngineBase } from "@/lib/solver/engine";
import { cellIndex } from "@/lib/solver/grid";
import { CELL_FLUID } from "@/types/simulation";

export class NavierStokesEngine extends FluidEngineBase {
  private uStar = new Float64Array(0);
  private vStar = new Float64Array(0);
  private pTemp = new Float64Array(0);

  get solverLabel(): string {
    const turbulence = this.params.turbulenceModel === "smagorinsky" ? "、Smagorinsky型渦粘性" : "";
    if (this.params.domainMode === "downstream-channel") {
      return `2次元非圧縮ナビエ・ストークス（下流チャンネルは単相${turbulence}）`;
    }
    return `2次元非圧縮ナビエ・ストークス（水平水面・自由放出${turbulence}）`;
  }

  protected override allocate(): void {
    super.allocate();
    const { nx, ny } = this.grid;
    this.uStar = new Float64Array((nx + 1) * ny);
    this.vStar = new Float64Array(nx * (ny + 1));
    this.pTemp = new Float64Array(nx * ny);
  }

  protected resetFields(): void {
    this.u.fill(0);
    this.v.fill(0);
    this.fillHydrostatic();
  }

  step(deltaTime: number): void {
    if (this.disposed) return;
    if (this.failed) return;
    const started = performance.now();
    this.requestedDt = deltaTime;
    this.cflLimited = false;
    this.viscousLimited = false;
    this.stepTruncated = false;
    let remaining = Math.max(0, deltaTime);
    let guard = 0;
    while (remaining > 1e-8 && guard < 8) {
      const limit = stableTimeStep(remaining, this.maxFaceSpeed(), this.grid.dx, this.grid.dy, this.viscosityScale(), this.params.gravity);
      if (limit.cflLimited) this.cflLimited = true;
      if (limit.viscousLimited) this.viscousLimited = true;
      this.substep(limit.dt);
      remaining -= limit.dt;
      this.lastDt = limit.dt;
      guard += 1;
      if (this.failed) break;
    }
    if (remaining > 1e-6) this.stepTruncated = true;
    this.time += Math.max(0, deltaTime - remaining);
    this.stepCount += 1;
    this.computeMs = performance.now() - started;
    this.invalidate();
  }

  protected override advanceWater(dt: number, outflow: number): void {
    const previous = new Uint8Array(this.cell);
    super.advanceWater(dt, outflow);
    const { nx, ny, dy } = this.grid;
    const rho = this.params.density;
    const g = this.params.gravity;
    for (let j = 0; j < ny; j += 1) {
      const pressure = rho * g * Math.max(0, this.waterLevel - (j + 0.5) * dy);
      for (let i = 0; i < nx; i += 1) {
        const index = cellIndex(i, j, nx);
        if (this.cell[index] === CELL_FLUID && previous[index] !== CELL_FLUID) this.p[index] = pressure;
        if (this.cell[index] !== CELL_FLUID && previous[index] === CELL_FLUID) this.p[index] = 0;
      }
    }
  }

  private substep(dt: number): void {
    this.advect(dt);
    this.applyViscosity(dt);
    this.applyGravity(dt);
    this.zeroBlockedFaces();
    this.project(dt);
    this.correctVelocity(dt);
    this.assertFinite();
    if (this.failed) return;
    const exit = this.measureExit();
    this.advanceWater(dt, exit.discharge);
    this.advanceParticles(dt);
  }

  private viscosityScale(): number {
    const nu = kinematicViscosity(this.params.dynamicViscosity, this.params.density);
    if (this.params.turbulenceModel !== "smagorinsky") return Number.isFinite(nu) ? nu : 0;
    const cs = this.params.smagorinskyConstant;
    const delta = this.grid.dx;
    const strain = this.maxFaceSpeed() / Math.max(delta, 1e-6);
    return (Number.isFinite(nu) ? nu : 0) + cs * cs * delta * delta * strain;
  }

  private advect(dt: number): void {
    if (this.params.advectionScheme === "upwind") this.advectUpwind(dt);
    else this.advectSemiLagrangian(dt);
  }

  private advectSemiLagrangian(dt: number): void {
    const { nx, ny, dx, dy } = this.grid;
    this.uStar.set(this.u);
    this.vStar.set(this.v);
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i <= nx; i += 1) {
        if (!this.faceProjects(this.sideOf(i - 1, j), this.sideOf(i, j))) continue;
        const x = i * dx;
        const y = (j + 0.5) * dy;
        const u0 = this.u[this.iu(i, j)];
        const v0 = this.sampleV(x, y);
        const um = this.sampleU(x - 0.5 * dt * u0, y - 0.5 * dt * v0);
        const vm = this.sampleV(x - 0.5 * dt * u0, y - 0.5 * dt * v0);
        this.uStar[this.iu(i, j)] = this.sampleU(x - dt * um, y - dt * vm);
      }
    }
    for (let j = 0; j <= ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        if (!this.faceProjects(this.sideOf(i, j - 1), this.sideOf(i, j))) continue;
        const x = (i + 0.5) * dx;
        const y = j * dy;
        const u0 = this.sampleU(x, y);
        const v0 = this.v[this.iv(i, j)];
        const um = this.sampleU(x - 0.5 * dt * u0, y - 0.5 * dt * v0);
        const vm = this.sampleV(x - 0.5 * dt * u0, y - 0.5 * dt * v0);
        this.vStar[this.iv(i, j)] = this.sampleV(x - dt * um, y - dt * vm);
      }
    }
    this.u.set(this.uStar);
    this.v.set(this.vStar);
  }

  private advectUpwind(dt: number): void {
    const { nx, ny, dx, dy } = this.grid;
    this.uStar.set(this.u);
    this.vStar.set(this.v);
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i <= nx; i += 1) {
        if (!this.faceProjects(this.sideOf(i - 1, j), this.sideOf(i, j))) continue;
        const id = this.iu(i, j);
        const u0 = this.u[id];
        const v0 = this.sampleV(i * dx, (j + 0.5) * dy);
        const uL = i > 0 ? this.u[this.iu(i - 1, j)] : 0;
        const uR = i < nx ? this.u[this.iu(i + 1, j)] : 0;
        const uB = j > 0 ? this.u[this.iu(i, j - 1)] : 0;
        const uT = j < ny - 1 ? this.u[this.iu(i, j + 1)] : 0;
        const dudx = u0 >= 0 ? (u0 - uL) / dx : (uR - u0) / dx;
        const dudy = v0 >= 0 ? (u0 - uB) / dy : (uT - u0) / dy;
        this.uStar[id] = u0 - dt * (u0 * dudx + v0 * dudy);
      }
    }
    for (let j = 0; j <= ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        if (!this.faceProjects(this.sideOf(i, j - 1), this.sideOf(i, j))) continue;
        const id = this.iv(i, j);
        const v0 = this.v[id];
        const u0 = this.sampleU((i + 0.5) * dx, j * dy);
        const vL = i > 0 ? this.v[this.iv(i - 1, j)] : 0;
        const vR = i < nx - 1 ? this.v[this.iv(i + 1, j)] : 0;
        const vB = j > 0 ? this.v[this.iv(i, j - 1)] : 0;
        const vT = j < ny ? this.v[this.iv(i, j + 1)] : 0;
        const dvdx = u0 >= 0 ? (v0 - vL) / dx : (vR - v0) / dx;
        const dvdy = v0 >= 0 ? (v0 - vB) / dy : (vT - v0) / dy;
        this.vStar[id] = v0 - dt * (u0 * dvdx + v0 * dvdy);
      }
    }
    this.u.set(this.uStar);
    this.v.set(this.vStar);
  }

  private applyViscosity(dt: number): void {
    const nu = kinematicViscosity(this.params.dynamicViscosity, this.params.density);
    if (!(nu > 0) && this.params.turbulenceModel !== "smagorinsky") return;
    const { nx, ny, dx, dy } = this.grid;
    const dx2 = dx * dx;
    const dy2 = dy * dy;
    this.uStar.set(this.u);
    this.vStar.set(this.v);
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i <= nx; i += 1) {
        if (!this.faceProjects(this.sideOf(i - 1, j), this.sideOf(i, j))) continue;
        const id = this.iu(i, j);
        const uC = this.u[id];
        const uL = i > 0 ? this.u[this.iu(i - 1, j)] : 0;
        const uR = i < nx ? this.u[this.iu(i + 1, j)] : 0;
        const uB = j > 0 ? this.u[this.iu(i, j - 1)] : 0;
        const uT = j < ny - 1 ? this.u[this.iu(i, j + 1)] : 0;
        const lap = (uL - 2 * uC + uR) / dx2 + (uB - 2 * uC + uT) / dy2;
        const nuT = this.eddyViscosity(Math.min(i, nx - 1), j);
        this.uStar[id] = uC + dt * ((nu > 0 ? nu : 0) + nuT) * lap;
      }
    }
    for (let j = 0; j <= ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        if (!this.faceProjects(this.sideOf(i, j - 1), this.sideOf(i, j))) continue;
        const id = this.iv(i, j);
        const vC = this.v[id];
        const vL = i > 0 ? this.v[this.iv(i - 1, j)] : 0;
        const vR = i < nx - 1 ? this.v[this.iv(i + 1, j)] : 0;
        const vB = j > 0 ? this.v[this.iv(i, j - 1)] : 0;
        const vT = j < ny ? this.v[this.iv(i, j + 1)] : 0;
        const lap = (vL - 2 * vC + vR) / dx2 + (vB - 2 * vC + vT) / dy2;
        const nuT = this.eddyViscosity(i, Math.min(j, ny - 1));
        this.vStar[id] = vC + dt * ((nu > 0 ? nu : 0) + nuT) * lap;
      }
    }
    this.u.set(this.uStar);
    this.v.set(this.vStar);
  }

  private eddyViscosity(i: number, j: number): number {
    if (this.params.turbulenceModel !== "smagorinsky") return 0;
    const { dx, dy, nx, ny } = this.grid;
    const sample = (ii: number, jj: number) => this.centeredVelocity(Math.min(nx - 1, Math.max(0, ii)), Math.min(ny - 1, Math.max(0, jj)));
    const xp = sample(i + 1, j);
    const xm = sample(i - 1, j);
    const yp = sample(i, j + 1);
    const ym = sample(i, j - 1);
    const dux = (xp.u - xm.u) / (2 * dx);
    const duy = (yp.u - ym.u) / (2 * dy);
    const dvx = (xp.v - xm.v) / (2 * dx);
    const dvy = (yp.v - ym.v) / (2 * dy);
    const sxy = 0.5 * (duy + dvx);
    const magnitude = Math.sqrt(2 * dux * dux + 2 * dvy * dvy + 4 * sxy * sxy);
    const delta = Math.sqrt(dx * dy);
    const cs = this.params.smagorinskyConstant;
    return cs * cs * delta * delta * magnitude;
  }

  private applyGravity(dt: number): void {
    const { nx, ny } = this.grid;
    const g = this.params.gravity;
    for (let j = 0; j <= ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        if (!this.faceProjects(this.sideOf(i, j - 1), this.sideOf(i, j))) continue;
        this.v[this.iv(i, j)] -= g * dt;
      }
    }
  }

  private project(dt: number): void {
    const { nx, ny, dx, dy } = this.grid;
    const invDx2 = 1 / (dx * dx);
    const invDy2 = 1 / (dy * dy);
    const scale = this.params.density / Math.max(dt, 1e-8);
    const method = this.params.pressureMethod;
    const omega = method === "sor" ? 1.55 : 1;
    let residual = 0;
    for (let iter = 0; iter < this.params.pressureIterations; iter += 1) {
      if (method === "jacobi") this.pTemp.set(this.p);
      const read = method === "jacobi" ? this.pTemp : this.p;
      residual = 0;
      for (let j = 0; j < ny; j += 1) {
        for (let i = 0; i < nx; i += 1) {
          const index = cellIndex(i, j, nx);
          if (this.cell[index] !== CELL_FLUID) {
            this.p[index] = 0;
            continue;
          }
          let coeff = 0;
          let sum = 0;
          const accumulate = (ni: number, nj: number, inv: number) => {
            const side = this.sideOf(ni, nj);
            if (side === "blocked") return;
            coeff += inv;
            if (side === "fluid") sum += read[cellIndex(ni, nj, nx)] * inv;
          };
          accumulate(i - 1, j, invDx2);
          accumulate(i + 1, j, invDx2);
          accumulate(i, j - 1, invDy2);
          accumulate(i, j + 1, invDy2);
          const div = (this.u[this.iu(i + 1, j)] - this.u[this.iu(i, j)]) / dx + (this.v[this.iv(i, j + 1)] - this.v[this.iv(i, j)]) / dy;
          if (coeff < 1e-12) continue;
          const gauss = (sum - scale * div) / coeff;
          const updated = method === "jacobi" ? gauss : (1 - omega) * read[index] + omega * gauss;
          this.p[index] = updated;
          residual = Math.max(residual, Math.abs(gauss - read[index]));
        }
      }
    }
    this.pressureIterationCount = this.params.pressureIterations;
    this.pressureResidual = residual;
  }

  private correctVelocity(dt: number): void {
    const { nx, ny, dx, dy } = this.grid;
    const factorX = dt / (this.params.density * dx);
    const factorY = dt / (this.params.density * dy);
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i <= nx; i += 1) {
        const left = this.sideOf(i - 1, j);
        const right = this.sideOf(i, j);
        if (!this.faceProjects(left, right)) continue;
        const pL = left === "fluid" ? this.p[cellIndex(i - 1, j, nx)] : 0;
        const pR = right === "fluid" ? this.p[cellIndex(i, j, nx)] : 0;
        this.u[this.iu(i, j)] -= (pR - pL) * factorX;
      }
    }
    for (let j = 0; j <= ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const below = this.sideOf(i, j - 1);
        const above = this.sideOf(i, j);
        if (!this.faceProjects(below, above)) continue;
        const pB = below === "fluid" ? this.p[cellIndex(i, j - 1, nx)] : 0;
        const pA = above === "fluid" ? this.p[cellIndex(i, j, nx)] : 0;
        this.v[this.iv(i, j)] -= (pA - pB) * factorY;
      }
    }
  }

  protected velocitySourceText(): string {
    return "オリフィス出口断面の流束平均です。理論流速 √(2gh) とは独立に、速度場から計算しています。";
  }

  protected approximations(): string[] {
    const advection = this.params.advectionScheme === "upwind"
      ? "移流は1次精度の風上差分です。"
      : "移流はRK2セミラグランジュ法です。高レイノルズ数では数値拡散が分子粘性より大きくなり得ます。";
    const notes = [
      "非圧縮の2次元ナビエ・ストークス方程式を、スタガード格子の射影法で解いています。",
      advection,
      `圧力ポアソン方程式は ${this.params.pressureMethod.toUpperCase()} 法です。`,
      "水面の形は水平のままです。水面圧力はゲージ0に固定し、水面を横切る速度は許容しますが、波や変形は解きません。水位は貯水池面積と流入・流出の収支で更新します。",
      "壁の法線速度は0です。粘性ステンシルでは壁側速度を0に置く非すべり近似です。",
      "表面張力による界面力、キャビテーションの相変化、3次元の縮流は入っていません。",
    ];
    if (this.params.domainMode === "free-discharge") {
      notes.push("数値解の領域は貯水池とオリフィスです。下流で落下する粒子は、領域を出たあとの運動学的追跡であり、下流の圧力場や速度場は解いていません。");
    } else {
      notes.push("下流チャンネルは単相流体で満たし、右端を圧力出口にしています。大気中を落下する自由噴流ではありません。");
    }
    if (this.params.turbulenceModel === "smagorinsky") {
      notes.push("乱流モデルは Smagorinsky 型の渦粘性です。2次元の近似であり、RANS でも、解像された3次元乱流でもありません。");
    } else if (this.params.turbulenceModel === "visual-only") {
      notes.push("乱流の簡易表示は粒子描画の擾乱だけです。速度場・圧力場・渦度には加えていません。");
    } else if (this.params.turbulenceModel === "dns-attempt") {
      notes.push("高解像度モードでも方程式は2次元のナビエ・ストークス方程式です。3次元乱流の直接数値計算ではありません。");
    } else {
      notes.push("乱流モデルは使っていません。高いレイノルズ数でも、見えている構造を物理的な乱流渦として扱わないでください。");
    }
    if (this.params.orificeShape === "circular") {
      notes.push("円形オリフィスの流量は、2次元断面の平均流速に円面積を掛けた換算です。");
    }
    return notes;
  }
}
