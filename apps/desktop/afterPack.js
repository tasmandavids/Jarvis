'use strict';

const fs = require('node:fs');
const path = require('node:path');

// electron-builder hard-excludes any directory named node_modules from
// extraResources (it auto-injects `!**/node_modules/**`), so the Next.js
// standalone server's traced dependencies never make it into the bundle.
// Copy them in by hand once the .app has been packed, before the DMG is built.
exports.default = async function afterPack(context) {
  const { appOutDir, packager, electronPlatformName } = context;
  if (electronPlatformName !== 'darwin') return;

  const appName = packager.appInfo.productFilename; // "CYPHER"
  const src = path.join(__dirname, '..', 'web', '.next', 'standalone', 'node_modules');
  const dest = path.join(
    appOutDir,
    `${appName}.app`,
    'Contents',
    'Resources',
    'app',
    'node_modules'
  );

  if (!fs.existsSync(src)) {
    throw new Error(`[afterPack] standalone node_modules not found at ${src} — run the build first`);
  }

  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log(`[afterPack] copied standalone node_modules -> ${dest}`);
};
