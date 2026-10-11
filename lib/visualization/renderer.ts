import { cssColor, divergingColor, pressureColor, speedColor, type Rgb } from "@/lib/visualization/colormap";
import { CELL_FLUID, type DisplayMode, type FrameSnapshot } from "@/types/simulation";

export interface RenderOptions {
  displayMode: DisplayMode;
  showVectors: boolean;
  showStreamlines: boolean;
  showParticles: boolean;
  showTrails: boolean;
  visualPerturbation: boolean;
  trails: { x: number; y: number }[][];
}

const MODE_LABEL: Record<DisplayMode, string> = {
  speed: "速度の大きさ",
  u: "水平速度 u",
  v: "鉛直速度 v",
  pressure: "ゲージ圧力",
  vorticity: "渦度 ω = ∂v/∂x − ∂u/∂y",
};

export function drawFrame(canvas: HTMLCanvasElement, frame: FrameSnapshot, options: RenderOptions): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width < 2 || height < 2) return;
  const pixelWidth = Math.floor(width * dpr);
  const pixelHeight = Math.floor(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#07101c";
  context.fillRect(0, 0, width, height);

  const pad = { left: 48, right: 78, top: 36, bottom: 32 };
  const plotW = Math.max(10, width - pad.left - pad.right);
  const plotH = Math.max(10, height - pad.top - pad.bottom);
  const worldW = frame.nx * frame.dx;
  const worldH = frame.damHeight;
  const toX = (x: number) => pad.left + (x / worldW) * plotW;
  const toY = (y: number) => pad.top + ((worldH - y) / worldH) * plotH;

  const gradient = context.createLinearGradient(0, pad.top, 0, pad.top + plotH);
  gradient.addColorStop(0, "#10243d");
  gradient.addColorStop(1, "#0b1728");
  context.fillStyle = gradient;
  context.fillRect(pad.left, pad.top, plotW, plotH);

  const scale = colorScale(frame, options.displayMode);
  for (let j = 0; j < frame.ny; j += 1) {
    for (let i = 0; i < frame.nx; i += 1) {
      const index = i + j * frame.nx;
      if (frame.cell[index] !== CELL_FLUID) continue;
      const color = colorFor(frame, index, options.displayMode, scale);
      context.fillStyle = cssColor(color, 0.92);
      const x0 = toX(i * frame.dx);
      const x1 = toX((i + 1) * frame.dx);
      const y0 = toY((j + 1) * frame.dy);
      const y1 = toY(j * frame.dy);
      context.fillRect(x0, y0, x1 - x0 + 0.6, y1 - y0 + 0.6);
    }
  }

  drawDam(context, frame, toX, toY);
  drawWaterline(context, frame, toX, toY);
  if (options.showStreamlines) drawStreamlines(context, frame, toX, toY);
  if (options.showVectors) drawVectors(context, frame, toX, toY, scale.max);
  if (options.showParticles) drawParticles(context, frame, options, toX, toY, scale.max);
  drawLegend(context, width, pad, scale, options.displayMode);
  drawAnnotations(context, frame, options.displayMode, pad, plotW, plotH, toX, toY);

  if (frame.diagnostics.nonFinite) {
    context.fillStyle = "rgba(80, 16, 16, 0.82)";
    context.fillRect(pad.left, pad.top + 8, Math.min(520, plotW), 36);
    context.fillStyle = "#ffd0d0";
    context.font = "13px sans-serif";
    context.fillText("計算が発散したため停止しました。リセットして条件を弱めてください。", pad.left + 12, pad.top + 30);
  }
}

function colorScale(frame: FrameSnapshot, mode: DisplayMode): { min: number; max: number; unit: string } {
  if (mode === "pressure") {
    const cap = Math.max(frame.diagnostics.meanPressure, frame.diagnostics.waterLevel * 998 * 9.81, 1);
    return { min: 0, max: cap, unit: "Pa" };
  }
  if (mode === "vorticity" || mode === "u" || mode === "v") {
    const field = mode === "vorticity" ? frame.vorticity : mode === "u" ? frame.uCenter : frame.vCenter;
    let peak = 0.05;
    for (let i = 0; i < field.length; i += 1) {
      if (frame.cell[i] === CELL_FLUID) peak = Math.max(peak, Math.abs(field[i]));
    }
    return { min: -peak, max: peak, unit: mode === "vorticity" ? "1/s" : "m/s" };
  }
  const max = Math.max(frame.diagnostics.maxSpeed, frame.diagnostics.theoreticalVelocity, 0.2);
  return { min: 0, max, unit: "m/s" };
}

