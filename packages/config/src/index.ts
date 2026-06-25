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
  system_prompt_ref?: string;
  prompt_version?: string;
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

export type IntentDetectionConfig = {
  mode: "keyword" | "llm";
  default_intent?: string;
  keywords?: Record<string, string[]>;
};

export type RoutingConfig = {
  version?: string;
  default_agent_id: string;
  routes: Array<{
    intent: string;
    agent_id: string;
    fallback_agent_id?: string;
    description?: string;
  }>;
  intent_detection?: IntentDetectionConfig;
};

export type ResolvedRoute = {
  intent: string;
  agent_id: string;
  fallback_agent_id?: string;
  responsible?: string;
};

export const AGENT_RUN_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
  "retrying",
] as const;

export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

export type AgentRunDetails = {
  agent_slug: string;
  intent: string;
  prompt_ref?: string;
  prompt_version?: string;
  routing_version?: string;
  attempt?: number;
  error?: string;
  fallback_from?: string;
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

export type SlackChannelConfig = {
  id: string;
  name: string;
  env_key: string;
  purpose: string;
  notify_on: string[];
};

export type SlackChannelsConfig = {
  channels: SlackChannelConfig[];
};

export type SlackEventsConfig = {
  events_api_path: string;
  subscriptions: Array<{
    type: string;
    action: string;
    default_intent?: string;
    channel_ref?: string;
    description?: string;
  }>;
  slash_commands: Array<{
    command: string;
    description: string;
    usage?: string;
    default_intent?: string;
  }>;
  interactive_actions: Array<{
    action_id: string;
    description: string;
  }>;
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

export function getDefaultIntent(): string {
  const routing = loadRoutingConfig();
  return routing.intent_detection?.default_intent ?? "orchestrate";
}

/**
 * Keyword pass over freeform text. Returns null when no keyword matches
 * so callers can fall through to source-specific defaults.
 */
export function detectIntentFromText(text: string): string | null {
  const routing = loadRoutingConfig();
  const detection = routing.intent_detection;

  if (!detection || detection.mode !== "keyword" || !detection.keywords) {
    return null;
  }

  const normalized = text.toLowerCase();
  let bestIntent: string | null = null;
  let bestKeywordLength = 0;

  for (const [intent, keywords] of Object.entries(detection.keywords)) {
    for (const keyword of keywords) {
      const kw = keyword.toLowerCase();
      if (normalized.includes(kw) && kw.length > bestKeywordLength) {
        bestIntent = intent;
        bestKeywordLength = kw.length;
      }
    }
  }

  return bestIntent;
}

/**
 * Resolve intent with precedence: explicit > keyword detection > source default > global default.
 */
export function resolveIntent(
  text: string,
  options?: { explicit?: string; sourceDefault?: string },
): string {
  if (options?.explicit) {
    return options.explicit;
  }

  const detected = detectIntentFromText(text);
  if (detected) {
    return detected;
  }

  if (options?.sourceDefault) {
    return options.sourceDefault;
  }

  return getDefaultIntent();
}

export function resolveAgentForIntent(intent: string): string {
  const routing = loadRoutingConfig();
  const route = routing.routes.find((r) => r.intent === intent);
  return route?.agent_id ?? routing.default_agent_id;
}

export function resolveFallbackAgentForIntent(intent: string): string | undefined {
  const routing = loadRoutingConfig();
  const route = routing.routes.find((r) => r.intent === intent);
  return route?.fallback_agent_id;
}

export function resolveRouteForIntent(intent: string): ResolvedRoute {
  const agent_id = resolveAgentForIntent(intent);
  return {
    intent,
    agent_id,
    fallback_agent_id: resolveFallbackAgentForIntent(intent),
    responsible: resolveAgentSupabaseId(agent_id),
  };
}

export function resolveAgentSupabaseId(agentSlug: string): string | undefined {
  return loadAgents().find((a) => a.id === agentSlug)?.supabase_id;
}

export function resolveAgentBySupabaseId(supabaseId: string): AgentConfig | undefined {
  return loadAgents().find((a) => a.supabase_id === supabaseId);
}

/**
 * Build the JSON blob stored in agent_runs.details for audit and prompt versioning.
 */
export function buildAgentRunDetails(
  agentSlug: string,
  intent: string,
  extra?: Partial<AgentRunDetails>,
): string {
  const agent = loadAgents().find((a) => a.id === agentSlug);
  const routing = loadRoutingConfig();

  const details: AgentRunDetails = {
    agent_slug: agentSlug,
    intent,
    prompt_ref: agent?.system_prompt_ref,
    prompt_version: agent?.prompt_version,
    routing_version: routing.version,
    ...extra,
  };

  return JSON.stringify(details);
}

export function loadSlackChannels(): SlackChannelsConfig {
  return readJson(join(REPO_ROOT, "config/slack/channels.json"));
}

export function loadSlackEvents(): SlackEventsConfig {
  return readJson(join(REPO_ROOT, "config/slack/events.json"));
}

export function getSlackChannelEnvKey(channelId: string): string | undefined {
  return loadSlackChannels().channels.find((c) => c.id === channelId)?.env_key;
}
