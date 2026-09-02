"use strict";

const { createClient } = require("@supabase/supabase-js");

function createUserSupabaseClient(accessToken, env = process.env, clientFactory = createClient) {
  if (typeof accessToken !== "string" || !accessToken) {
    throw new TypeError("A verified access token is required.");
  }

  return clientFactory(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}

module.exports = { createUserSupabaseClient };
