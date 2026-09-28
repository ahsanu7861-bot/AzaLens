"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const up = fs.readFileSync(path.join(root, "supabase/migrations/20260928120000_010_direction_guarded_protective_stops.sql"), "utf8");
const down = fs.readFileSync(path.join(root, "db/down-migrations/20260928120000_010_direction_guarded_protective_stops.sql"), "utf8");
const parity = fs.readFileSync(path.join(__dirname, "fixtures/riskDecisionParity.sql"));

function wrapperBody(name) {
  const declaration = new RegExp(`create\\s+function\\s+public\\.${name}\\s*\\(`, "i").exec(up);
  assert.ok(declaration, `${name} declaration must exist`);
  const bodyStart = up.indexOf("as $$", declaration.index);
  const bodyEnd = up.indexOf("end $$;", bodyStart);
  assert.ok(bodyStart >= 0 && bodyEnd > bodyStart, `${name} body must be extractable`);
  return up.slice(bodyStart + "as $$".length, bodyEnd + "end".length);
}

const forbiddenDirectMutations = [
  ["INSERT", /\binsert\s+into\s+public\./i],
  ["UPDATE", /\bupdate\s+public\./i],
  ["DELETE", /\bdelete\s+from\s+public\./i],
];

assert.equal(crypto.createHash("sha256").update(parity).digest("hex"), "cdfd5a5f24a0fd07b2310b6618b814557ab3459fba2e89d1224df140f442dd8e");
for (const name of ["tighten_outcome_protective_stop", "loosen_outcome_protective_stop"]) {
  assert.match(up, new RegExp(`create function public\\.${name}\\([\\s\\S]*?security definer set search_path=''`));
  assert.match(up, new RegExp(`revoke all on function public\\.${name}\\(uuid,uuid,numeric,text\\) from public,anon,authenticated,service_role;`));
  assert.match(down, new RegExp(`drop function public\\.${name}\\(uuid,uuid,numeric,text\\);`));
}
assert.equal((up.match(/public\.change_outcome_protective_stop\(p_position_id,p_idempotency_key,p_new_stop,p_evidence_class\)/g) || []).length, 2);
assert.equal((up.match(/pg_catalog\.pg_advisory_xact_lock/g) || []).length, 2);
assert.equal((up.match(/for update;/g) || []).length, 2);
assert.match(up, /p_new_stop<=v_state\.protective_stop_price/);
assert.match(up, /p_new_stop>=v_state\.protective_stop_price/);
for (const name of ["tighten_outcome_protective_stop", "loosen_outcome_protective_stop"]) {
  const body = wrapperBody(name);
  for (const [operation, pattern] of forbiddenDirectMutations) {
    assert.doesNotMatch(body, pattern, `${name} must delegate rather than directly ${operation} public rows`);
  }
}
assert.match(up, /grant execute on function public\.tighten_outcome_protective_stop\(uuid,uuid,numeric,text\) to authenticated;/);
assert.doesNotMatch(up, /grant execute on function public\.loosen_outcome_protective_stop/);
assert.doesNotMatch(up, /grant execute on function public\.change_outcome_protective_stop/);
assert.match(down, /grant execute on function public\.change_outcome_protective_stop\(uuid,uuid,numeric,text\) to authenticated;/);

console.log("Direction-guarded stop wrappers, API grants, exact reversal, delegation-only mutation and pinned decision fixture passed.");
