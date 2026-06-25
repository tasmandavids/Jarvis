#!/usr/bin/env node
/**
 * Validates config/*.json files against schemas/*.schema.json
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

function validateRequired(obj, schema, path = "") {
  const errors = [];
  for (const key of schema.required ?? []) {
    if (!(key in obj)) {
      errors.push(`${path}: missing required field "${key}"`);
    }
  }
  return errors;
}

function validateAgent(file, data) {
  const schema = loadJson(join(root, "schemas/agent.schema.json"));
  return validateRequired(data, schema, file);
}

function validateIntegration(file, data) {
  const schema = loadJson(join(root, "schemas/integration.schema.json"));
  return validateRequired(data, schema, file);
}

function validateWorkflow(file, data) {
  const schema = loadJson(join(root, "schemas/workflow.schema.json"));
  return validateRequired(data, schema, file);
}

const validators = {
  "config/agents": validateAgent,
  "config/integrations": validateIntegration,
  "config/workflows": validateWorkflow,
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
