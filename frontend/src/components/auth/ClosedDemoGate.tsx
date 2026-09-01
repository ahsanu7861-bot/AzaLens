import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { api } from "../../services/api";
import AzaLensLogo from "../brand/AzaLensLogo";

type GateState = "checking" | "open" | "locked";

export default function ClosedDemoGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>("checking");
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    api.get("/auth/demo/status")
      .then(({ data }) => {
        if (active) setState(data?.authorized ? "open" : "locked");
      })
      .catch(() => {
        if (active) setState("locked");
      });
    return () => { active = false; };
  }, []);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.post("/auth/demo/unlock", { accessCode });
      setState("open");
    } catch {
      setError("That access code is not valid. Please check it and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (state === "open") return children;

  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-6 py-12 text-ink">
      <section className="w-full max-w-md rounded-3xl border border-line bg-surface p-8 shadow-xl">
        <AzaLensLogo className="h-9 w-[162px]" />
        <p className="mt-7 text-xs font-semibold uppercase tracking-[0.2em] text-brand">Private personal workspace</p>
        <h1 className="mt-3 text-3xl font-semibold">Owner access required.</h1>
        <p className="mt-3 text-sm leading-6 text-ink-muted">
          This single-user screening and thesis workspace is available only to its owner. It is not a public or shared data service.
        </p>
        {state === "checking" ? (
          <div className="mt-8 flex items-center gap-3 text-sm text-ink-muted" role="status">
            <AzaLensLogo
              variant="loading"
              decorative
              className="h-10 w-10 shrink-0"
            />
            <span>Checking access…</span>
          </div>
        ) : (
          <form className="mt-8 space-y-4" onSubmit={unlock}>
            <label className="block text-sm font-medium" htmlFor="demo-access-code">Owner access code</label>
            <input
              id="demo-access-code"
              autoComplete="current-password"
              className="w-full rounded-xl border border-line bg-canvas px-4 py-3 outline-none focus:border-brand"
              type="password"
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value)}
              required
            />
            {error ? <p className="text-sm text-critical" role="alert">{error}</p> : null}
            <button
              className="w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white disabled:opacity-60"
              disabled={submitting}
              type="submit"
            >
              {submitting ? "Checking…" : "Enter workspace"}
            </button>
            <a className="block text-center text-sm text-brand hover:underline" href="/">Return to public website</a>
          </form>
        )}
      </section>
    </main>
  );
}
