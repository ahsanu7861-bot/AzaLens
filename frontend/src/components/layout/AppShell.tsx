import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CircleHelp,
  Command,
  LayoutDashboard,
  ListChecks,
  Radar,
  Search,
  Settings,
} from "lucide-react";
import { lazy, Suspense, useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { useCommandStore } from "../../store/commandStore";
import AzaLensLogo from "../brand/AzaLensLogo";
import ThemeToggle from "./ThemeToggle";

const loadCommandCenter = () => import("../command/CommandCenter");
const CommandCenter = lazy(loadCommandCenter);

const primaryNavigation = [
  {
    label: "Home",
    to: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Analyze",
    to: "/analysis/AAPL",
    icon: BarChart3,
  },
  {
    label: "Markets",
    to: "/scanner",
    icon: Radar,
  },
  {
    label: "Portfolio",
    to: "/portfolio",
    icon: BriefcaseBusiness,
  },
  {
    label: "Watchlists",
    to: "/watchlist",
    icon: ListChecks,
  },
];

function RailLink({
  label,
  to,
  icon: Icon,
  isActive,
}: (typeof primaryNavigation)[number] & { isActive: boolean }) {
  return (
    <NavLink
      to={to}
      className={[
        "az-rail-link group",
        isActive ? "az-rail-link-active" : "",
      ].join(" ")}
      aria-label={label}
      aria-current={isActive ? "page" : undefined}
      title={label}
    >
      <Icon size={20} strokeWidth={1.75} />
      <span className="az-rail-tooltip">{label}</span>
    </NavLink>
  );
}

export default function AppShell() {
  const setCommandOpen = useCommandStore((state) => state.setOpen);
  const commandOpen = useCommandStore((state) => state.open);
  const location = useLocation();

  function isItemActive(to: string) {
    if (to.startsWith("/analysis/")) {
      return location.pathname.startsWith("/analysis/");
    }

    return location.pathname === to;
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }

      if (event.key === "Escape") {
        setCommandOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setCommandOpen]);

  return (
    <div className="app-shell min-h-[100dvh] bg-canvas text-ink">
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-[76px] flex-col border-r border-stroke bg-surface/95 backdrop-blur-xl lg:flex">
        <NavLink
          to="/dashboard"
          aria-label="AzaLens home"
          className="grid h-[68px] place-items-center border-b border-stroke"
        >
          <AzaLensLogo
            variant="symbol"
            decorative
            className="h-8 w-[35px] shrink-0"
          />
        </NavLink>

        <nav
          aria-label="Primary navigation"
          className="flex flex-1 flex-col items-center gap-2 px-3 py-5"
        >
          {primaryNavigation.map((item) => (
            <RailLink
              key={item.label}
              {...item}
              isActive={isItemActive(item.to)}
            />
          ))}
        </nav>

        <div className="flex flex-col items-center gap-2 border-t border-stroke px-3 py-4">
          <NavLink
            to="/settings"
            aria-label="Settings"
            title="Settings"
            className={({ isActive }) =>
              [
                "az-rail-link group",
                isActive ? "az-rail-link-active" : "",
              ].join(" ")
            }
          >
            <Settings size={20} strokeWidth={1.75} />
            <span className="az-rail-tooltip">Settings</span>
          </NavLink>

          <button
            type="button"
            aria-label="Help"
            title="Help"
            className="az-rail-link group"
          >
            <CircleHelp size={20} strokeWidth={1.75} />
            <span className="az-rail-tooltip">Help</span>
          </button>
        </div>
      </aside>

      <header className="fixed inset-x-0 top-0 z-40 flex h-[68px] items-center border-b border-stroke bg-surface/88 px-4 backdrop-blur-xl lg:left-[76px] lg:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <NavLink
            to="/dashboard"
            aria-label="AzaLens home"
            className="flex w-[38px] shrink-0 items-center justify-center lg:hidden sm:w-36"
          >
            <AzaLensLogo
              variant="symbol"
              decorative
              className="h-8 w-[35px] sm:hidden"
            />
            <AzaLensLogo
              decorative
              className="hidden h-8 w-36 sm:block"
            />
          </NavLink>

          <button
            type="button"
            aria-label="Search a company"
            aria-haspopup="dialog"
            aria-expanded={commandOpen}
            onClick={() => setCommandOpen(true)}
            onFocus={() => void loadCommandCenter()}
            onPointerEnter={() => void loadCommandCenter()}
            className="az-command-trigger ml-auto max-w-xl flex-1 sm:ml-3 lg:ml-0"
          >
            <Search size={17} strokeWidth={1.8} />
            <span className="hidden truncate text-left sm:block">
              Search a company, symbol or sector
            </span>
            <span className="sm:hidden">Search</span>
            <kbd className="ml-auto hidden items-center gap-1 rounded-md border border-stroke bg-surface-soft px-2 py-1 text-[10px] font-semibold text-ink-muted md:flex">
              <Command size={11} />
              K
            </kbd>
          </button>
        </div>

        <div className="ml-3 flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-full border border-stroke bg-surface-soft px-3 py-2 text-xs font-medium text-ink-soft xl:flex">
            <span className="h-2 w-2 rounded-full bg-positive shadow-[0_0_0_4px_var(--az-positive-soft)]" />
            Research mode
          </div>

          <button
            type="button"
            aria-label="Notifications"
            className="az-icon-button hidden sm:grid"
          >
            <Bell size={18} strokeWidth={1.8} />
          </button>

          <ThemeToggle />

          <button
            type="button"
            aria-label="Open account menu"
            className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand to-intelligence text-xs font-bold !text-white shadow-[0_8px_24px_var(--az-brand-soft)]"
          >
            AU
          </button>
        </div>
      </header>

      <div className="min-h-[100dvh] pb-24 pt-[68px] lg:pl-[76px] lg:pb-0">
        <Outlet />
      </div>

      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 grid h-14 grid-cols-5 border-t border-stroke bg-surface/95 px-1 pb-safe shadow-[0_-8px_30px_var(--az-shadow)] backdrop-blur-xl lg:hidden"
      >
        {primaryNavigation.map(({ label, to, icon: Icon }) => (
          <NavLink
            key={label}
            to={to}
            aria-current={isItemActive(to) ? "page" : undefined}
            className={() =>
              [
                "flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[11px] font-semibold transition",
                isItemActive(to)
                  ? "bg-brand/10 text-brand"
                  : "text-ink-muted hover:text-ink",
              ].join(" ")
            }
          >
            <Icon size={18} strokeWidth={1.8} />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
      </nav>

      {commandOpen && (
        <Suspense fallback={null}>
          <CommandCenter />
        </Suspense>
      )}
    </div>
  );
}