function colorFor(frame: FrameSnapshot, index: number, mode: DisplayMode, scale: { min: number; max: number }): Rgb {
  if (mode === "pressure") {
    const t = (frame.pressure[index] - scale.min) / Math.max(scale.max - scale.min, 1e-6);
    return pressureColor(t);
  }
  if (mode === "vorticity" || mode === "u" || mode === "v") {
    const value = mode === "vorticity" ? frame.vorticity[index] : mode === "u" ? frame.uCenter[index] : frame.vCenter[index];
    return divergingColor(value / Math.max(scale.max, 1e-6));
  }
  return speedColor(frame.speed[index] / Math.max(scale.max, 1e-6));
}

function drawDam(
  context: CanvasRenderingContext2D,
  frame: FrameSnapshot,
  toX: (x: number) => number,
  toY: (y: number) => number,
): void {
  const x0 = frame.reservoirLength;
  const x1 = frame.reservoirLength + frame.damThickness;
  context.beginPath();
  context.rect(toX(x0), toY(frame.damHeight), toX(x1) - toX(x0), toY(0) - toY(frame.damHeight));
  const opening = frame.orificeTop - frame.orificeBottom;
  if (opening > 0) {
    context.rect(toX(x0), toY(frame.orificeTop), toX(x1) - toX(x0), toY(frame.orificeBottom) - toY(frame.orificeTop));
  }
  context.fillStyle = "#8b97a8";
  context.fill("evenodd");
  context.strokeStyle = "#d5dde8";
  context.lineWidth = 1.2;
  context.stroke();
}

function drawWaterline(
  context: CanvasRenderingContext2D,
  frame: FrameSnapshot,
  toX: (x: number) => number,
  toY: (y: number) => number,
): void {
  context.beginPath();
  context.moveTo(toX(0), toY(frame.waterLevel));
  context.lineTo(toX(frame.reservoirLength), toY(frame.waterLevel));
  context.strokeStyle = "#b7e4ff";
  context.lineWidth = 2;
  context.stroke();
  context.fillStyle = "#b7e4ff";
  context.font = "12px sans-serif";
  context.fillText(`水面 ${frame.waterLevel.toFixed(2)} m`, toX(0.15), toY(frame.waterLevel) - 6);
}

function drawVectors(
  context: CanvasRenderingContext2D,
  frame: FrameSnapshot,
  toX: (x: number) => number,
  toY: (y: number) => number,
  speedMax: number,
): void {
  const stride = frame.nx > 80 ? 4 : 3;
  context.strokeStyle = "rgba(255,255,255,0.75)";
  context.lineWidth = 1;
  for (let j = 1; j < frame.ny; j += stride) {
    for (let i = 1; i < frame.nx; i += stride) {
      const index = i + j * frame.nx;
      if (frame.cell[index] !== CELL_FLUID) continue;
      const speed = frame.speed[index];
      if (speed < 0.02) continue;
      const x = (i + 0.5) * frame.dx;
      const y = (j + 0.5) * frame.dy;
      const length = Math.min(frame.dx * stride * 0.85, (speed / Math.max(speedMax, 0.2)) * frame.dx * stride);
      const angle = Math.atan2(-frame.vCenter[index], frame.uCenter[index]);
      const x2 = toX(x) + Math.cos(angle) * length * (toX(frame.dx) - toX(0)) / frame.dx;
      const y2 = toY(y) + Math.sin(angle) * length * (toX(frame.dx) - toX(0)) / frame.dx;
      context.beginPath();
      context.moveTo(toX(x), toY(y));
      context.lineTo(x2, y2);
      context.stroke();
    }
  }
}

function drawStreamlines(
  context: CanvasRenderingContext2D,
  frame: FrameSnapshot,
  toX: (x: number) => number,
  toY: (y: number) => number,
): void {
  context.strokeStyle = "rgba(186, 230, 255, 0.8)";
  context.lineWidth = 1.15;
  const seeds = 7;
  for (let s = 0; s < seeds; s += 1) {
    let x = frame.dx * 2;
    let y = frame.waterLevel * ((s + 0.5) / seeds);
    context.beginPath();
    context.moveTo(toX(x), toY(y));
    for (let n = 0; n < 90; n += 1) {
      const velocity = sampleCenter(frame, x, y);
      if (!velocity) break;
      const speed = Math.hypot(velocity.u, velocity.v);
      if (speed < 0.02) break;
      const step = Math.min(frame.dx * 0.45, 0.08);
      x += (velocity.u / speed) * step;
      y += (velocity.v / speed) * step;
      context.lineTo(toX(x), toY(y));
    }
    context.stroke();
  }
}

function sampleCenter(frame: FrameSnapshot, x: number, y: number): { u: number; v: number } | null {
  const i = Math.floor(x / frame.dx);
  const j = Math.floor(y / frame.dy);
  if (i < 0 || j < 0 || i >= frame.nx || j >= frame.ny) return null;
  const index = i + j * frame.nx;
  if (frame.cell[index] !== CELL_FLUID) return null;
  return { u: frame.uCenter[index], v: frame.vCenter[index] };
}

