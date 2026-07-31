"use strict";

const path = require("node:path");
const {
  spawnSync,
} = require("node:child_process");

const deterministicSuites = [
  "testClosedDemoGate.js",
  "testAnalysisTrustService.js",
  "testConfluenceActionability.js",
  "testCorsAllowlist.js",
  "testEnvironmentStrategy.js",
  "testFeatureTruthfulness.js",
  "testFinnhubProviderResilience.js",
  "testFinnhubQuoteRejectionSafety.js",
  "testFundamentalsCoverage.js",
  "testLoadResilience.js",
  "testMultiSymbolConsistency.js",
  "testObservability.js",
  "testPhase45Stability.js",
  "testPortfolioRouterFactory.js",
  "testProviderAdapter.js",
  "testTwelveDataProfileProvider.js",
  "testRateLimitPaths.js",
  "testRateLimitBuckets.js",
  "testRateLimitHttp.js",
  "testReleaseHealthCheck.js",
  "testReleaseScope.js",
  "testScannerService.js",
  "testShariahAAOIFI.js",
  "testShariahCostProtection.js",
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
