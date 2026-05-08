import { WorkerPool, WorkerTimeoutError } from "@heojeongbo/fluxion-worker";
import type { WorkerPoolStats } from "@heojeongbo/fluxion-worker";
import { useCallback, useEffect, useRef, useState } from "react";
import { THEME } from "../../../shared/ui/theme";
import type { CalcMsg, CalcOp, CalcResultMsg } from "../lib/calc-worker";

interface JobResult {
  op: CalcOp;
  result?: number;
  error?: string;
  durationMs?: number;
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

const WORKER_SNIPPET = `// calc-worker.ts
import { defineWorker } from "@heojeongbo/fluxion-worker";

defineWorker(({ op, values }, reply) => {
  if (op === "error") throw new Error("intentional error");
  const result = op === "sum"
    ? values.reduce((a, b) => a + b, 0)
    : /* mean / max */ ...;
  reply({ op, result });
});`;

export function WorkerPoolTab() {
  const poolRef = useRef<WorkerPool<CalcMsg> | null>(null);
  const [results, setResults] = useState<JobResult[]>([]);
  const [pending, setPending] = useState(0);
  const [size, setSize] = useState(2);
  const [stats, setStats] = useState<WorkerPoolStats | null>(null);

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

  const refreshStats = useCallback(() => {
    if (poolRef.current) setStats(poolRef.current.stats());
  }, []);

  const dispatch = useCallback(async (op: CalcOp, count: number) => {
    const pool = poolRef.current;
    if (!pool) return;
    setPending((p) => p + 1);
    try {
      const msg = await pool.dispatch<CalcResultMsg>(
        { op, values: randomValues(count) },
        { timeoutMs: 5000 },
      );
      setResults((prev) => [
        { op: msg.op, result: msg.result, durationMs: msg.durationMs },
        ...prev.slice(0, 19),
      ]);
    } catch (e) {
      setResults((prev) => [
        {
          op,
          error: WorkerTimeoutError.is(e)
            ? `timeout (${e.timeoutMs}ms)`
            : e instanceof Error ? e.message : String(e),
        },
        ...prev.slice(0, 19),
      ]);
    } finally {
      refreshStats();
      setPending((p) => Math.max(0, p - 1));
    }
  }, [refreshStats]);

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

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      {/* Left panel */}
      <div
        style={{
          width: 340,
          borderRight: `1px solid ${THEME.page.border}`,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          overflowY: "auto",
          background: THEME.panel.background,
          flexShrink: 0,
        }}
      >
        {/* Pool size */}
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

        {/* Pool stats */}
        {stats && (
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
                total active:{" "}
                <span style={{ color: THEME.button.background, fontWeight: 700 }}>
                  {stats.totalActive}
                </span>
                {pending > 0 && (
                  <span style={{ marginLeft: 8, color: THEME.button.background }}>
                    ({pending} pending)
                  </span>
                )}
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
            <button
              onClick={() => {
                for (let i = 0; i < 8; i++) {
                  const op: CalcOp = (["sum", "mean", "max"] as CalcOp[])[i % 3]!;
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
          </div>
        </div>

        {/* Code snippets */}
        <div>
          <div style={SECTION_LABEL}>Worker script</div>
          <div style={CODE_STYLE}>{WORKER_SNIPPET}</div>
        </div>
        <div>
          <div style={SECTION_LABEL}>Main thread</div>
          <div style={CODE_STYLE}>{poolSnippet}</div>
        </div>
      </div>

      {/* Results panel */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16, background: THEME.page.background }}>
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
                  gridTemplateColumns: "60px auto auto",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  background: r.error ? "#c0392b11" : THEME.panel.background,
                  border: `1px solid ${r.error ? "#c0392b44" : THEME.page.border}`,
                  borderRadius: 4,
                  fontSize: 12,
                }}
              >
                <span style={{ fontWeight: 700, color: r.error ? "#e74c3c" : THEME.button.background, fontFamily: "monospace" }}>
                  {r.op}
                </span>
                {r.error ? (
                  <span style={{ color: "#e74c3c", fontSize: 11, gridColumn: "2 / 4" }}>
                    ✕ {r.error}
                  </span>
                ) : (
                  <>
                    <span style={{ fontWeight: 600, color: THEME.page.textPrimary, fontFamily: "monospace" }}>
                      = {r.result?.toFixed(2)}
                    </span>
                    <span style={{ color: THEME.page.textMuted, fontSize: 11, textAlign: "right" }}>
                      {r.durationMs?.toFixed(3)} ms
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
