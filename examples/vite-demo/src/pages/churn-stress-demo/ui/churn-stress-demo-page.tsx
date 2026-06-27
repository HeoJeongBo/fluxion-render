/**
 * Mount/Unmount churn stress — automatically mounts and unmounts ~300 charts on
 * a loop to verify the staggered lifecycle has no freeze or leak (the
 * accordion-collapse scenario: a big section of charts all torn down at once).
 *
 * Each chart is self-contained (its own host + a shared-ticker stream) and uses
 * the DEFAULT lifecycle — `staggerMount` is intentionally NOT passed, so both
 * the mount and the dispose are spread across animation frames by default.
 *
 * The bulk mount/unmount itself is synchronous (React swaps the whole grid in
 * one commit — that's the stress being tested). The library only staggers the
 * expensive part: the OffscreenCanvas transfer + worker host spin-up/teardown.
 * That staggering is invisible unless you watch for it, so two readouts make it
 * observable:
 *   - **hosts ready** climbs 0 → N over several frames as deferred hosts come
 *     online (lower `perFrame` to watch it spread further). If it jumped to N
 *     instantly the staggering would be broken.
 *   - **worst frame** stays low (tens of ms). A bulk-teardown freeze would spike
 *     it into the hundreds.
 */
import type { FluxionHost, LineSample } from "@heojeongbo/fluxion-render";
import { createFluxionWorkerFactory } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  configureMountScheduler,
  FluxionCanvas,
  type HostRecyclePool,
  lineLayer,
  useFluxionStream,
  useFluxionWorkerPool,
  useHostRecyclePool,
  useTimeOrigin,
} from "@heojeongbo/fluxion-render/react";
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { generateFloat32StampedBatch, stampToMs } from "../../../shared/lib/test-data";
import { THEME } from "../../../shared/ui/theme";

const COUNT_OPTIONS = [100, 200, 300] as const;
const CHURN_OPTIONS = [1000, 2000, 4000] as const;
// Mount-scheduler drain rate (hosts spun up per animation frame). Lower = the
// staggered mount visibly spreads over more frames; the library default is 4.
const PERFRAME_OPTIONS = [2, 4, 8, 16] as const;
const STREAM_HZ = 30;

const COLORS = [
  "#4fc3f7",
  "#80ffa0",
  "#ffb060",
  "#f48fb1",
  "#ce93d8",
  "#80cbc4",
  "#ffcc02",
  "#ef9a9a",
];

type Pool = ReturnType<typeof useFluxionWorkerPool>;
type ChurnMode = "remount" | "toggle";

/**
 * Main-thread frame-cadence meter. A bulk-unmount freeze shows up as a large
 * gap between animation frames, so `worstMs` (the longest frame in the last
 * ~500ms window) is the freeze indicator; `maxMs` is the session peak.
 */
function useFrameStats(): { fps: number; worstMs: number; maxMs: number } {
  const [stats, setStats] = useState({ fps: 0, worstMs: 0, maxMs: 0 });
  useEffect(() => {
    let last = performance.now();
    let lastReport = last;
    let frames = 0;
    let acc = 0;
    let worst = 0;
    let sessionMax = 0;
    let raf = 0;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      frames++;
      acc += dt;
      if (dt > worst) worst = dt;
      if (dt > sessionMax) sessionMax = dt;
      if (now - lastReport >= 500) {
        setStats({
          fps: Math.round((frames * 1000) / acc),
          worstMs: Math.round(worst),
          maxMs: Math.round(sessionMax),
        });
        frames = 0;
        acc = 0;
        worst = 0;
        lastReport = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return stats;
}

function MiniChart({
  index,
  pool,
  recyclePool,
  timeOrigin,
  onHostReady,
}: {
  index: number;
  pool: Pool;
  recyclePool: HostRecyclePool | undefined;
  timeOrigin: number;
  onHostReady: () => void;
}) {
  const color = COLORS[index % COLORS.length]!;
  const freqHz = 0.4 + (index % 11) * 0.25;
  const [host, setHost] = useState<FluxionHost | null>(null);

  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xMode: "time",
        timeWindowMs: 4000,
        timeOrigin,
        yMode: "auto",
        showXGrid: false,
        showYGrid: false,
        showXLabels: false,
        showYLabels: false,
        yPadPx: 3,
      }),
      lineLayer("line", { color, lineWidth: 1, retentionMs: 4000, maxHz: STREAM_HZ }),
    ],
    [timeOrigin, color],
  );

  // `shared: true` → all charts pump off ONE process-wide timer (not 300
  // setIntervals), so the frame meter measures the lifecycle churn, not timers.
  // `staggerMount` is intentionally omitted → default (deferred) mount + dispose.
  useFluxionStream({
    host,
    intervalMs: 1000 / STREAM_HZ,
    shared: true,
    setup: (h) => h.line("line"),
    tick: (t, handle) => {
      const msgs = generateFloat32StampedBatch(t, 1, 1000 / STREAM_HZ, {
        freqHz,
        amplitude: 0.8,
        seriesOffset: index * 0.3,
      });
      const samples: LineSample[] = msgs.map((m) => ({
        t: stampToMs(m.header),
        y: m.data,
      }));
      handle.pushBatch(samples);
      return samples.length;
    },
  });

  return (
    <div
      style={{
        position: "relative",
        minWidth: 0,
        minHeight: 0,
        background: THEME.panel.background,
        border: `1px solid ${THEME.page.border}`,
        borderRadius: 3,
        overflow: "hidden",
      }}
    >
      <FluxionCanvas
        externalAxes={false}
        layers={layers}
        recyclePool={recyclePool}
        hostOptions={{
          bgColor: THEME.chart.canvasBg,
          pool,
          maxFps: 30,
          emitBounds: false,
          emitTicks: false,
        }}
        onReady={(h) => {
          setHost(h);
          onHostReady();
        }}
      />
    </div>
  );
}

