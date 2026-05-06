import type { WorkerPoolStats } from "@heojeongbo/fluxion-worker";
import { WorkerHandle, WorkerPool, WorkerTimeoutError } from "@heojeongbo/fluxion-worker";
import { useCallback, useEffect, useRef, useState } from "react";
import { THEME } from "../../../shared/ui/theme";
import type { CalcMsg, CalcOp, CalcResultMsg } from "../lib/calc-worker";

type Mode = "pool" | "standalone";

interface JobResult {
  op: CalcOp;
  result?: number;
  error?: string;
  durationMs?: number;
  workerId: string;
  mode: Mode;
}

function randomValues(n: number): number[] {
  return Array.from({ length: n }, () => Math.round(Math.random() * 1000));
}

const CODE_STYLE: React.CSSProperties = {
  background: THEME.page.background,
  border: `1px solid ${THEME.page.border}`,
  borderRadius: 4,
  padding: "12px 16px",
  fontSize: 12,
  fontFamily: "monospace",
  lineHeight: 1.6,
  color: THEME.page.textPrimary,
  whiteSpace: "pre",
  overflow: "auto",
};

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: THEME.page.textSecondary,
  marginBottom: 8,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

export function FluxionWorkerDemoPage() {
  const poolRef = useRef<WorkerPool<CalcMsg> | null>(null);
  const standaloneHandleRef = useRef<WorkerHandle<CalcMsg> | null>(null);

  const [results, setResults] = useState<JobResult[]>([]);
  const [pending, setPending] = useState(0);
  const [size, setSize] = useState(2);
  const [mode, setMode] = useState<Mode>("pool");
  const [stats, setStats] = useState<WorkerPoolStats | null>(null);

  // Pool: (re)create whenever size changes
  useEffect(() => {
    poolRef.current?.dispose();
    poolRef.current = new WorkerPool<CalcMsg>({
      size,
      workerFactory: () =>
        new Worker(
          new URL("../lib/calc-worker.ts", import.meta.url),
          { type: "module" },
        ),
    });
    setStats(poolRef.current.stats());
    return () => {
      poolRef.current?.dispose();
      poolRef.current = null;
    };
  }, [size]);

  // Standalone: WorkerHandle owns the Worker lifecycle
  useEffect(() => {
    const handle = new WorkerHandle<CalcMsg>(
      () => new Worker(new URL("../lib/calc-worker.ts", import.meta.url), { type: "module" }),
    );
    standaloneHandleRef.current = handle;
    return () => {
      handle.dispose(); // same as terminate() in standalone mode
      standaloneHandleRef.current = null;
    };
  }, []);

  const refreshStats = useCallback(() => {
    if (poolRef.current) setStats(poolRef.current.stats());
  }, []);

  const dispatchPool = useCallback(async (op: CalcOp, count: number) => {
    const pool = poolRef.current;
    if (!pool) return;

    setPending((p) => p + 1);
    try {
      // pool.dispatch() = acquire + request + release in one call
      const msg = await pool.dispatch<CalcResultMsg>(
        { op, values: randomValues(count) },
        { timeoutMs: 5000 },
      );
      setResults((prev) => [
        { op: msg.op, result: msg.result, durationMs: msg.durationMs, workerId: "pool", mode: "pool" },
        ...prev.slice(0, 19),
      ]);
    } catch (e) {
      setResults((prev) => [
        {
          op,
          error: WorkerTimeoutError.is(e) ? `timeout (${e.timeoutMs}ms)` : e instanceof Error ? e.message : String(e),
          workerId: "pool",
          mode: "pool",
        },
        ...prev.slice(0, 19),
      ]);
    } finally {
      refreshStats();
      setPending((p) => Math.max(0, p - 1));
    }
  }, [refreshStats]);

  const dispatchStandalone = useCallback(async (op: CalcOp, count: number) => {
    const handle = standaloneHandleRef.current;
    if (!handle) return;
    setPending((p) => p + 1);

    try {
      const msg = await handle.request<CalcResultMsg>(
        { op, values: randomValues(count) },
        { timeoutMs: 5000 },
      );
      setResults((prev) => [
        { op: msg.op, result: msg.result, durationMs: msg.durationMs, workerId: handle.hostId, mode: "standalone" },
        ...prev.slice(0, 19),
      ]);
    } catch (e) {
      setResults((prev) => [
        {
          op,
          error: WorkerTimeoutError.is(e) ? `timeout (${e.timeoutMs}ms)` : e instanceof Error ? e.message : String(e),
          workerId: handle.hostId,
          mode: "standalone",
        },
        ...prev.slice(0, 19),
      ]);
    } finally {
      setPending((p) => Math.max(0, p - 1));
    }
  }, []);

  const dispatch = mode === "pool" ? dispatchPool : dispatchStandalone;

  const workerSnippet = `// calc-worker.ts
import { defineWorker } from "@heojeongbo/fluxion-worker";

defineWorker(({ op, values }, reply) => {
  if (op === "error") throw new Error("intentional error");
  const result = op === "sum"
    ? values.reduce((a, b) => a + b, 0)
    : /* mean / max */ ...;
  reply({ op, result });
});`;

  const poolSnippet = `// WorkerPool — dispatch() = acquire + request + release
const pool = new WorkerPool({
  size: ${size},
  workerFactory: () => new Worker(...),
});

try {
  const msg = await pool.dispatch<CalcResultMsg>(
    { op: "sum", values },
    { timeoutMs: 5000 },
  );
  console.log(msg.result);
} catch (e) {
  if (WorkerTimeoutError.is(e)) {
    console.error(\`timed out after \${e.timeoutMs}ms\`);
  }
}

pool.stats();
// { size: ${size}, hostCounts: [...], totalActive: 0 }`;

  const standaloneSnippet = `// WorkerHandle (standalone) — dispose() works in both modes
const handle = new WorkerHandle(
  () => new Worker(new URL("./calc-worker.ts",
               import.meta.url), { type: "module" })
);

try {
  const msg = await handle.request<CalcResultMsg>(
    { op: "sum", values },
    { timeoutMs: 5000 },
  );
  console.log(msg.result);
} catch (e) {
  if (WorkerTimeoutError.is(e)) { /* timeout */ }
} finally {
  handle.dispose(); // terminate() in standalone, release() in pool
}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 16px",
          borderBottom: `1px solid ${THEME.page.border}`,
          background: THEME.panel.background,
          fontSize: 12,
          color: THEME.page.textSecondary,
          flexShrink: 0,
        }}
      >
        <strong style={{ color: THEME.page.textPrimary }}>@heojeongbo/fluxion-worker</strong>
        <span style={{ color: THEME.page.textMuted }}>dispatch() · request() · stats() · dispose()</span>
        {pending > 0 && (
          <span style={{ marginLeft: "auto", color: THEME.button.background, fontWeight: 600 }}>
            {pending} pending…
          </span>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "340px 1fr", gap: 0 }}>
        {/* Left panel */}
        <div
          style={{
            borderRight: `1px solid ${THEME.page.border}`,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            overflowY: "auto",
            background: THEME.panel.background,
          }}
        >
          {/* Mode selector */}
          <div>
            <div style={SECTION_LABEL}>Mode</div>
            <div style={{ display: "flex", gap: 6 }}>
              {(["pool", "standalone"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  style={{
                    padding: "4px 12px",
                    fontSize: 12,
                    border: `1px solid ${m === mode ? THEME.button.border : THEME.page.border}`,
                    borderRadius: 4,
                    background: m === mode ? THEME.button.background : THEME.button.inactiveBackground,
                    color: m === mode ? THEME.button.text : THEME.button.inactiveText,
                    cursor: "pointer",
                  }}
                >
                  {m === "pool" ? "WorkerPool" : "WorkerHandle (standalone)"}
                </button>
              ))}
            </div>
            {mode === "standalone" && (
              <div style={{ marginTop: 8, fontSize: 11, color: THEME.page.textMuted, lineHeight: 1.5 }}>
                Single Worker, no pool. <code>release()</code> is a no-op.
              </div>
            )}
          </div>

          {/* Pool size (pool mode only) */}
          {mode === "pool" && (
            <div>
              <div style={SECTION_LABEL}>Pool size</div>
              <div style={{ display: "flex", gap: 6 }}>
                {[1, 2, 4].map((n) => (
                  <button
                    key={n}
                    onClick={() => setSize(n)}
                    style={{
                      padding: "4px 12px",
                      fontSize: 12,
                      border: `1px solid ${n === size ? THEME.button.border : THEME.page.border}`,
                      borderRadius: 4,
                      background: n === size ? THEME.button.background : THEME.button.inactiveBackground,
                      color: n === size ? THEME.button.text : THEME.button.inactiveText,
                      cursor: "pointer",
                    }}
                  >
                    {n} worker{n > 1 ? "s" : ""}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Pool stats (pool mode only) */}
          {mode === "pool" && stats && (
            <div>
              <div style={SECTION_LABEL}>Pool stats</div>
              <div
                style={{
                  background: THEME.page.background,
                  border: `1px solid ${THEME.page.border}`,
                  borderRadius: 4,
                  padding: "8px 12px",
                  fontSize: 12,
                  fontFamily: "monospace",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div style={{ color: THEME.page.textSecondary }}>
                  total active: <span style={{ color: THEME.button.background, fontWeight: 700 }}>{stats.totalActive}</span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {stats.hostCounts.map((count, i) => (
                    <span
                      key={i}
                      style={{
                        padding: "2px 8px",
                        borderRadius: 3,
                        fontSize: 11,
                        background: i === stats.leastBusyIndex ? THEME.button.background : THEME.panel.background,
                        color: i === stats.leastBusyIndex ? THEME.button.text : THEME.page.textSecondary,
                        border: `1px solid ${THEME.page.border}`,
                      }}
                    >
                      w{i}: {count}
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: THEME.page.textMuted }}>
                  highlighted = least busy (next acquire target)
                </div>
              </div>
            </div>
          )}

          {/* Dispatch buttons */}
          <div>
            <div style={SECTION_LABEL}>Dispatch job</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(
                [
                  { op: "sum", label: "sum(100 values)", count: 100 },
                  { op: "mean", label: "mean(1 000 values)", count: 1_000 },
                  { op: "max", label: "max(10 000 values)", count: 10_000 },
                  { op: "error", label: "trigger worker error", count: 0 },
                ] as const
              ).map(({ op, label, count }) => (
                <button
                  key={op}
                  onClick={() => dispatch(op, count)}
                  style={{
                    padding: "6px 12px",
                    fontSize: 12,
                    border: `1px solid ${op === "error" ? "#c0392b44" : THEME.button.border}`,
                    borderRadius: 4,
                    background: op === "error" ? "#c0392b22" : THEME.button.background,
                    color: op === "error" ? "#e74c3c" : THEME.button.text,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {label}
                </button>
              ))}
              {mode === "pool" && (
                <button
                  onClick={() => {
                    for (let i = 0; i < 8; i++) {
                      const op: CalcOp = ["sum", "mean", "max"][i % 3] as CalcOp;
                      dispatch(op, 5_000);
                    }
                  }}
                  style={{
                    padding: "6px 12px",
                    fontSize: 12,
                    border: `1px solid ${THEME.page.border}`,
                    borderRadius: 4,
                    background: THEME.button.inactiveBackground,
                    color: THEME.button.inactiveText,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  burst × 8 (mixed)
                </button>
              )}
            </div>
          </div>

          {/* Code snippet */}
          <div>
            <div style={SECTION_LABEL}>Worker script</div>
            <div style={CODE_STYLE}>{workerSnippet}</div>
          </div>
          <div>
            <div style={SECTION_LABEL}>Main thread</div>
            <div style={CODE_STYLE}>{mode === "pool" ? poolSnippet : standaloneSnippet}</div>
          </div>
        </div>

        {/* Right panel — results */}
        <div style={{ overflowY: "auto", padding: 16, background: THEME.page.background }}>
          {results.length === 0 ? (
            <div style={{ color: THEME.page.textMuted, fontSize: 13, paddingTop: 24, textAlign: "center" }}>
              Dispatch a job to see results
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {results.map((r, i) => (
                <div
                  key={i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "56px 60px auto auto",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    background: r.error ? "#c0392b11" : THEME.panel.background,
                    border: `1px solid ${r.error ? "#c0392b44" : THEME.page.border}`,
                    borderRadius: 4,
                    fontSize: 12,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: r.mode === "pool" ? THEME.button.background : THEME.page.textSecondary,
                      fontFamily: "monospace",
                      textTransform: "uppercase",
                    }}
                  >
                    {r.mode}
                  </span>
                  <span style={{ fontWeight: 700, color: r.error ? "#e74c3c" : THEME.button.background, fontFamily: "monospace" }}>
                    {r.op}
                  </span>
                  {r.error ? (
                    <span style={{ color: "#e74c3c", fontSize: 11, gridColumn: "3 / 5" }}>
                      ✕ {r.error}
                    </span>
                  ) : (
                    <>
                      <span style={{ fontWeight: 600, color: THEME.page.textPrimary, fontFamily: "monospace" }}>
                        = {r.result?.toFixed(2)}
                      </span>
                      <span style={{ color: THEME.page.textMuted, fontSize: 11, textAlign: "right" }}>
                        {r.durationMs?.toFixed(3)} ms
                        <br />
                        <span style={{ fontSize: 10 }}>{r.workerId}</span>
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
