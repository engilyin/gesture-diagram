/* global console, process */

import checker from "license-checker";

const allowedLicenses = [
  "MIT",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
  "MPL-2.0",
  "PSF-2.0",
  "0BSD",
  "Unlicense",
  "Zlib",
];

function isAllowed(licenseExpression) {
  const normalized = licenseExpression.replace(/[()*]/g, "");
  const tokens = normalized
    .split(/AND|OR|\/|,/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  return tokens.some((token) =>
    allowedLicenses.some((allowed) => token.toLowerCase() === allowed.toLowerCase()),
  );
}

checker.init(
  {
    start: process.cwd(),
    production: true,
    excludePrivatePackages: true,
  },
  (error, packages) => {
    if (error) {
      console.error(`License audit failed: ${error.message}`);
      process.exit(1);
    }

    const violations = Object.entries(packages).filter(([, metadata]) => {
      const licenses = metadata.licenses;
      if (typeof licenses !== "string") {
        return true;
      }
      return !isAllowed(licenses);
    });

    if (violations.length === 0) {
      console.log("License audit passed.");
      process.exit(0);
    }

    console.error("License audit failed. Non-permissive dependencies detected:");
    violations.forEach(([name, metadata]) => {
      console.error(`- ${name}: ${String(metadata.licenses)}`);
    });
    process.exit(1);
  },
);
