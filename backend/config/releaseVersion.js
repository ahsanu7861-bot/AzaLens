"use strict";

const DEFAULT_RELEASE_VERSION = "0.1.0";

function getReleaseVersion(env = process.env) {
  return String(
    env.SERVICE_VERSION ||
      env.API_VERSION ||
      DEFAULT_RELEASE_VERSION
  ).trim();
}

module.exports = {
  DEFAULT_RELEASE_VERSION,
  getReleaseVersion,
};
