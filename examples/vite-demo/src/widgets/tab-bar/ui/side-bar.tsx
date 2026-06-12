import { THEME } from "../../../shared/ui/theme";

export interface SideBarItem<T extends string> {
  id: T;
  label: string;
}

export interface SideBarGroup<T extends string> {
  label: string;
  items: SideBarItem<T>[];
}

export interface SideBarProps<T extends string> {
  groups: readonly SideBarGroup<T>[];
  active: T;
  onSelect: (id: T) => void;
}

export function SideBar<T extends string>({ groups, active, onSelect }: SideBarProps<T>) {
  return (
    <nav
      style={{
        width: 192,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        borderRight: `1px solid ${THEME.page.border}`,
        background: THEME.panel.background,
        overflowY: "auto",
      }}
    >
      <div
        style={{
          padding: "14px 14px 10px",
          borderBottom: `1px solid ${THEME.page.border}`,
          flexShrink: 0,
        }}
      >
        <strong
          style={{
            fontSize: 13,
            color: THEME.page.textPrimary,
            letterSpacing: "-0.01em",
          }}
        >
          FluxionRender
        </strong>
      </div>

      <div style={{ flex: 1, padding: "6px 0 12px" }}>
        {groups.map((group) => (
          <section key={group.label} style={{ marginBottom: 4 }}>
            <div
              style={{
                padding: "10px 14px 4px",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: THEME.page.textMuted,
                userSelect: "none",
              }}
            >
              {group.label}
            </div>
            {group.items.map((item) => {
              const isActive = active === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "6px 14px",
                    fontSize: 13,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    border: "none",
                    borderRadius: 0,
                    background: isActive ? THEME.button.background : "transparent",
                    color: isActive ? THEME.button.text : THEME.page.textPrimary,
                    fontWeight: isActive ? 600 : 400,
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </section>
        ))}
      </div>
    </nav>
  );
}
