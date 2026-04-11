export interface WindowOption {
  label: string;
  ms: number;
}

export const DEFAULT_WINDOW_OPTIONS: readonly WindowOption[] = [
  { label: "2s", ms: 2000 },
  { label: "5s", ms: 5000 },
  { label: "10s", ms: 10_000 },
  { label: "30s", ms: 30_000 },
  { label: "60s", ms: 60_000 },
];

export interface WindowSelectorProps {
  value: number;
  onChange: (ms: number) => void;
  options?: readonly WindowOption[];
  compact?: boolean;
}

/**
 * Tiny segmented-button selector for choosing a time window. Used by the
 * streaming demos to let the user "filter" visible data to the last Ns.
 */
export function WindowSelector({
  value,
  onChange,
  options = DEFAULT_WINDOW_OPTIONS,
  compact = false,
}: WindowSelectorProps) {
  const padY = compact ? 2 : 4;
  const padX = compact ? 6 : 10;
  const fontSize = compact ? 11 : 12;

  return (
    <div
      style={{
        display: "inline-flex",
        gap: 4,
        padding: 2,
        background: "rgba(42, 50, 71, 0.7)",
        border: "1px solid #2a3247",
        borderRadius: 6,
      }}
    >
      {options.map((opt) => {
        const active = opt.ms === value;
        return (
          <button
            key={opt.ms}
            type="button"
            onClick={() => onChange(opt.ms)}
            style={{
              background: active ? "#4a5a80" : "transparent",
              color: active ? "#fff" : "#9ad",
              border: "none",
              padding: `${padY}px ${padX}px`,
              borderRadius: 4,
              cursor: "pointer",
              fontSize,
              fontFamily: "inherit",
              minWidth: 28,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
