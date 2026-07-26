import type { LucideIcon } from "lucide-react";

type AppPagePlaceholderProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

export default function AppPagePlaceholder({
  eyebrow,
  title,
  description,
  icon: Icon,
}: AppPagePlaceholderProps) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="app-atmosphere min-h-[calc(100dvh-68px)] px-4 py-6 sm:px-6 lg:px-8"
    >
      <div className="relative mx-auto max-w-[1680px]">
        <section className="az-card overflow-hidden p-6 sm:p-8">
          <div className="max-w-2xl">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand">
              <Icon size={22} strokeWidth={1.8} />
            </span>
            <p className="az-eyebrow mt-6">{eyebrow}</p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              {title}
            </h1>
            <p className="mt-4 text-sm leading-7 text-ink-soft sm:text-base">
              {description}
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {["Workspace", "Data states", "Decision context"].map((label) => (
              <div
                key={label}
                className="rounded-2xl border border-stroke bg-surface-soft p-5"
              >
                <div className="h-2 w-20 rounded-full bg-brand/20" />
                <p className="mt-5 text-sm font-semibold text-ink">{label}</p>
                <div className="mt-3 space-y-2">
                  <div className="h-2 rounded-full bg-stroke" />
                  <div className="h-2 w-4/5 rounded-full bg-stroke" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
