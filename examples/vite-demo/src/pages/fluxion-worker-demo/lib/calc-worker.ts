import { defineWorker } from "@heojeongbo/fluxion-worker";

export type CalcOp = "sum" | "mean" | "max";

export interface CalcMsg {
  op: CalcOp;
  values: number[];
}

export interface CalcResultMsg {
  op: CalcOp;
  result: number;
  durationMs: number;
}

defineWorker<CalcMsg, CalcResultMsg>(({ op, values }, reply) => {
  const t0 = performance.now();

  let result: number;
  if (op === "sum") {
    result = values.reduce((a, b) => a + b, 0);
  } else if (op === "mean") {
    result = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  } else {
    result = values.length > 0 ? Math.max(...values) : 0;
  }

  reply({ op, result, durationMs: performance.now() - t0 });
});
