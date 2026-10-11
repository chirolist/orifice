import type { DomainMode, SimulationParameters } from "@/types/simulation";
import { CELL_ATMOSPHERE, CELL_FLUID, CELL_SOLID } from "@/types/simulation";

export interface GridMetrics {
  nx: number;
  ny: number;
  dx: number;
  dy: number;
  reservoirCells: number;
  damCells: number;
  downstreamCells: number;
  reservoirLength: number;
  damThickness: number;
  downstreamLength: number;
  damHeight: number;
}

export function buildGridMetrics(params: Pick<SimulationParameters, "resolution" | "damHeight" | "reservoirLength" | "damThickness" | "downstreamLength">): GridMetrics {
  const ny = params.resolution;
  const dy = params.damHeight / ny;
  const dx = dy;
  const reservoirCells = Math.max(6, Math.round(params.reservoirLength / dx));
  const damCells = Math.max(2, Math.round(params.damThickness / dx));
  const downstreamCells = Math.max(6, Math.round(params.downstreamLength / dx));
  return {
    nx: reservoirCells + damCells + downstreamCells,
    ny,
    dx,
    dy,
    reservoirCells,
    damCells,
    downstreamCells,
    reservoirLength: reservoirCells * dx,
    damThickness: damCells * dx,
    downstreamLength: downstreamCells * dx,
    damHeight: ny * dy,
  };
}

export function classifyCells(
  cell: Uint8Array,
  grid: GridMetrics,
  waterLevel: number,
  orificeBottom: number,
  orificeTop: number,
  domainMode: DomainMode,
): number {
  const { nx, ny, dy, reservoirCells, damCells } = grid;
  const dam1 = reservoirCells + damCells;
  let fluid = 0;
  const hasOpening = orificeTop - orificeBottom > 1e-8;
  for (let j = 0; j < ny; j += 1) {
    const y = (j + 0.5) * dy;
    for (let i = 0; i < nx; i += 1) {
      const inDam = i >= reservoirCells && i < dam1;
      const inOrifice = hasOpening && y >= orificeBottom && y < orificeTop;
      let type: number;
      if (inDam && !inOrifice) type = CELL_SOLID;
      else if (i < dam1) type = y < waterLevel ? CELL_FLUID : CELL_ATMOSPHERE;
      else if (domainMode === "downstream-channel") type = CELL_FLUID;
      else type = CELL_ATMOSPHERE;
      cell[i + j * nx] = type;
      if (type === CELL_FLUID) fluid += 1;
    }
  }
  return fluid;
}

export function cellIndex(i: number, j: number, nx: number): number {
  return i + j * nx;
}

export function uIndex(i: number, j: number, nx: number): number {
  return i + j * (nx + 1);
}

export function vIndex(i: number, j: number, nx: number): number {
  return i + j * nx;
}
