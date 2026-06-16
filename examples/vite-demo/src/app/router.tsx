import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { RouterSideBar } from "../widgets/tab-bar/ui/router-side-bar";
import { ALL_DEMOS, DEFAULT_DEMO_SLUG } from "./demo-registry";

/** App shell: persistent sidebar + routed main content. */
function RootLayout() {
  return (
    <div style={{ display: "flex", flexDirection: "row", height: "100%", width: "100%" }}>
      <RouterSideBar />
      <main style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <Outlet />
      </main>
    </div>
  );
}

const rootRoute = createRootRoute({ component: RootLayout });

// `/` → default demo.
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/$slug", params: { slug: DEFAULT_DEMO_SLUG } });
  },
});

// `/${slug}` → resolve the page component from the registry.
const demoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$slug",
  component: DemoRoute,
});

function DemoRoute() {
  const { slug } = demoRoute.useParams();
  const demo = ALL_DEMOS.find((d) => d.slug === slug);
  if (!demo) {
    return (
      <div style={{ padding: 24 }}>
        Unknown demo: <code>{slug}</code>
      </div>
    );
  }
  const Page = demo.component;
  return <Page />;
}

const routeTree = rootRoute.addChildren([indexRoute, demoRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