export function ChurnStressDemoPage() {
  const pool = useFluxionWorkerPool({
    size: 2,
    maxSize: Math.min(
      16,
      Math.max(
        2,
        ((typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4) - 1,
      ),
    ),
    targetPerWorker: 8,
    workerFactory: createFluxionWorkerFactory(),
  });

  // Warm-host pool. `max` ≥ the largest chart count so a full-grid remount can
  // recycle every host (a virtualized list, whose visible working set is small,
  // would use a much smaller cap). Disposed automatically on page leave.
  const recyclePool = useHostRecyclePool({ max: 320 });

  const timeOrigin = useTimeOrigin();
  const [count, setCount] = useState<number>(300);
  const [mode, setMode] = useState<ChurnMode>("remount");
  const [churnMs, setChurnMs] = useState<number>(2000);
  const [perFrame, setPerFrame] = useState<number>(4);
  const [recycle, setRecycle] = useState(false);
  const [running, setRunning] = useState(true);

  // remount mode: bumping `generation` remounts the whole grid (bulk unmount +
  // bulk mount). toggle mode: `visible` flips the grid on/off (explicit collapse).
  const [generation, setGeneration] = useState(0);
  const [visible, setVisible] = useState(true);
  const [cycles, setCycles] = useState(0);

  // How many deferred hosts have come online this cycle. Climbs 0 → N over
  // frames (proof the mount is staggered), reset whenever a new cycle starts.
  const [hostsReady, setHostsReady] = useState(0);

  const handleHostReady = useCallback(() => setHostsReady((c) => c + 1), []);

  const stats = useFrameStats();

  // Drives the mount-scheduler drain rate; restored to the library default on
  // leave so other demos aren't affected.
  useEffect(() => {
    configureMountScheduler({ perFrame });
    return () => configureMountScheduler({ perFrame: 4 });
  }, [perFrame]);

  // A new churn cycle (grid remount or collapse→expand) creates a fresh batch of
  // hosts, so the ready counter restarts from 0 (keyed on generation/visible) to
  // show that batch staggering in.
  useEffect(() => {
    setHostsReady(0);
  }, [generation, visible]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (mode === "remount") {
        setGeneration((g) => g + 1);
      } else {
        setVisible((v) => !v);
      }
      setCycles((c) => c + 1);
    }, churnMs);
    return () => clearInterval(id);
  }, [running, mode, churnMs]);

  const showGrid = mode === "remount" || visible;
  const mountedNow = showGrid ? count : 0;
  const cols = Math.max(1, Math.round(Math.sqrt((count * 4) / 3)));
  const worstColor =
    stats.maxMs > 150
      ? "#d14b4b"
      : stats.maxMs > 80
        ? "#c98a2e"
        : THEME.page.textSecondary;

  return (
    <div
      style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "8px 16px",
          borderBottom: `1px solid ${THEME.page.border}`,
          background: THEME.panel.background,
          fontSize: 12,
          color: THEME.page.textSecondary,
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        <strong style={{ color: THEME.page.textPrimary }}>Mount/Unmount Churn</strong>

        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          Charts:
          {COUNT_OPTIONS.map((n) => (
            <button
              type="button"
              key={n}
              onClick={() => setCount(n)}
              style={chipStyle(count === n)}
            >
              {n}
            </button>
          ))}
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          Mode:
          <button
            type="button"
            onClick={() => setMode("remount")}
            style={chipStyle(mode === "remount")}
          >
            remount
          </button>
          <button
            type="button"
            onClick={() => setMode("toggle")}
            style={chipStyle(mode === "toggle")}
          >
            toggle (collapse)
          </button>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          Every:
          {CHURN_OPTIONS.map((ms) => (
            <button
              type="button"
              key={ms}
              onClick={() => setChurnMs(ms)}
              style={chipStyle(churnMs === ms)}
            >
              {ms / 1000}s
            </button>
          ))}
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          perFrame:
          {PERFRAME_OPTIONS.map((n) => (
            <button
              type="button"
              key={n}
              onClick={() => setPerFrame(n)}
              style={chipStyle(perFrame === n)}
            >
              {n}
            </button>
          ))}
        </label>

        <button
          type="button"
          onClick={() => setRecycle((r) => !r)}
          style={chipStyle(recycle)}
          title="Reuse warm hosts on remount instead of recreating them"
        >
          recycle {recycle ? "on" : "off"}
        </button>

        <button
          type="button"
          onClick={() => setRunning((r) => !r)}
          style={chipStyle(running)}
        >
          {running ? "■ stop" : "▶ start"}
        </button>

        <span style={{ marginLeft: "auto", display: "flex", gap: 14 }}>
          <span>
            FPS <strong style={{ color: THEME.page.textPrimary }}>{stats.fps}</strong>
          </span>
          <span style={{ color: worstColor }}>
            worst frame <strong>{stats.worstMs} ms</strong> · session max{" "}
            <strong>{stats.maxMs} ms</strong>
          </span>
          <span>
            hosts ready{" "}
            <strong style={{ color: THEME.page.textPrimary }}>{hostsReady}</strong> /{" "}
            {mountedNow}
          </span>
          <span style={{ color: recycle ? "#80ffa0" : THEME.page.textSecondary }}>
            created{" "}
            <strong style={{ color: THEME.page.textPrimary }}>
              {recyclePool.stats.created}
            </strong>{" "}
            · recycled{" "}
            <strong style={{ color: THEME.page.textPrimary }}>
              {recyclePool.stats.recycled}
            </strong>
          </span>
          <span>
            cycles <strong style={{ color: THEME.page.textPrimary }}>{cycles}</strong>
          </span>
        </span>
      </div>

      <div
        style={{
          padding: "4px 16px",
          fontSize: 11,
          color: THEME.page.textMuted,
          borderBottom: `1px solid ${THEME.page.border}`,
          background: THEME.panel.background,
          flexShrink: 0,
        }}
      >
        The whole grid mounts/unmounts at once (React, synchronous) — that's the stress.
        The library staggers only the worker-host spin-up/teardown: watch{" "}
        <em>hosts ready</em> climb 0 → N across frames (lower <em>perFrame</em> to spread
        it further) and <em>worst frame</em> stay low. Toggle <em>recycle</em> to reuse
        warm hosts instead of recreating them — <em>created</em> stops climbing while{" "}
        <em>recycled</em> rises, and CPU drops sharply (the host create/destroy cost is
        what dominates churn).
      </div>

      {showGrid ? (
        <div
          key={generation}
          style={{
            flex: 1,
            minHeight: 0,
            padding: 6,
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridAutoRows: "1fr",
            gap: 3,
            background: THEME.page.background,
          }}
        >
          {Array.from({ length: count }, (_, i) => (
            <MiniChart
              key={i}
              index={i}
              pool={pool}
              recyclePool={recycle ? recyclePool : undefined}
              timeOrigin={timeOrigin}
              onHostReady={handleHostReady}
            />
          ))}
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: THEME.page.textMuted,
            background: THEME.page.background,
          }}
        >
          (collapsed — {count} charts unmounted)
        </div>
      )}
    </div>
  );
}

function chipStyle(active: boolean): CSSProperties {
  return {
    padding: "2px 10px",
    borderRadius: 4,
    cursor: "pointer",
    border: `1px solid ${active ? THEME.button.border : THEME.page.border}`,
    background: active ? THEME.button.background : THEME.button.inactiveBackground,
    color: active ? THEME.button.text : THEME.button.inactiveText,
    fontWeight: active ? 700 : 400,
  };
}
