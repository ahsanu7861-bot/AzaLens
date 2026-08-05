import {
  Activity,
  BrainCircuit,
  Building2,
  Gauge,
  LayoutDashboard,
  ShieldCheck,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import type { WorkspaceTab } from "../../types/overview";
import type { WorkspaceId } from "./workspaces";

interface WorkspaceTabsNavProps {
  activeWorkspace: WorkspaceId;
  onChange: (workspace: WorkspaceId) => void;
}

const workspaces: WorkspaceTab<WorkspaceId>[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "technical", label: "Technical", icon: Activity },
  { id: "fundamentals", label: "Fundamentals", icon: Building2 },
  { id: "risk", label: "Risk", icon: Gauge },
  { id: "shariah", label: "Shariah", icon: ShieldCheck },
  { id: "thesis", label: "Thesis", icon: BrainCircuit },
];

export default function WorkspaceTabsNav({
  activeWorkspace,
  onChange,
}: WorkspaceTabsNavProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [showRightFade, setShowRightFade] = useState(false);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const updateFade = () => {
      setShowRightFade(
        scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 2,
      );
    };
    updateFade();
    scroller.addEventListener("scroll", updateFade, { passive: true });
    const observer = new ResizeObserver(updateFade);
    observer.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", updateFade);
      observer.disconnect();
    };
  }, []);

  function moveFocus(nextIndex: number) {
    const nextWorkspace = workspaces[nextIndex];
    if (!nextWorkspace) return;

    onChange(nextWorkspace.id);
    const nextTab = tabRefs.current[nextIndex];
    nextTab?.focus({ preventScroll: true });
    nextTab?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) {
    let nextIndex: number | null = null;

    switch (event.key) {
      case "ArrowRight":
        nextIndex = (currentIndex + 1) % workspaces.length;
        break;
      case "ArrowLeft":
        nextIndex =
          (currentIndex - 1 + workspaces.length) % workspaces.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = workspaces.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    moveFocus(nextIndex);
  }

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        className="az-tab-scroller no-scrollbar"
        role="tablist"
        aria-label="Analysis workspaces"
        aria-orientation="horizontal"
      >
        {workspaces.map(({ id, label, icon: Icon, ariaLabel }, index) => (
          <button
            key={id}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            id={`workspace-tab-${id}`}
            type="button"
            role="tab"
            aria-label={ariaLabel}
            aria-selected={activeWorkspace === id}
            aria-controls={`workspace-panel-${id}`}
            tabIndex={activeWorkspace === id ? 0 : -1}
            onClick={() => onChange(id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={[
              "az-workspace-tab min-h-[44px] min-w-[44px]",
              activeWorkspace === id ? "az-workspace-tab-active" : "",
            ].join(" ")}
          >
            <Icon size={16} strokeWidth={1.8} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div
        aria-hidden="true"
        className={[
          "pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-surface via-surface/85 to-transparent transition-opacity",
          showRightFade ? "opacity-100" : "opacity-0",
        ].join(" ")}
      />
    </div>
  );
}
