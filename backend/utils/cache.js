// utils/cache.js

const cache = new Map();

/*
  ==========================================================================
  Cache contract version
  ==========================================================================

  Bumped whenever the MEANING of a normalized cached record changes, even if
  its shape does not. Two providers can return structurally identical records
  that mean different things - Finnhub's historical `t` is a Unix second count
  while Twelve Data's is a date string, and both normalize into the same bar
  array - so a compatible shape is exactly the condition under which silent
  cross-provider reuse goes unnoticed.

  Shipping the version inside the key means a record written under an older
  contract can never be read back under a newer one. It costs one string
  concatenation and removes the whole class of "the shapes matched, so it
  looked fine" incident.
*/
const CACHE_CONTRACT_VERSION = "v1";

/*
  Every cache key that a request could reach under more than one provider must
  be namespaced by BOTH the contract version and the provider that produced the
  record. Process-local storage does not make cross-provider reuse safe: the
  provider is selected per request from the environment, so one living process
  can serve requests under two different selections.

  `provider` is the capability provider id (`finnhub`, `twelve_data`, ...), not
  a display label, so the key matches the configuration that produced it.
*/
function buildCacheKey({
  provider,
  capability,
  parts = [],
  contractVersion = CACHE_CONTRACT_VERSION
}) {
  const normalizedProvider = String(provider || "")
    .trim()
    .toLowerCase();

  const normalizedCapability = String(capability || "")
    .trim()
    .toLowerCase();

  if (!normalizedProvider) {
    throw new Error(
      "A cache key requires a provider identity."
    );
  }

  if (!normalizedCapability) {
    throw new Error(
      "A cache key requires a capability name."
    );
  }

  const normalizedParts = (
    Array.isArray(parts) ? parts : [parts]
  )
    .map((part) => String(part == null ? "" : part).trim())
    .filter((part) => part.length > 0);

  return [
    String(contractVersion),
    normalizedProvider,
    normalizedCapability,
    ...normalizedParts
  ].join(":");
}

/**
 * Save data to cache
 * @param {string} key
 * @param {any} data
 * @param {number} ttlMinutes
 */
function setCache(key, data, ttlMinutes = 30) {
  const expiresAt = Date.now() + ttlMinutes * 60 * 1000;

  cache.set(key, {
    data,
    expiresAt
  });
}

/**
 * Get data from cache
 * @param {string} key
 * @returns {any|null}
 */
function getCache(key) {
  const item = cache.get(key);

  if (!item) {
    return null;
  }

  // Expired?
  if (Date.now() > item.expiresAt) {
    cache.delete(key);
    return null;
  }

  return item.data;
}

/**
 * Delete one cache item
 */
function clearCache(key) {
  cache.delete(key);
}

/**
 * Clear everything
 */
function clearAllCache() {
  cache.clear();
}

/*
  Test-only introspection. Returns the key strings currently held, so a
  deterministic suite can prove that a key carries its provider and contract
  version rather than trusting that the builder was called.
*/
function listCacheKeys() {
  return [...cache.keys()];
}

module.exports = {
  CACHE_CONTRACT_VERSION,
  buildCacheKey,
  setCache,
  getCache,
  clearCache,
  clearAllCache,
  listCacheKeys
};
