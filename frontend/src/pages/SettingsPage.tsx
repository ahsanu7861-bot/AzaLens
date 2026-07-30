import {
  BellOff,
  Check,
  Database,
  Eye,
  Gauge,
  LockKeyhole,
  Monitor,
  Moon,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { useState } from "react";

import {
  defaultLocalSettings,
  readLocalSettings,
  writeLocalSettings,
  type DefaultWorkspace,
  type LocalSettings,
  type MotionPreference,
} from "../app/preferences";
import { useTheme, type ThemePreference } from "../app/providers/theme";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";

const themeOptions: Array<{
  value: ThemePreference;
  label: string;
  detail: string;
  icon: typeof Monitor;
}> = [
  { value: "system", label: "System", detail: "Follow this device", icon: Monitor },
  { value: "day", label: "Day", detail: "Light workspace", icon: Sun },
  { value: "night", label: "Night", detail: "Dark workspace", icon: Moon },
];

const workspaceOptions: Array<{ value: DefaultWorkspace; label: string }> = [
  { value: "overview", label: "Overview" },
  { value: "technical", label: "Technical evidence" },
  { value: "fundamentals", label: "Fundamentals" },
  { value: "risk", label: "Risk assessment" },
  { value: "shariah", label: "AAOIFI Shariah" },
  { value: "thesis", label: "AI thesis" },
];

function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Eye;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-brand/20 bg-brand/10 text-brand">
        <Icon size={18} />
      </span>
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-ink-muted">{description}</p>
      </div>
    </div>
  );
}

function ChoiceButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={[
        "relative min-h-16 rounded-2xl border px-4 py-3 text-left transition",
        selected
          ? "border-brand/50 bg-brand/10 text-ink"
          : "border-stroke bg-surface-soft text-ink-soft hover:border-stroke-strong hover:text-ink",
      ].join(" ")}
    >
      {children}
      {selected && (
        <span className="absolute right-3 top-3 text-brand" aria-hidden="true">
          <Check size={16} />
        </span>
      )}
    </button>
  );
}

