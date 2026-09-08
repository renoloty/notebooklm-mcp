/**
 * Single source of truth for the server version.
 *
 * It was previously hardcoded in three places in `index.ts` (MCP `serverInfo`,
 * the startup log line and the ASCII banner), which is why they still reported
 * 2.0.0 after `package.json` moved on. Read from `package.json` at runtime so
 * a version bump cannot leave the handshake stale — the version an MCP client
 * sees is the one users quote in bug reports.
 */

import { createRequire } from "module";

interface PackageManifest {
  version?: string;
}

function readVersion(): string {
  try {
    // `createRequire` resolves relative to this module in both `src/` (tsx) and
    // `dist/` (compiled), where package.json sits one directory up either way.
    const require = createRequire(import.meta.url);
    const pkg = require("../package.json") as PackageManifest;
    return pkg.version ?? "0.0.0";
  } catch {
    // A bundled or otherwise repackaged deployment may not ship package.json.
    // Report an honest placeholder rather than a version that may be wrong.
    return "0.0.0";
  }
}

export const VERSION = readVersion();
