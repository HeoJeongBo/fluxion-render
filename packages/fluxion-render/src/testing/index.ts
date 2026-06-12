/**
 * `@heojeongbo/fluxion-render/testing` — deterministic signal generators
 * and PRNG utilities used by the demos and consumer integration tests.
 *
 * Lives in its own sub-path so the production bundle doesn't have to ship
 * test fixtures. Import via:
 *
 *     import { mulberry32, createSineSynth, createLinearRamp }
 *       from "@heojeongbo/fluxion-render/testing";
 */

export { mulberry32 } from "./signals/mulberry32";
export type { LinearRampOptions, SineSynthOptions } from "./signals/pumps";
export { createLinearRamp, createSineSynth } from "./signals/pumps";
