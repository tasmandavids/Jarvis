#!/usr/bin/env node
/**
 * Validates packages/config/data/*.json against the required fields each
 * loader in packages/config/src/index.ts expects.
 * Run: npm run validate:config
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function collectJsonFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectJsonFiles(full));
    } else if (entry.endsWith(".json")) {
      files.push(full);
    }
  }
  return files;
}

function validateRequired(file, data, requiredFields) {
  const errors = [];
  for (const key of requiredFields) {
    if (!(key in data)) {
      errors.push(`${file}: missing required field "${key}"`);
    }
  }
  return errors;
}

// Required fields mirror the TS types in packages/config/src/index.ts —
// AgentConfig, IntegrationConfig — plus the shape actually used by the
// workflow registry files (there's no WorkflowConfig type, just id/name/status).
const validators = {
  "packages/config/data/agents": (file, data) =>
    validateRequired(file, data, ["id", "supabase_id", "name", "provider", "model", "role", "status"]),
  "packages/config/data/integrations": (file, data) =>
    validateRequired(file, data, ["id", "name", "type", "status"]),
  "packages/config/data/workflows": (file, data) =>
    validateRequired(file, data, ["id", "name", "status"]),
};

let hasErrors = false;

for (const [prefix, validate] of Object.entries(validators)) {
  const dir = join(root, prefix);
  for (const file of collectJsonFiles(dir)) {
    const rel = relative(root, file);
    try {
      const data = loadJson(file);
      const errors = validate(rel, data);
      if (errors.length) {
        hasErrors = true;
        console.error(`✗ ${rel}`);
        errors.forEach((e) => console.error(`  ${e}`));
      } else {
        console.log(`✓ ${rel}`);
      }
    } catch (err) {
      hasErrors = true;
      console.error(`✗ ${rel}: ${err.message}`);
    }
  }
}

if (hasErrors) {
  process.exit(1);
}

console.log("\nAll config files valid.");