function drawParticles(
  context: CanvasRenderingContext2D,
  frame: FrameSnapshot,
  options: RenderOptions,
  toX: (x: number) => number,
  toY: (y: number) => number,
  speedMax: number,
): void {
  const pixel = Math.max(toX(frame.dx) - toX(0), 4);
  for (let i = 0; i < frame.particleCount; i += 1) {
    let x = frame.particlesX[i];
    let y = frame.particlesY[i];
    if (options.visualPerturbation) {
      const speed = Math.hypot(frame.particlesVx[i], frame.particlesVy[i]);
      const angle = Math.atan2(frame.particlesVy[i], frame.particlesVx[i]) + Math.PI / 2;
      const amp = 0.015 * Math.sin(frame.diagnostics.time * 6 + i);
      x += Math.cos(angle) * amp * Math.min(1, speed);
      y += Math.sin(angle) * amp * Math.min(1, speed);
    }
    const trail = options.trails[i];
    if (options.showTrails && trail && trail.length > 1) {
      context.beginPath();
      context.moveTo(toX(trail[0].x), toY(trail[0].y));
      for (let p = 1; p < trail.length; p += 1) context.lineTo(toX(trail[p].x), toY(trail[p].y));
      context.strokeStyle = frame.particlesKinematic[i] ? "rgba(255, 196, 120, 0.45)" : "rgba(180, 220, 255, 0.35)";
      context.lineWidth = 1;
      context.setLineDash(frame.particlesKinematic[i] ? [3, 3] : []);
      context.stroke();
      context.setLineDash([]);
    }
    const speed = Math.hypot(frame.particlesVx[i], frame.particlesVy[i]);
    context.fillStyle = cssColor(speedColor(speed / Math.max(speedMax, 0.2)), 0.9);
    context.beginPath();
    context.arc(toX(x), toY(y), Math.max(1.6, pixel * 0.14), 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "rgba(255,255,255,0.8)";
    context.lineWidth = 0.7;
    context.stroke();
  }
}

function drawLegend(
  context: CanvasRenderingContext2D,
  width: number,
  pad: { right: number; top: number },
  scale: { min: number; max: number; unit: string },
  mode: DisplayMode,
): void {
  const x = width - pad.right + 16;
  const y = pad.top + 8;
  const h = 140;
  for (let i = 0; i < h; i += 1) {
    const t = 1 - i / (h - 1);
    const color = mode === "pressure" ? pressureColor(t) : mode === "speed" ? speedColor(t) : divergingColor(t * 2 - 1);
    context.fillStyle = cssColor(color);
    context.fillRect(x, y + i, 12, 1.2);
  }
  context.fillStyle = "#d5e2f5";
  context.font = "11px sans-serif";
  context.fillText(scale.max.toExponential(1), x + 16, y + 8);
  context.fillText(mode === "speed" || mode === "pressure" ? scale.min.toExponential(1) : "0", x + 16, y + h / 2);
  context.fillText(scale.min.toExponential(1), x + 16, y + h);
  context.fillText(scale.unit, x, y + h + 16);
}

function drawAnnotations(
  context: CanvasRenderingContext2D,
  frame: FrameSnapshot,
  mode: DisplayMode,
  pad: { left: number; top: number },
  plotW: number,
  plotH: number,
  toX: (x: number) => number,
  toY: (y: number) => number,
): void {
  const worldW = frame.nx * frame.dx;
  context.strokeStyle = "#8ea3c2";
  context.fillStyle = "#c5d4ea";
  context.lineWidth = 1;
  context.font = "12px sans-serif";
  context.beginPath();
  context.moveTo(pad.left, pad.top);
  context.lineTo(pad.left, pad.top + plotH);
  context.lineTo(pad.left + plotW, pad.top + plotH);
  context.stroke();
  context.fillText("0", pad.left - 12, pad.top + plotH + 14);
  context.fillText(`${worldW.toFixed(1)} m`, pad.left + plotW - 48, pad.top + plotH + 14);
  context.fillText(`${frame.damHeight.toFixed(1)} m`, 6, pad.top + 12);
  context.fillStyle = "#9fb0c8";
  context.fillText("貯水池", toX(Math.min(frame.reservoirLength * 0.28, frame.reservoirLength - 0.2)), toY(frame.damHeight * 0.18));
  const downstream = frame.diagnostics.solverKind === "analytical"
    ? "運動学的噴流"
    : frame.diagnostics.domainMode === "downstream-channel"
      ? "下流チャンネル（単相）"
      : "下流の粒子は運動学";
  context.fillText(downstream, toX(frame.reservoirLength + frame.damThickness + 0.15), toY(frame.damHeight * 0.9));
  context.fillStyle = "#d5e2f5";
  context.fillText(`${MODE_LABEL[mode]}    t = ${frame.diagnostics.time.toFixed(2)} s`, pad.left, 22);
}
