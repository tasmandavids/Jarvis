/**
 * Obsidian writer — drains the obsidian_log queue to your vault.
 * 
 * Transport: Obsidian Local REST API community plugin
 * Plugin: https://github.com/coddingtonbear/obsidian-local-rest-api
 * 
 * Run as a cron job: node -e "require('./services/obsidian').drain()"
 * Or wire into n8n on a schedule.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const OBSIDIAN_BASE = process.env.OBSIDIAN_BASE_URL || 'http://127.0.0.1:27123';
const OBSIDIAN_KEY  = process.env.OBSIDIAN_API_KEY!;

async function appendToVault(vaultPath: string, content: string): Promise<void> {
  const res = await fetch(`${OBSIDIAN_BASE}/vault/${encodeURIComponent(vaultPath)}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OBSIDIAN_KEY}`,
      'Content-Type': 'text/markdown',
    },
    body: content,
  });
  if (!res.ok && res.status !== 404) throw new Error(`Obsidian ${res.status}: ${await res.text()}`);
  // 404 = file doesn't exist yet → create it
  if (res.status === 404) {
    await fetch(`${OBSIDIAN_BASE}/vault/${encodeURIComponent(vaultPath)}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${OBSIDIAN_KEY}`, 'Content-Type': 'text/markdown' },
      body: content,
    });
  }
}

export async function drain(limit = 50): Promise<void> {
  const { data: rows } = await supabase
    .from('obsidian_log')
    .select('*')
    .eq('status', 'queued')
    .order('created_at')
    .limit(limit);

  if (!rows?.length) return;

  for (const row of rows) {
    try {
      await appendToVault(row.vault_path, row.content);
      await supabase.from('obsidian_log')
        .update({ status: 'synced', synced_at: new Date().toISOString() })
        .eq('id', row.id);
    } catch (err) {
      await supabase.from('obsidian_log')
        .update({ status: row.attempts >= 3 ? 'failed' : 'queued', attempts: row.attempts + 1 })
        .eq('id', row.id);
      console.error(`Obsidian sync failed for ${row.vault_path}:`, err);
    }
  }
}

// CLI
if (require.main === module) drain().then(() => process.exit(0));
