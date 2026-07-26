import { readdir, readFile, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const distUrl = new URL("../dist/", import.meta.url);
const assetsUrl = new URL("./assets/", distUrl);
const assetNames = await readdir(assetsUrl);

async function measureAsset(name) {
  const contents = await readFile(new URL(name, assetsUrl));

  return {
    name,
    rawBytes: contents.byteLength,
    gzipBytes: gzipSync(contents, { level: 9 }).byteLength,
  };
}

const assets = await Promise.all(assetNames.map(measureAsset));
const javaScriptAssets = assets.filter(({ name }) => name.endsWith(".js"));
const cssAssets = assets.filter(({ name }) => name.endsWith(".css"));
const entryAsset = javaScriptAssets.find(({ name }) =>
  /^index-[^.]+\.js$/.test(name),
);
const analysisAsset = javaScriptAssets.find(({ name }) =>
  /^AnalysisPage-[^.]+\.js$/.test(name),
);
const indexHtml = await stat(new URL("./index.html", distUrl));

const KIB = 1024;
const failures = [];

function enforce(label, actual, maximum) {
  if (actual > maximum) {
    failures.push(
      `${label}: ${(actual / KIB).toFixed(2)} KiB exceeds ${(maximum / KIB).toFixed(2)} KiB`,
    );
  }
}

if (!entryAsset) {
  failures.push("Application entry chunk was not found.");
} else {
  enforce("entry raw", entryAsset.rawBytes, 300 * KIB);
  enforce("entry gzip", entryAsset.gzipBytes, 100 * KIB);
}

if (!analysisAsset) {
  failures.push("Analysis route chunk was not found.");
} else {
  enforce("analysis route raw", analysisAsset.rawBytes, 90 * KIB);
  enforce("analysis route gzip", analysisAsset.gzipBytes, 30 * KIB);
}

for (const asset of javaScriptAssets) {
  enforce(`${asset.name} raw`, asset.rawBytes, 320 * KIB);
  enforce(`${asset.name} gzip`, asset.gzipBytes, 100 * KIB);
}

for (const asset of cssAssets) {
  enforce(`${asset.name} raw`, asset.rawBytes, 80 * KIB);
  enforce(`${asset.name} gzip`, asset.gzipBytes, 15 * KIB);
}

enforce("index.html raw", indexHtml.size, 4 * KIB);

if (failures.length > 0) {
  console.error("Frontend performance budget failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("Frontend performance budget passed.");
  console.log(
    `- entry: ${(entryAsset.rawBytes / KIB).toFixed(2)} KiB raw / ${(entryAsset.gzipBytes / KIB).toFixed(2)} KiB gzip`,
  );
  console.log(
    `- analysis route: ${(analysisAsset.rawBytes / KIB).toFixed(2)} KiB raw / ${(analysisAsset.gzipBytes / KIB).toFixed(2)} KiB gzip`,
  );
  console.log(`- emitted JavaScript chunks: ${javaScriptAssets.length}`);
}
