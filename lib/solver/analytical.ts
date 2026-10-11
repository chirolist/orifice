import { FluidEngineBase } from "@/lib/solver/engine";
import { cellIndex } from "@/lib/solver/grid";
import { CELL_FLUID } from "@/types/simulation";

export class AnalyticalEngine extends FluidEngineBase {
  get solverLabel(): string {
    return "解析モデル（トリチェリ、半平面シンク、運動学的噴流）";
  }

  protected resetFields(): void {
    this.paintAnalytical();
  }

  step(deltaTime: number): void {
    if (this.disposed || this.failed) return;
    const started = performance.now();
    this.requestedDt = deltaTime;
    const theory = this.currentTheory();
    this.advanceWater(deltaTime, theory.theoreticalDischarge);
    this.paintAnalytical();
    this.advanceParticles(deltaTime);
    this.time += deltaTime;
    this.stepCount += 1;
    this.lastDt = deltaTime;
    this.cflLimited = false;
    this.viscousLimited = false;
    this.stepTruncated = false;
    this.pressureIterationCount = 0;
    this.pressureResidual = 0;
    this.computeMs = performance.now() - started;
    this.assertFinite();
    this.invalidate();
  }

  private paintAnalytical(): void {
    this.u.fill(0);
    this.v.fill(0);
    this.p.fill(0);
    this.classify();
    const theory = this.currentTheory();
    const { nx, ny, dx, dy, reservoirCells, damCells } = this.grid;
    const xExit = (reservoirCells + damCells) * dx;
    const yExit = theory.orificeElevation;
    const uExit = theory.dischargeVelocity;
    const q2d = uExit * theory.submergedHeight;
    const damX = reservoirCells * dx;

    if (q2d > 0) {
      for (let j = 0; j < ny; j += 1) {
        for (let i = 0; i < reservoirCells; i += 1) {
          if (!this.faceProjects(this.sideOf(i - 1, j), this.sideOf(i, j))) continue;
          const velocity = this.sinkVelocity(i * dx, (j + 0.5) * dy, xExit, yExit, q2d, uExit);
          this.u[this.iu(i, j)] = velocity.u;
        }
      }
      for (let j = 0; j <= ny; j += 1) {
        for (let i = 0; i < reservoirCells; i += 1) {
          if (!this.faceProjects(this.sideOf(i, j - 1), this.sideOf(i, j))) continue;
          const velocity = this.sinkVelocity((i + 0.5) * dx, j * dy, xExit, yExit, q2d, uExit);
          this.v[this.iv(i, j)] = velocity.v;
        }
      }
    }

    if (uExit > 0) {
      for (let j = 0; j < ny; j += 1) {
        const y = (j + 0.5) * dy;
        if (y < theory.orificeBottom || y >= theory.orificeTop) continue;
        for (let i = reservoirCells; i <= reservoirCells + damCells; i += 1) this.u[this.iu(i, j)] = uExit;
        for (let i = reservoirCells; i < reservoirCells + damCells; i += 1) {
          this.v[this.iv(i, j)] = 0;
          this.v[this.iv(i, j + 1)] = 0;
        }
      }
    }

    const rho = this.params.density;
    const g = this.params.gravity;
    for (let j = 0; j < ny; j += 1) {
      const y = (j + 0.5) * dy;
      const hydro = rho * g * Math.max(0, this.waterLevel - y);
      for (let i = 0; i < nx; i += 1) {
        const index = cellIndex(i, j, nx);
        if (this.cell[index] !== CELL_FLUID) continue;
        if (i >= reservoirCells && i < reservoirCells + damCells && this.grid.damThickness > 0) {
          const x = (i + 0.5) * dx;
          const fraction = Math.min(1, Math.max(0, (x - damX) / this.grid.damThickness));
          this.p[index] = hydro * (1 - fraction);
        } else {
          this.p[index] = hydro;
        }
      }
    }

    if (uExit > 1e-6) {
      const half = Math.max(theory.submergedHeight, dy) / 2;
      for (let j = 0; j < ny; j += 1) {
        for (let i = reservoirCells + damCells; i < nx; i += 1) {
          const x = (i + 0.5) * dx;
          const y = (j + 0.5) * dy;
          const travel = (x - xExit) / uExit;
          if (travel < 0) continue;
          const center = yExit - 0.5 * g * travel * travel;
          if (center <= 0 || Math.abs(y - center) > half) continue;
          const index = cellIndex(i, j, nx);
          this.cell[index] = CELL_FLUID;
          const fall = -g * travel;
          this.u[this.iu(i, j)] = uExit;
          this.u[this.iu(i + 1, j)] = uExit;
          this.v[this.iv(i, j)] = fall;
          this.v[this.iv(i, j + 1)] = fall;
          this.p[index] = 0;
        }
      }
    }
  }

  private sinkVelocity(x: number, y: number, xExit: number, yExit: number, q2d: number, uExit: number): { u: number; v: number } {
    const dxs = xExit - x;
    const dys = yExit - y;
    const radius = Math.max(Math.hypot(dxs, dys), this.grid.dx * 0.8);
    const radial = Math.min(Math.abs(uExit), q2d / (Math.PI * radius));
    return { u: (radial * dxs) / radius, v: (radial * dys) / radius };
  }

  protected velocitySourceText(): string {
    return "出口に与えた実効流速 C_d√(2gh) です。理想流速 √(2gh) とは流出係数だけ異なります。NSの独立な解ではありません。";
  }

  protected approximations(): string[] {
    return [
      "この速度場はナビエ・ストークス方程式を解いた結果ではありません。",
      "オリフィス出口の一様流速は C_d√(2gh)、理想流速 √(2gh) は別表示です。",
      "貯水池内は壁に置いた半平面シンクです。壁と水面の境界条件を厳密には満たしません。",
      "下流は一定幅の放物落下です。噴流の広がり、縮流、周囲流体の巻き込みは解いていません。",
      "圧力は静水圧と、オリフィス内で出口に向かって直線的に下がるゲージ圧です。",
      "水位は理論流量で更新しています。解析モードで理論流量と出口流量が近いのは、出口速度をその式で与えているためです。",
      "運動学的噴流の渦度は落下による速度の空間変化であり、乱流渦ではありません。",
      "粒子は可視化用トレーサーであり、粒子数は水の質量ではありません。",
    ];
  }
}
