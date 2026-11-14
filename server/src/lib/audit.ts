import type { PoolClient } from 'pg';

export interface AuditEntry {
  actorId: number | null;
  teamId: number | null;
  action: string; // 'team.created' | 'member.joined' | 'invite.rotated' | ...
  details?: Record<string, unknown>;
}

/** Call with the SAME client as the change, so there is never a change without a record (or the reverse). */
export async function writeAudit(client: PoolClient, entry: AuditEntry): Promise<void> {
  await client.query('INSERT INTO audit_log (actor_id, team_id, action, details) VALUES ($1, $2, $3, $4)', [
    entry.actorId,
    entry.teamId,
    entry.action,
    JSON.stringify(entry.details ?? {}),
  ]);
}
