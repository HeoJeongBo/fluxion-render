import { WorkerHandle, WorkerTimeoutError } from "@heojeongbo/fluxion-worker";
import { useWorkerHandle, useWorkerRequest } from "@heojeongbo/fluxion-worker/react";
import { useMemo, useState } from "react";
import { THEME } from "../../../shared/ui/theme";
import type { CalcMsg, CalcOp, CalcResultMsg } from "../lib/calc-worker";

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

const HOOK_SNIPPET = `import {
  useWorkerHandle,
  useWorkerRequest,
} from "@heojeongbo/fluxion-worker/react";

// 1. Create (and auto-dispose) a WorkerHandle
const handle = useWorkerHandle(
  () => new WorkerHandle(
    () => new Worker(new URL("./calc-worker.ts", import.meta.url), { type: "module" })
  ),
);

// 2. Stable message reference (avoids re-fires)
const msg = useMemo(
  () => ({ op, values }),
  [op, values],
);

// 3. Reactive request — cancels on msg/handle change
const { data, loading, error } = useWorkerRequest<
  CalcMsg,
  CalcResultMsg
>(handle, msg, { timeoutMs: 5000 });`;

function randomValues(n: number): number[] {
  return Array.from({ length: n }, () => Math.round(Math.random() * 1000));
}

const OP_CONFIGS: { op: CalcOp; label: string; count: number }[] = [
  { op: "sum", label: "sum (100 values)", count: 100 },
  { op: "mean", label: "mean (1 000 values)", count: 1_000 },
  { op: "max", label: "max (10 000 values)", count: 10_000 },
];

export function ReactHooksTab() {
  const [op, setOp] = useState<CalcOp>("sum");
  const [valueCount, setValueCount] = useState(100);
  const [seed, setSeed] = useState(0);

  const handle = useWorkerHandle(
    () =>
      new WorkerHandle(
        () =>
          new Worker(new URL("../lib/calc-worker.ts", import.meta.url), {
            type: "module",
          }),
      ),
  );

  const msg = useMemo<CalcMsg>(
    () => ({ op, values: randomValues(valueCount) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [op, valueCount, seed],
  );

  const { data, loading, error } = useWorkerRequest<CalcMsg, CalcResultMsg>(handle, msg, {
    timeoutMs: 5_000,
  });

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
        {/* Op selector */}
        <div>
          <div style={SECTION_LABEL}>Operation</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {OP_CONFIGS.map(({ op: o, label, count }) => (
              <button
                key={o}
                onClick={() => {
                  setOp(o);
                  setValueCount(count);
                }}
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  border: `1px solid ${o === op ? THEME.button.border : THEME.page.border}`,
                  borderRadius: 4,
                  background:
                    o === op ? THEME.button.background : THEME.button.inactiveBackground,
                  color: o === op ? THEME.button.text : THEME.button.inactiveText,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Re-run button */}
        <div>
          <div style={SECTION_LABEL}>Re-run</div>
          <button
            onClick={() => setSeed((s) => s + 1)}
            style={{
              padding: "6px 14px",
              fontSize: 12,
              border: `1px solid ${THEME.page.border}`,
              borderRadius: 4,
              background: THEME.button.inactiveBackground,
              color: THEME.button.inactiveText,
              cursor: "pointer",
            }}
          >
            New random values
          </button>
          <div style={{ marginTop: 6, fontSize: 11, color: THEME.page.textMuted }}>
            msg is memoized — useWorkerRequest only re-fires when msg reference changes
          </div>
        </div>

        {/* Handle status */}
        <div>
          <div style={SECTION_LABEL}>Handle status</div>
          <div
            style={{
              background: THEME.page.background,
              border: `1px solid ${THEME.page.border}`,
              borderRadius: 4,
              padding: "8px 12px",
              fontSize: 12,
              fontFamily: "monospace",
              color: THEME.page.textSecondary,
            }}
          >
            handle:{" "}
            <span
              style={{ color: handle ? THEME.button.background : THEME.page.textMuted }}
            >
              {handle ? "ready" : "null (initializing…)"}
            </span>
          </div>
        </div>

        {/* Code snippet */}
        <div>
          <div style={SECTION_LABEL}>Code</div>
          <div style={CODE_STYLE}>{HOOK_SNIPPET}</div>
        </div>
      </div>

      {/* Result panel */}
      <div
        style={{
          flex: 1,
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          background: THEME.page.background,
          overflowY: "auto",
        }}
      >
        {/* State indicators */}
        <div style={{ display: "flex", gap: 10 }}>
          {(["loading", "data", "error"] as const).map((k) => {
            const active = k === "loading" ? loading : k === "data" ? !!data : !!error;
            return (
              <span
                key={k}
                style={{
                  padding: "3px 10px",
                  borderRadius: 12,
                  fontSize: 11,
                  fontFamily: "monospace",
                  background: active
                    ? k === "error"
                      ? "#c0392b22"
                      : THEME.button.background
                    : THEME.panel.background,
                  color: active
                    ? k === "error"
                      ? "#e74c3c"
                      : THEME.button.text
                    : THEME.page.textMuted,
                  border: `1px solid ${
                    active
                      ? k === "error"
                        ? "#c0392b44"
                        : THEME.button.border
                      : THEME.page.border
                  }`,
                }}
              >
                {k}
              </span>
            );
          })}
        </div>

        {/* Result */}
        {loading && (
          <div style={{ color: THEME.page.textMuted, fontSize: 13 }}>computing…</div>
        )}
        {error && (
          <div
            style={{
              padding: "12px 16px",
              background: "#c0392b11",
              border: "1px solid #c0392b44",
              borderRadius: 4,
              fontSize: 13,
              color: "#e74c3c",
            }}
          >
            {WorkerTimeoutError.is(error)
              ? `timed out after ${error.timeoutMs}ms`
              : error.message}
          </div>
        )}
        {data && !loading && (
          <div
            style={{
              padding: "16px 20px",
              background: THEME.panel.background,
              border: `1px solid ${THEME.page.border}`,
              borderRadius: 4,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: THEME.page.textMuted,
                fontFamily: "monospace",
              }}
            >
              op: <span style={{ color: THEME.button.background }}>{data.op}</span>
            </div>
            <div
              style={{
                fontSize: 32,
                fontWeight: 700,
                fontFamily: "monospace",
                color: THEME.page.textPrimary,
              }}
            >
              {data.result.toFixed(4)}
            </div>
            <div
              style={{
                fontSize: 11,
                color: THEME.page.textMuted,
                fontFamily: "monospace",
              }}
            >
              {data.durationMs.toFixed(3)} ms &middot; {valueCount.toLocaleString()}{" "}
              values
            </div>
          </div>
        )}

        {!loading && !data && !error && handle && (
          <div style={{ color: THEME.page.textMuted, fontSize: 13 }}>
            Waiting for result…
          </div>
        )}
      </div>
    </div>
  );
}
