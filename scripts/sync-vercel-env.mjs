#!/usr/bin/env node
/**
 * Push non-empty vars from apps/dashboard/.env.local to linked Vercel project.
 * Skips empty values and comments. Marks known secrets as sensitive.
 *
 * Usage: npm run env:push
 * Requires: apps/dashboard/.vercel/project.json (run npm run vercel:link first)
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, "apps/dashboard/.env.local");
const dashboardDir = join(root, "apps/dashboard");

const SENSITIVE = new Set([
  "SUPABASE_SERVICE_ROLE_KEY",
  "SLACK_BOT_TOKEN",
  "SLACK_SIGNING_SECRET",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "NOTION_API_KEY",
  "N8N_API_KEY",
  "GITHUB_TOKEN",
  "VERCEL_TOKEN",
]);

const SKIP = new Set(["VERCEL_OIDC_TOKEN", "VERCEL_TOKEN"]);
const ENVIRONMENTS = ["production", "preview", "development"];

function parseEnvFile(path) {
  const vars = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (value) vars[key] = value;
  }
  return vars;
}

function shouldSync(key) {
  return !SKIP.has(key);
}

function vercelEnvRm(name) {
  for (const env of ENVIRONMENTS) {
    spawnSync("npx", ["vercel@latest", "env", "rm", name, env, "--yes"], {
      cwd: dashboardDir,
      stdio: "pipe",
    });
  }
}

function vercelEnvAdd(name, value, sensitive) {
  const targets = sensitive
    ? [
        { env: "production", sensitive: true },
        { env: "preview", sensitive: true },
        { env: "development", sensitive: false },
      ]
    : ENVIRONMENTS.map((env) => ({ env, sensitive: false }));

  for (const { env, sensitive: isSensitive } of targets) {
    const args = [
      "vercel@latest",
      "env",
      "add",
      name,
      env,
      "--value",
      value,
      "--yes",
      "--force",
    ];
    if (isSensitive) args.push("--sensitive");

    const result = spawnSync("npx", args, {
      cwd: dashboardDir,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf8",
    });

    if (result.status !== 0) {
      const err = (result.stderr || result.stdout || "").trim();
      throw new Error(`Failed to add ${name} (${env}): ${err}`);
    }
  }
  return true;
}

if (!existsSync(join(dashboardDir, ".vercel/project.json"))) {
  console.error("✗ Vercel project not linked. Run: npm run vercel:link");
  process.exit(1);
}

if (!existsSync(envPath)) {
  console.error("✗ Missing apps/dashboard/.env.local");
  process.exit(1);
}

const vars = parseEnvFile(envPath);
const keys = Object.keys(vars).filter(shouldSync);

if (keys.length === 0) {
  console.error("✗ No non-empty variables in .env.local");
  process.exit(1);
}

console.log(`Pushing ${keys.length} variables to Vercel...\n`);

for (const key of keys) {
  const sensitive = SENSITIVE.has(key);
  vercelEnvAdd(key, vars[key], sensitive);
  console.log(`✓ ${key}${sensitive ? " (sensitive)" : ""}`);
}

console.log("\nDone. Verify with: npm run env:ls");
