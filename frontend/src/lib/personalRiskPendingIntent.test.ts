import { describe, expect, it, vi } from "vitest";
import { PENDING_INTENT_KEY, clearPendingIntent, readPendingIntent, writePendingIntent } from "./personalRiskPendingIntent";

const KEY="123e4567-e89b-42d3-a456-426614174000";
describe("personal-risk pending intent storage",()=>{
  it("stores only the exact operation and canonical UUID",()=>{const setItem=vi.fn();writePendingIntent({operation:"EQUITY_SNAPSHOT",idempotencyKey:KEY},{setItem});expect(setItem).toHaveBeenCalledWith(PENDING_INTENT_KEY,JSON.stringify({operation:"EQUITY_SNAPSHOT",idempotencyKey:KEY}));});
  it("removes malformed, extra-key, uppercase and financial storage",()=>{for(const value of ["{",JSON.stringify({operation:"POLICY_VERSION",idempotencyKey:KEY,accountEquity:"1"}),JSON.stringify({operation:"POLICY_VERSION",idempotencyKey:KEY.toUpperCase()})]){const removeItem=vi.fn();expect(readPendingIntent({getItem:()=>value,removeItem})).toEqual({intent:null,malformed:true});expect(removeItem).toHaveBeenCalledWith(PENDING_INTENT_KEY);}});
  it("reads and clears a valid exact record",()=>{const intent={operation:"COST_SCHEDULE" as const,idempotencyKey:KEY};expect(readPendingIntent({getItem:()=>JSON.stringify(intent),removeItem:vi.fn()})).toEqual({intent,malformed:false});const removeItem=vi.fn();clearPendingIntent({removeItem});expect(removeItem).toHaveBeenCalledWith(PENDING_INTENT_KEY);console.log("PASS personal-risk pending intent: exact schema, canonical UUID, safe malformed removal and no financial persistence are enforced.");});
});
