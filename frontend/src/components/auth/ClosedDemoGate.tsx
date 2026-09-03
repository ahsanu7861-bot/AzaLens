import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";

import { OwnerSessionContext } from "../../auth/OwnerSessionContext";
import { getCurrentSession, signInOwner, signOutOwner, supabase, supabaseAuthConfigured } from "../../auth/supabase";
import { onAuthenticationFailure, publicApi } from "../../services/api";
import AzaLensLogo from "../brand/AzaLensLogo";

type GateState = "checking-demo" | "locked" | "checking-session" | "sign-in" | "open";

export default function ClosedDemoGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>("checking-demo");
  const [accessCode, setAccessCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    publicApi.get("/auth/demo/status")
      .then(async ({ data }) => {
        if (!active) return;
        if (!data?.authorized) return setState("locked");
        setState("checking-session");
        const session = await getCurrentSession();
        if (active) setState(session ? "open" : "sign-in");
      })
      .catch(() => {
        if (active) setState("locked");
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (state !== "locked" && state !== "checking-demo") setState(session ? "open" : "sign-in");
    });
    const removeFailureListener = onAuthenticationFailure(({ code }) => {
      setState(code === "CLOSED_DEMO_ACCESS_REQUIRED" ? "locked" : "sign-in");
    });
    return () => {
      data.subscription.unsubscribe();
      removeFailureListener();
    };
  }, [state]);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await publicApi.post("/auth/demo/unlock", { accessCode });
      setState("checking-session");
      setState((await getCurrentSession()) ? "open" : "sign-in");
    } catch {
      setError("That access code is not valid. Please check it and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await signInOwner(email.trim(), password);
      setPassword("");
      setState("open");
    } catch {
      setPassword("");
      setError("A verified owner session is required.");
    } finally {
      setSubmitting(false);
    }
  }

  const signOut = useCallback(async () => {
    await signOutOwner();
    setState("sign-in");
  }, []);

  if (state === "open") return <OwnerSessionContext.Provider value={{ signOut }}>{children}</OwnerSessionContext.Provider>;

  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-6 py-12 text-ink">
      <section className="w-full max-w-md rounded-3xl border border-line bg-surface p-8 shadow-xl">
        <AzaLensLogo className="h-9 w-[162px]" />
        <p className="mt-7 text-xs font-semibold uppercase tracking-[0.2em] text-brand">Private personal workspace</p>
        <h1 className="mt-3 text-3xl font-semibold">Owner access required.</h1>
        <p className="mt-3 text-sm leading-6 text-ink-muted">
          This single-user screening and thesis workspace is available only to its owner. It is not a public or shared data service.
        </p>
        {state === "checking-demo" || state === "checking-session" ? (
          <div className="mt-8 flex items-center gap-3 text-sm text-ink-muted" role="status">
            <AzaLensLogo
              variant="loading"
              decorative
              className="h-10 w-10 shrink-0"
            />
            <span>Checking access…</span>
          </div>
        ) : state === "locked" ? (
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
        ) : (
          <form className="mt-8 space-y-4" onSubmit={signIn}>
            <h2 className="text-lg font-semibold">Owner sign in</h2>
            <p className="text-sm text-ink-muted">A verified owner session is required.</p>
            <label className="block text-sm font-medium" htmlFor="owner-email">Email</label>
            <input id="owner-email" autoComplete="username" className="w-full rounded-xl border border-line bg-canvas px-4 py-3 outline-none focus:border-brand" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <label className="block text-sm font-medium" htmlFor="owner-password">Password</label>
            <input id="owner-password" autoComplete="current-password" className="w-full rounded-xl border border-line bg-canvas px-4 py-3 outline-none focus:border-brand" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            {error ? <p className="text-sm text-critical" role="alert">{error}</p> : null}
            <button className="w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white disabled:opacity-60" disabled={submitting || !supabaseAuthConfigured} type="submit">
              {submitting ? "Signing in…" : "Owner sign in"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