export default function SettingsPage() {
  const { preference, resolvedTheme, setPreference } = useTheme();
  const [settings, setSettings] = useState<LocalSettings>(readLocalSettings);
  const [saved, setSaved] = useState(false);

  function updateSettings(patch: Partial<LocalSettings>) {
    setSettings((current) => ({ ...current, ...patch }));
    setSaved(false);
  }

  function saveSettings() {
    writeLocalSettings(settings);
    setSaved(true);
  }

  function resetSettings() {
    setPreference("system");
    setSettings(defaultLocalSettings);
    writeLocalSettings(defaultLocalSettings);
    setSaved(true);
  }

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-7 pb-24 sm:px-6 lg:px-8">
      <header className="mb-7 flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-brand/20 bg-brand/10 text-brand">
          <Settings />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Your workspace</p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">Settings</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
            Personalize this browser. These preferences are saved only on this device until AzaLens accounts are introduced.
          </p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          <Card>
            <SectionHeading icon={Eye} title="Appearance" description={`Choose how AzaLens looks. Your current resolved theme is ${resolvedTheme}.`} />
            <div className="mt-5 grid gap-3 sm:grid-cols-3" role="group" aria-label="Color theme">
              {themeOptions.map(({ value, label, detail, icon: Icon }) => (
                <ChoiceButton key={value} selected={preference === value} onClick={() => setPreference(value)}>
                  <Icon size={19} className="mb-2 text-brand" />
                  <span className="block pr-5 text-sm font-semibold">{label}</span>
                  <span className="mt-0.5 block text-xs text-ink-muted">{detail}</span>
                </ChoiceButton>
              ))}
            </div>
          </Card>

          <Card>
            <SectionHeading icon={Gauge} title="Accessibility" description="Control non-essential interface motion without changing analytical content." />
            <div className="mt-5 grid gap-3 sm:grid-cols-2" role="group" aria-label="Motion preference">
              {([
                ["system", "System motion", "Respect this device’s accessibility preference"],
                ["reduced", "Reduce motion", "Minimize transitions and entrance effects"],
              ] as Array<[MotionPreference, string, string]>).map(([value, label, detail]) => (
                <ChoiceButton key={value} selected={settings.motion === value} onClick={() => updateSettings({ motion: value })}>
                  <span className="block pr-5 text-sm font-semibold">{label}</span>
                  <span className="mt-1 block text-xs leading-5 text-ink-muted">{detail}</span>
                </ChoiceButton>
              ))}
            </div>
          </Card>

          <Card>
            <SectionHeading icon={Database} title="Research defaults" description="Choose the workspace opened when an analysis URL does not specify a tab." />
            <label className="mt-5 block text-sm font-semibold text-ink" htmlFor="default-workspace">
              Default analysis workspace
            </label>
            <select
              id="default-workspace"
              value={settings.defaultWorkspace}
              onChange={(event) => updateSettings({ defaultWorkspace: event.target.value as DefaultWorkspace })}
              className="mt-2 min-h-12 w-full rounded-xl border border-stroke bg-surface-soft px-4 text-sm text-ink focus:border-brand"
            >
              {workspaceOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
            <p className="mt-2 text-xs leading-5 text-ink-muted">
              Explicit shared links still open the workspace named in the link.
            </p>
          </Card>

          <Card>
            <SectionHeading icon={ShieldCheck} title="Privacy and safety" description="AzaLens keeps financial research transparent and does not silently turn it into a trading instruction." />
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-stroke bg-surface-soft p-4">
                <p className="text-sm font-semibold text-ink">Browser-only preferences</p>
                <p className="mt-1 text-xs leading-5 text-ink-muted">Settings stay in local browser storage. They are not uploaded or synced to an account.</p>
              </div>
              <div className="rounded-2xl border border-stroke bg-surface-soft p-4">
                <p className="text-sm font-semibold text-ink">Research, not execution</p>
                <p className="mt-1 text-xs leading-5 text-ink-muted">No setting can place a trade, connect a broker, or convert analysis into an order.</p>
              </div>
            </div>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={saveSettings}>Save preferences</Button>
            <Button variant="secondary" onClick={resetSettings}><RotateCcw size={16} /> Reset defaults</Button>
            <p role="status" aria-live="polite" className="text-sm font-medium text-positive">
              {saved ? "Preferences saved on this device." : ""}
            </p>
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card variant="brand">
            <div className="flex items-center gap-2 text-brand"><LockKeyhole size={17} /><h2 className="font-display font-semibold">Account status</h2></div>
            <p className="mt-3 text-sm font-semibold text-ink">Local workspace</p>
            <p className="mt-1 text-xs leading-5 text-ink-muted">Sign-in and cross-device sync are not available yet. Watchlists and portfolios are not user-isolated until accounts ship.</p>
            <span className="mt-4 inline-flex rounded-full border border-caution/25 bg-caution/10 px-2.5 py-1 text-[11px] font-semibold text-caution">Planned for accounts phase</span>
          </Card>

          <Card>
            <div className="flex items-center gap-2 text-ink-soft"><BellOff size={17} /><h2 className="font-display font-semibold text-ink">Notifications</h2></div>
            <p className="mt-3 text-xs leading-5 text-ink-muted">Price alerts, email updates and push notifications are not active. No notification controls are shown because there is no delivery service to honor them yet.</p>
          </Card>

          <Card>
            <h2 className="font-display font-semibold text-ink">Data truth</h2>
            <ul className="mt-3 space-y-2 text-xs leading-5 text-ink-muted">
              <li>• Preferences stay in this browser.</li>
              <li>• Theme changes apply immediately.</li>
              <li>• Research defaults apply after Save.</li>
              <li>• No setting places or recommends a trade.</li>
            </ul>
          </Card>
        </aside>
      </div>
    </main>
  );
}
