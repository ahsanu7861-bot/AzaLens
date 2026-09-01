"use strict";

const path = require("node:path");
const {
  spawnSync,
} = require("node:child_process");

const deterministicSuites = [
  "testBootInvariantEnforcement.js",
  "testClosedDemoGate.js",
  "testAnalysisTrustService.js",
  "testConfluenceActionability.js",
  "testCorsAllowlist.js",
  "testCrudStorageSafety.js",
  "testEnvironmentStrategy.js",
  "testEnvironmentValidation.js",
  "testAgreementTrendDegradation.js",
  "testEvidenceAgreementContract.js",
  "testExplanationContract.js",
  "testFeatureTruthfulness.js",
  "testFinnhubProviderResilience.js",
  "testFinnhubQuoteRejectionSafety.js",
  "testFundamentalsCoverage.js",
  "testGuidanceContract.js",
  "testHistorySingleFlight.js",
  "testLandingDemoContract.js",
  "testLoadResilience.js",
  "testMethodologyDisclosureContract.js",
  "testMultiSymbolConsistency.js",
  "testObservability.js",
  "testOwnerOnlyRouteContainment.js",
  "testPartialIndicatorFailure.js",
  "testPrivatePersonalEntitlement.js",
  "testPhase45Stability.js",
  "testRemovedRoutesContract.js",
  "testPortfolioRouterFactory.js",
  "testProviderAdapter.js",
  "testProviderCacheNamespaces.js",
  "testProviderNumericSafety.js",
  "testProviderSelectionObservability.js",
  "testProviderTransitionMatrix.js",
  "testTwelveDataProfileProvider.js",
  "testTwelveDataQuoteContract.js",
  "testTwelveDataQuoteRejectionSafety.js",
  "testTwelveDataSearchContract.js",
  "testTwelveDataCreditGovernor.js",
  "testTwelveDataTrialHarness.js",
  "testRateLimitPaths.js",
  "testRateLimitBuckets.js",
  "testRateLimitHttp.js",
  "testReleaseHealthCheck.js",
  "testRiskBoundary.js",
  "testRiskEvidenceCompatContract.js",
  "testRiskInvariance.js",
  "testReleaseScope.js",
  "testScannerService.js",
  "testShariahAAOIFI.js",
  "testShariahCostProtection.js",
  "testShariahSyntheticFixtures.js",
  "testSupportResistanceReliability.js",
  "testTrendReliability.js",
  "testTrustProxy.js",
];

for (const suite of deterministicSuites) {
  console.log(`\n[CI] ${suite}`);

  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, suite)],
    {
      cwd: path.resolve(__dirname, ".."),
      env: {
        ...process.env,
        NODE_ENV: "test",
      },
      stdio: "inherit",
    }
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(
  `\nAll ${deterministicSuites.length} deterministic backend CI suites passed without live-provider credentials.`
);
