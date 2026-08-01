import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  BrowserRouter,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";

import AppShell from "../components/layout/AppShell";

const ClosedDemoGate = lazy(
  () => import("../components/auth/ClosedDemoGate"),
);

const AnalysisPage = lazy(() => import("../pages/AnalysisPage"));
const DashboardPage = lazy(() => import("../pages/DashboardPage"));
const LandingPage = lazy(() => import("../pages/LandingPage"));
const PortfolioPage = lazy(() => import("../pages/PortfolioPage"));
const ScannerPage = lazy(() => import("../pages/ScannerPage"));
const SettingsPage = lazy(() => import("../pages/SettingsPage"));
const WatchlistPage = lazy(() => import("../pages/WatchlistPage"));

function PageLoader() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="grid min-h-[calc(100dvh-68px)] place-items-center bg-canvas px-6 text-center"
    >
      <div>
        <div
          aria-hidden="true"
          className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-brand/25 border-t-brand"
        />
        <p className="mt-4 text-sm font-medium text-ink-muted">
          Preparing your workspace…
        </p>
      </div>
    </div>
  );
}

function RouteFocusManager() {
  const { pathname } = useLocation();
  const previousPath = useRef(pathname);

  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;

    const root = document.querySelector("#root");
    let animationFrame = 0;
    let timeout = 0;
    let observer: MutationObserver | null = null;

    const focusMain = () => {
      const main = document.querySelector<HTMLElement>("#main-content");
      if (!main) return false;

      main.focus({ preventScroll: true });
      observer?.disconnect();
      window.clearTimeout(timeout);
      return true;
    };

    animationFrame = requestAnimationFrame(() => {
      if (focusMain() || !root) return;

      observer = new MutationObserver(() => {
        focusMain();
      });
      observer.observe(root, {
        childList: true,
        subtree: true,
      });
      timeout = window.setTimeout(() => {
        observer?.disconnect();
      }, 3_000);
    });

    return () => {
      cancelAnimationFrame(animationFrame);
      observer?.disconnect();
      window.clearTimeout(timeout);
    };
  }, [pathname]);

  return null;
}

function loadPage(page: ReactNode) {
  return <Suspense fallback={<PageLoader />}>{page}</Suspense>;
}

function focusMainContent(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();

  const focusMain = () => {
    const main = document.querySelector<HTMLElement>("#main-content");
    if (!main) return false;

    main.focus({ preventScroll: true });
    main.scrollIntoView({ block: "start" });
    return true;
  };

  if (focusMain()) return;

  const root = document.querySelector("#root");
  if (!root) return;

  const observer = new MutationObserver(() => {
    if (focusMain()) observer.disconnect();
  });
  observer.observe(root, {
    childList: true,
    subtree: true,
  });
  window.setTimeout(() => observer.disconnect(), 3_000);
}

export default function Router() {
  return (
    <BrowserRouter>
      <a
        className="az-skip-link"
        href="#main-content"
        onClick={focusMainContent}
      >
        Skip to main content
      </a>
      <RouteFocusManager />
      <Routes>
        <Route path="/" element={loadPage(<LandingPage />)} />
        <Route
          element={loadPage(
            <ClosedDemoGate>
              <AppShell />
            </ClosedDemoGate>,
          )}
        >
          <Route path="/dashboard" element={loadPage(<DashboardPage />)} />
          <Route path="/analysis/:symbol" element={loadPage(<AnalysisPage />)} />
          <Route path="/scanner" element={loadPage(<ScannerPage />)} />
          <Route path="/portfolio" element={loadPage(<PortfolioPage />)} />
          <Route path="/watchlist" element={loadPage(<WatchlistPage />)} />
          <Route path="/settings" element={loadPage(<SettingsPage />)} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
