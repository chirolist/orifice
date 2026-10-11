export interface TimeStepLimit {
  dt: number;
  cflLimited: boolean;
  viscousLimited: boolean;
}

export function stableTimeStep(
  requested: number,
  maxSpeed: number,
  dx: number,
  dy: number,
  kinematicViscosity: number,
  gravity = 0,
): TimeStepLimit {
  const positiveRequest = Number.isFinite(requested) && requested > 0 ? requested : 1e-3;
  let dt = positiveRequest;
  let cflLimited = false;
  let viscousLimited = false;
  const length = Math.min(dx, dy);
  const gravityScale = gravity > 0 ? Math.sqrt(gravity * length) : 0;
  const speed = Math.max(maxSpeed, gravityScale, 1e-4);
  const dtCfl = (0.45 * length) / speed;
  if (dt > dtCfl) {
    dt = dtCfl;
    cflLimited = true;
  }
  if (kinematicViscosity > 0 && length > 0) {
    const dtVisc = 0.2 / (kinematicViscosity * (1 / (dx * dx) + 1 / (dy * dy)));
    if (dt > dtVisc) {
      dt = dtVisc;
      viscousLimited = true;
    }
  }
  return { dt, cflLimited, viscousLimited };
}
