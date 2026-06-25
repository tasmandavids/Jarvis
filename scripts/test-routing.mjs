#!/usr/bin/env node
/**
 * Smoke test for keyword intent detection (mirrors @jarvis/config logic).
 * Run: npm run test:routing
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const routing = JSON.parse(readFileSync(join(root, "config/routing.json"), "utf8"));

function detectIntentFromText(text) {
  const keywords = routing.intent_detection?.keywords;
  if (!keywords) return null;

  const normalized = text.toLowerCase();
  let bestIntent = null;
  let bestLen = 0;

  for (const [intent, list] of Object.entries(keywords)) {
    for (const keyword of list) {
      const kw = keyword.toLowerCase();
      if (normalized.includes(kw) && kw.length > bestLen) {
        bestIntent = intent;
        bestLen = kw.length;
      }
    }
  }
  return bestIntent;
}

const cases = [
  ["research competitor pricing", "research"],
  ["please deploy the staging app", "execute"],
  ["plan the Q3 roadmap", "orchestrate"],
  ["hello jarvis", null],
  ["summarize this doc", "research"],
];

let failed = false;
for (const [text, expected] of cases) {
  const got = detectIntentFromText(text);
  if (got !== expected) {
    console.error(`✗ "${text}" → expected ${expected}, got ${got}`);
    failed = true;
  } else {
    console.log(`✓ "${text}" → ${got ?? "(no match)"}`);
  }
}

if (failed) process.exit(1);
console.log("\nRouting smoke tests passed.");
