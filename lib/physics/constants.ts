export const STANDARD_GRAVITY = 9.80665;

export const WATER_20C = {
  temperature: 20,
  density: 998.2,
  dynamicViscosity: 1.002e-3,
  surfaceTension: 0.07275,
  vaporPressure: 2339,
  atmosphericPressure: 101325,
};

export const LIMITS = {
  minResolution: 20,
  maxResolution: 96,
  minParticles: 0,
  maxParticles: 3000,
  minTimeStep: 1e-5,
  maxTimeStep: 0.05,
  minPressureIterations: 8,
  maxPressureIterations: 80,
};
