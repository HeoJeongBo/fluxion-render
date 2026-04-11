import { THEME } from "../../../shared/ui/theme";

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
        borderBottom: `1px solid ${THEME.page.border}`,
        background: THEME.panel.background,
      }}
    >
      <strong style={{ marginRight: 16, color: THEME.page.textPrimary }}>
        FluxionRender
      </strong>
      {items.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            style={{
              background: isActive
                ? THEME.button.background
                : THEME.button.inactiveBackground,
              color: isActive ? THEME.button.text : THEME.button.inactiveText,
              border: `1px solid ${
                isActive ? THEME.button.border : THEME.button.inactiveBorder
              }`,
              padding: "6px 12px",
              borderRadius: 6,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </header>
  );
}
