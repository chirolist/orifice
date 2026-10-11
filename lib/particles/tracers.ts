import type { Integrator } from "@/types/simulation";

export interface VelocitySample {
  u: number;
  v: number;
  valid: boolean;
  solid: boolean;
}

export interface TracerArrays {
  x: Float64Array;
  y: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  age: Float64Array;
  kinematic: Uint8Array;
  count: number;
  generation: number;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class TracerSet {
  x = new Float64Array(0);
  y = new Float64Array(0);
  vx = new Float64Array(0);
  vy = new Float64Array(0);
  age = new Float64Array(0);
  kinematic = new Uint8Array(0);
  count = 0;
  generation = 0;
  private rng = mulberry32(1);

  seed(count: number, spots: { x: number; y: number }[], seed: number): void {
    this.count = Math.max(0, count);
    this.x = new Float64Array(this.count);
    this.y = new Float64Array(this.count);
    this.vx = new Float64Array(this.count);
    this.vy = new Float64Array(this.count);
    this.age = new Float64Array(this.count);
    this.kinematic = new Uint8Array(this.count);
    this.rng = mulberry32(seed || 1);
    this.generation += 1;
    if (spots.length === 0 || this.count === 0) return;
    for (let i = 0; i < this.count; i += 1) {
      this.respawn(i, spots);
      this.age[i] = this.rng() * 0.5;
    }
  }

  clearTrails(): void {
    this.generation += 1;
  }

  step(
    dt: number,
    spots: { x: number; y: number }[],
    sample: (x: number, y: number) => VelocitySample,
    isSolid: (x: number, y: number) => boolean,
    gravity: number,
    integrator: Integrator,
    lifetime: number,
    bounds: { width: number; height: number },
  ): void {
    if (spots.length === 0) return;
    for (let i = 0; i < this.count; i += 1) {
      const moved = this.integrateOne(i, dt, sample, gravity, integrator);
      this.resolveCollision(i, moved.previousX, moved.previousY, isSolid);
      this.age[i] += dt;
      const outside =
        this.y[i] < -0.05 ||
        this.y[i] > bounds.height + 0.4 ||
        this.x[i] < -0.2 ||
        this.x[i] > bounds.width + 0.3 ||
        this.age[i] > lifetime ||
        isSolid(this.x[i], this.y[i]);
      if (outside) this.respawn(i, spots);
    }
  }

  private respawn(index: number, spots: { x: number; y: number }[]): void {
    const spot = spots[Math.floor(this.rng() * spots.length) % spots.length];
    this.x[index] = spot.x + (this.rng() - 0.5) * 0.02;
    this.y[index] = spot.y + (this.rng() - 0.5) * 0.02;
    this.vx[index] = 0;
    this.vy[index] = 0;
    this.age[index] = 0;
    this.kinematic[index] = 0;
  }

  private integrateOne(
    index: number,
    dt: number,
    sample: (x: number, y: number) => VelocitySample,
    gravity: number,
    integrator: Integrator,
  ): { previousX: number; previousY: number } {
    const previousX = this.x[index];
    const previousY = this.y[index];
    const first = sample(previousX, previousY);
    if (!first.valid) {
      this.vy[index] -= gravity * dt;
      this.x[index] += this.vx[index] * dt;
      this.y[index] += this.vy[index] * dt;
      this.kinematic[index] = 1;
      return { previousX, previousY };
    }

    const velocity = this.fluidVelocity(previousX, previousY, dt, sample, integrator, first);
    this.x[index] = previousX + dt * velocity.u;
    this.y[index] = previousY + dt * velocity.v;
    this.vx[index] = velocity.u;
    this.vy[index] = velocity.v;
    this.kinematic[index] = 0;
    return { previousX, previousY };
  }

  private fluidVelocity(
    x: number,
    y: number,
    dt: number,
    sample: (x: number, y: number) => VelocitySample,
    integrator: Integrator,
    first: VelocitySample,
  ): { u: number; v: number } {
    const pick = (sx: number, sy: number, fallback: VelocitySample): VelocitySample => {
      const next = sample(sx, sy);
      return next.valid ? next : fallback;
    };
    if (integrator === "euler") return { u: first.u, v: first.v };
    if (integrator === "rk2") {
      const mid = pick(x + 0.5 * dt * first.u, y + 0.5 * dt * first.v, first);
      return { u: mid.u, v: mid.v };
    }
    const second = pick(x + 0.5 * dt * first.u, y + 0.5 * dt * first.v, first);
    const third = pick(x + 0.5 * dt * second.u, y + 0.5 * dt * second.v, second);
    const fourth = pick(x + dt * third.u, y + dt * third.v, third);
    return {
      u: (first.u + 2 * second.u + 2 * third.u + fourth.u) / 6,
      v: (first.v + 2 * second.v + 2 * third.v + fourth.v) / 6,
    };
  }

  private resolveCollision(index: number, previousX: number, previousY: number, isSolid: (x: number, y: number) => boolean): void {
    if (!isSolid(this.x[index], this.y[index])) return;
    const tryX = !isSolid(this.x[index], previousY);
    const tryY = !isSolid(previousX, this.y[index]);
    if (tryX) {
      this.y[index] = previousY;
      this.vy[index] = 0;
      return;
    }
    if (tryY) {
      this.x[index] = previousX;
      this.vx[index] = 0;
      return;
    }
    this.x[index] = previousX;
    this.y[index] = previousY;
    this.vx[index] = 0;
    this.vy[index] = 0;
  }
}
