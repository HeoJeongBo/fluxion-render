export interface TabBarItem<T extends string> {
  id: T;
  label: string;
}

export interface TabBarProps<T extends string> {
  items: readonly TabBarItem<T>[];
  active: T;
  onSelect: (id: T) => void;
}

export function TabBar<T extends string>({ items, active, onSelect }: TabBarProps<T>) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 16px",
        borderBottom: "1px solid #1b1f2a",
      }}
    >
      <strong style={{ marginRight: 16 }}>FluxionRender</strong>
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onSelect(t.id)}
          style={{
            background: active === t.id ? "#2a3247" : "transparent",
            color: "#e6e6e6",
            border: "1px solid #2a3247",
            padding: "6px 12px",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          {t.label}
        </button>
      ))}
    </header>
  );
}
