"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const disclosure = require(path.resolve(
  __dirname,
  "../../frontend/src/data/methodologyDisclosure.json"
));
const {
  constants: trustConstants,
} = require("../services/analysisTrustService");
const {
  DEFAULT_SHARIAH_CACHE_MINUTES,
} = require("../config/shariahRuntime");

assert.equal(
  disclosure.internalShariahContractVersion,
  trustConstants.AAOIFI_METHODOLOGY_VERSION
);
assert.equal(disclosure.externalMethodologyFamily, "AAOIFI");
assert.equal(
  disclosure.providerStatedStandardReference,
  "AAOIFI Shari’ah Standard No. 21"
);
assert.equal(
  disclosure.providerAAOIFIAccredited,
  false,
  "The disclosure must not imply AAOIFI accreditation or endorsement."
);
assert.equal(
  disclosure.externalStandardEdition,
  null,
  "The UI must not invent an AAOIFI standard edition that the provider contract does not expose."
);
assert.equal(
  disclosure.cacheHours,
  DEFAULT_SHARIAH_CACHE_MINUTES / 60
);
assert.equal(
  disclosure.staleAfterDays,
  trustConstants.SHARIAH_STALE_AFTER_HOURS / 24
);
assert.equal(
  disclosure.defaultMarketDelayMinutes,
  trustConstants.DEFAULT_MARKET_DELAY_MINUTES
);
assert.equal(
  disclosure.researchBoundaries.debtToAssetsPercent,
  trustConstants.SHARIAH_DEBT_TO_ASSETS_BOUNDARY * 100
);
assert.equal(
  disclosure.researchBoundaries.impermissibleIncomePercent,
  trustConstants.SHARIAH_IMPERMISSIBLE_INCOME_BOUNDARY * 100
);
assert.equal(disclosure.guidanceHorizon, "2–10 trading sessions");

console.log("Methodology disclosure contract matches production constants.");
