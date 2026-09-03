import axios from "axios";
import { getCurrentSession, signOutOwner } from "../auth/supabase";

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL?.trim() ||
  "https://api.azalens.com";

export const publicApi = axios.create({
  baseURL: apiBaseUrl.replace(/\/+$/, ""),
  timeout: 60000,
  withCredentials: true,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

export const api = axios.create({
  baseURL: apiBaseUrl.replace(/\/+$/, ""),
  timeout: 60000,
  withCredentials: true,
  headers: { Accept: "application/json", "Content-Type": "application/json" },
});

export type AuthenticationFailure = { status: 401 | 403; code?: string };
const authenticationFailureListeners = new Set<(failure: AuthenticationFailure) => void>();

export function onAuthenticationFailure(listener: (failure: AuthenticationFailure) => void) {
  authenticationFailureListeners.add(listener);
  return () => authenticationFailureListeners.delete(listener);
}

api.interceptors.request.use(async (config) => {
  const session = await getCurrentSession();
  if (!session?.access_token) return Promise.reject(new Error("A verified owner session is required."));
  config.headers.delete?.("Authorization");
  config.headers.set("Authorization", `Bearer ${session.access_token}`);
  return config;
});

api.interceptors.response.use(undefined, async (error) => {
  const status = error?.response?.status;
  const code = error?.response?.data?.code;
  if (status === 401 && code === "CLOSED_DEMO_ACCESS_REQUIRED") {
    for (const listener of authenticationFailureListeners) listener({ status, code });
  } else if (status === 401 || (status === 403 && code === "OWNER_IDENTITY_REQUIRED")) {
    await signOutOwner();
    for (const listener of authenticationFailureListeners) listener({ status, code });
  }
  return Promise.reject(error);
});
