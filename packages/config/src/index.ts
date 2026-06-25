import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(process.cwd(), "../..");

export type AgentConfig = {
  id: string;
  supabase_id: string;
  name: string;
  provider: "anthropic" | "openai" | "google";
  model: string;
  role: string;
  status: string;
  description?: string;
  capabilities?: string[];
  tools?: string[];
};

export type IntegrationConfig = {
  id: string;
  name: string;
  type: string;
  status: string;
  env_keys?: string[];
};

export type SystemConfig = {
  version: string;
  name: string;
  default_agent_id: string;
};

export type RoutingConfig = {
  default_agent_id: string;
  routes: Array<{
    intent: string;
    agent_id: string;
    fallback_agent_id?: string;
    description?: string;
  }>;
};

export type TaskRow = {
  id: string;
  headline: string | null;
  description: string | null;
  responsible: string | null;
  status: string[];
  created_at: string;
};

export type ClientRow = {
  id: string;
  name: string | null;
  email: string;
  country: string | null;
  created_at: string;
};

export type AgentRunRow = {
  id: string;
  agent_id: string;
  task_id: string;
  status: string | null;
  details: string | null;
  created_at: string;
};

export type CommsLogRow = {
  id: string;
  agent_id: string;
  task_id: string;
  client: string | null;
  message: string | null;
  status: string | null;
  created_at: string;
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function readJsonDir<T>(dir: string): T[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<T>(join(dir, f)));
}

export function loadSystemConfig(): SystemConfig {
  return readJson(join(REPO_ROOT, "config/system.json"));
}

export function loadRoutingConfig(): RoutingConfig {
  return readJson(join(REPO_ROOT, "config/routing.json"));
}

export function loadAgents(): AgentConfig[] {
  return readJsonDir(join(REPO_ROOT, "config/agents"));
}

export function loadIntegrations(): IntegrationConfig[] {
  return readJsonDir(join(REPO_ROOT, "config/integrations"));
}

export function loadTaskStatusLabels(): string[] {
  return readJson(join(REPO_ROOT, "config/task-status-labels.json"));
}

export function resolveAgentForIntent(intent: string): string {
  const routing = loadRoutingConfig();
  const route = routing.routes.find((r) => r.intent === intent);
  return route?.agent_id ?? routing.default_agent_id;
}

export function resolveAgentSupabaseId(agentSlug: string): string | undefined {
  return loadAgents().find((a) => a.id === agentSlug)?.supabase_id;
}

export function resolveAgentBySupabaseId(supabaseId: string): AgentConfig | undefined {
  return loadAgents().find((a) => a.supabase_id === supabaseId);
}
