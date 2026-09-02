import { createContext, useContext } from "react";

export type OwnerSessionControls = { signOut: () => Promise<void> };
export const OwnerSessionContext = createContext<OwnerSessionControls | null>(null);

export function useOwnerSession() {
  const value = useContext(OwnerSessionContext);
  if (!value) throw new Error("Owner session controls require ClosedDemoGate.");
  return value;
}
