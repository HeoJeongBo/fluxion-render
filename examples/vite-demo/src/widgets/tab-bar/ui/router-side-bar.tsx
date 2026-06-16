import { Link } from "@tanstack/react-router";
import { DEMO_GROUPS } from "../../../app/demo-registry";
import { THEME } from "../../../shared/ui/theme";

/**
 * Sidebar driven by the demo registry + TanStack Router. Each item is a `<Link>`
 * to `/${slug}`; the active state comes from the router (so deep-links and the
 * browser back/forward button highlight correctly), not local component state.
 */
export function RouterSideBar() {
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
        {DEMO_GROUPS.map((group) => (
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
            {group.demos.map((demo) => (
              <Link
                key={demo.slug}
                to="/$slug"
                params={{ slug: demo.slug }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 14px",
                  fontSize: 13,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  textDecoration: "none",
                  color: THEME.page.textPrimary,
                }}
                activeProps={{
                  style: {
                    background: THEME.button.background,
                    color: THEME.button.text,
                    fontWeight: 600,
                  },
                }}
              >
                {demo.label}
              </Link>
            ))}
          </section>
        ))}
      </div>
    </nav>
  );
}
