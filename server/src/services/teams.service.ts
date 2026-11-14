import type { PoolClient } from 'pg';
import { pool } from '../db/pool.js';
import { env } from '../config/env.js';
import { writeAudit } from '../lib/audit.js';
import { HttpError, conflict, forbidden, notFound } from '../lib/errors.js';
import { bus, publishTeamChanged } from '../lib/events.js';
import type { IdempotentResult } from '../lib/idempotency.js';
import { formatInviteCode, generateInviteCode, hashInviteCode, normalizeInviteCode } from '../lib/inviteCode.js';

export type TeamRow = {
  id: number;
  hackathon_id: number;
  name: string;
  leader_id: number;
  member_count: number;
  is_open: boolean;
  invite_expires_at: Date | null;
  created_at: Date;
  min_team_size: number;
  max_team_size: number;
};

const TEAM_SELECT = `
  SELECT t.id, t.hackathon_id, t.name, t.leader_id, t.member_count, t.is_open,
         t.invite_expires_at, t.created_at, h.min_team_size, h.max_team_size
    FROM teams t JOIN hackathons h ON h.id = t.hackathon_id`;

export interface TeamDto {
  id: number;
  hackathonId: number;
  name: string;
  leaderId: number;
  memberCount: number;
  minTeamSize: number;
  maxTeamSize: number;
  isOpen: boolean;
  isComplete: boolean; // has reached the minimum size
  inviteExpiresAt?: string | null; // only included for the leader
  createdAt: string;
}

export function toDto(t: TeamRow, viewerId?: number): TeamDto {
  return {
    id: t.id,
    hackathonId: t.hackathon_id,
    name: t.name,
    leaderId: t.leader_id,
    memberCount: t.member_count,
    minTeamSize: t.min_team_size,
    maxTeamSize: t.max_team_size,
    isOpen: t.is_open,
    isComplete: t.member_count >= t.min_team_size,
    ...(viewerId === t.leader_id ? { inviteExpiresAt: t.invite_expires_at?.toISOString() ?? null } : {}),
    createdAt: t.created_at.toISOString(),
  };
}

const inviteExpiryHours = () => env.INVITE_TTL_HOURS;

/** Postgres unique-violation on a given constraint (or any, when no name is passed). */
export const isUniqueViolation = (err: any, constraintPrefix?: string) =>
  err?.code === '23505' && (!constraintPrefix || String(err.constraint ?? '').startsWith(constraintPrefix));

export const alreadyInTeam = () => conflict('You are already in a team for this hackathon', 'ALREADY_IN_TEAM');

// ---------------------------------------------------------------------------
// Create team
// ---------------------------------------------------------------------------
export async function createTeam(
  client: PoolClient,
  userId: number,
  input: { hackathonId: number; name: string },
): Promise<IdempotentResult> {
  const h = await client.query<{ max_team_size: number }>('SELECT max_team_size FROM hackathons WHERE id = $1', [
    input.hackathonId,
  ]);
  if (!h.rows[0]) throw notFound('Hackathon not found');

  const existing = await client.query('SELECT 1 FROM team_members WHERE hackathon_id = $1 AND user_id = $2', [
    input.hackathonId,
    userId,
  ]);
  if (existing.rowCount) throw alreadyInTeam();

  const code = generateInviteCode();
  let teamId: number;
  try {
    const ins = await client.query<{ id: number }>(
      `INSERT INTO teams (hackathon_id, name, leader_id, member_count, is_open, invite_code_hash, invite_expires_at)
       VALUES ($1, $2, $3, 1, $4, $5, now() + ($6::float8 * interval '1 hour')) RETURNING id`,
      [input.hackathonId, input.name, userId, 1 < h.rows[0].max_team_size, hashInviteCode(code), inviteExpiryHours()],
    );
    teamId = ins.rows[0]!.id;
  } catch (err) {
    if (isUniqueViolation(err, 'teams_hackathon_id_name')) {
      throw conflict('A team with this name already exists', 'NAME_TAKEN');
    }
    throw err;
  }

  try {
    await client.query('INSERT INTO team_members (team_id, hackathon_id, user_id) VALUES ($1, $2, $3)', [
      teamId,
      input.hackathonId,
      userId,
    ]);
  } catch (err) {
    if (isUniqueViolation(err)) throw alreadyInTeam();
    throw err;
  }

  await writeAudit(client, {
    actorId: userId,
    teamId,
    action: 'team.created',
    details: { name: input.name, hackathonId: input.hackathonId },
  });

  const { rows } = await client.query<TeamRow>(`${TEAM_SELECT} WHERE t.id = $1`, [teamId]);
  const team = toDto(rows[0]!, userId);
  return {
    status: 201,
    body: { team, inviteCode: formatInviteCode(code) },
    storedBody: { team, inviteCode: null, note: 'Invite code is only shown once. Rotate it to get a new one.' },
    afterCommit: () => publishTeamChanged(teamId),
  };
}

// ---------------------------------------------------------------------------
// Join by invite code (THE race-critical function)
// ---------------------------------------------------------------------------
export async function joinByCode(client: PoolClient, userId: number, rawCode: string): Promise<IdempotentResult> {
  const { rows } = await client.query<TeamRow>(
    `${TEAM_SELECT}
      WHERE t.invite_code_hash = $1 AND t.invite_expires_at > now()
      FOR UPDATE OF t`,
    [hashInviteCode(normalizeInviteCode(rawCode))],
  );
  const team = rows[0];
  if (!team) throw new HttpError(404, 'Invalid or expired invite code', 'INVALID_CODE');

  const already = await client.query('SELECT 1 FROM team_members WHERE hackathon_id = $1 AND user_id = $2', [
    team.hackathon_id,
    userId,
  ]);
  if (already.rowCount) throw alreadyInTeam();
  if (team.member_count >= team.max_team_size) throw conflict('This team is full', 'TEAM_FULL');

  try {
    await client.query('INSERT INTO team_members (team_id, hackathon_id, user_id) VALUES ($1, $2, $3)', [
      team.id,
      team.hackathon_id,
      userId,
    ]);
  } catch (err) {
    if (isUniqueViolation(err)) throw alreadyInTeam();
    throw err;
  }

  const upd = await client.query<{ member_count: number; is_open: boolean }>(
    `UPDATE teams SET member_count = member_count + 1, is_open = (member_count + 1 < $2)
      WHERE id = $1 RETURNING member_count, is_open`,
    [team.id, team.max_team_size],
  );

  // Cancel any pending join requests by this user for any team in this hackathon
  await client.query(
    `UPDATE join_requests SET status = 'cancelled', decided_at = now()
      WHERE user_id = $1 AND status = 'pending'`,
    [userId],
  );

  await writeAudit(client, { actorId: userId, teamId: team.id, action: 'member.joined', details: { via: 'invite_code' } });

  const updated = { ...team, member_count: upd.rows[0]!.member_count, is_open: upd.rows[0]!.is_open };
  return { status: 200, body: { team: toDto(updated, userId) }, afterCommit: () => publishTeamChanged(team.id) };
}

// ---------------------------------------------------------------------------
// Rotate invite code (leader only)
// ---------------------------------------------------------------------------
export async function rotateInviteCode(client: PoolClient, userId: number, teamId: number): Promise<IdempotentResult> {
  const { rows } = await client.query<TeamRow>(`${TEAM_SELECT} WHERE t.id = $1 FOR UPDATE OF t`, [teamId]);
  const team = rows[0];
  if (!team) throw notFound('Team not found');
  if (team.leader_id !== userId) throw forbidden('Only the team leader can do this');

  const code = generateInviteCode();
  const upd = await client.query<{ invite_expires_at: Date }>(
    `UPDATE teams SET invite_code_hash = $2, invite_expires_at = now() + ($3::float8 * interval '1 hour')
      WHERE id = $1 RETURNING invite_expires_at`,
    [teamId, hashInviteCode(code), inviteExpiryHours()],
  );
  await writeAudit(client, { actorId: userId, teamId, action: 'invite.rotated' });

  return {
    status: 200,
    body: { inviteCode: formatInviteCode(code), inviteExpiresAt: upd.rows[0]!.invite_expires_at.toISOString() },
    storedBody: { inviteCode: null, note: 'Invite code is only shown once. Rotate again to get a new one.' },
  };
}

// ---------------------------------------------------------------------------
// Read a team (any logged-in participant)
// ---------------------------------------------------------------------------
export async function getTeam(teamId: number, viewerId: number) {
  const { rows } = await pool.query<TeamRow>(`${TEAM_SELECT} WHERE t.id = $1`, [teamId]);
  const team = rows[0];
  if (!team) throw notFound('Team not found');

  const members = await pool.query<{ id: number; name: string; skills: string[]; timezone: string; joined_at: Date }>(
    `SELECT u.id, u.name, u.skills, u.timezone, m.joined_at
       FROM team_members m JOIN users u ON u.id = m.user_id
      WHERE m.team_id = $1 ORDER BY m.joined_at, u.id`,
    [teamId],
  );

  return {
    team: toDto(team, viewerId),
    members: members.rows.map((m) => ({
      userId: m.id,
      name: m.name,
      skills: m.skills,
      timezone: m.timezone,
      isLeader: m.id === team.leader_id,
      joinedAt: m.joined_at.toISOString(),
    })),
  };
}

// ---------------------------------------------------------------------------
// Leave team (leadership handoff or team deletion if last member)
// ---------------------------------------------------------------------------
export async function leaveTeam(client: PoolClient, userId: number, teamId: number): Promise<IdempotentResult> {
  const { rows } = await client.query<TeamRow>(`${TEAM_SELECT} WHERE t.id = $1 FOR UPDATE OF t`, [teamId]);
  const team = rows[0];
  if (!team) throw notFound('Team not found');

  const isMember = await client.query('SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2', [
    teamId,
    userId,
  ]);
  if (!isMember.rowCount) throw forbidden('You are not a member of this team');

  // Case 1: Last member leaving deletes the team
  if (team.member_count <= 1) {
    await client.query('DELETE FROM teams WHERE id = $1', [teamId]);
    await writeAudit(client, {
      actorId: userId,
      teamId,
      action: 'team.deleted',
      details: { reason: 'last_member_left', name: team.name },
    });

    return {
      status: 200,
      body: { message: 'Team deleted as last member left', teamDeleted: true },
      afterCommit: () => publishTeamChanged(teamId),
    };
  }

  // Case 2: Team has other members. If user is the leader, transfer leadership to next oldest member
  let newLeaderId: number | null = null;
  if (team.leader_id === userId) {
    const nextLeader = await client.query<{ user_id: number }>(
      `SELECT user_id FROM team_members
        WHERE team_id = $1 AND user_id <> $2
        ORDER BY joined_at ASC, user_id ASC
        LIMIT 1`,
      [teamId, userId],
    );
    newLeaderId = nextLeader.rows[0]!.user_id;

    await client.query('UPDATE teams SET leader_id = $1 WHERE id = $2', [newLeaderId, teamId]);
    await writeAudit(client, {
      actorId: userId,
      teamId,
      action: 'leader.transferred',
      details: { from: userId, to: newLeaderId, reason: 'leader_left' },
    });
  }

  await client.query('DELETE FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, userId]);

  // Open the team back up since a slot just freed
  const upd = await client.query<{ member_count: number; is_open: boolean }>(
    `UPDATE teams SET member_count = member_count - 1, is_open = true
      WHERE id = $1 RETURNING member_count, is_open`,
    [teamId],
  );

  await writeAudit(client, {
    actorId: userId,
    teamId,
    action: 'member.left',
    details: { userId },
  });

  return {
    status: 200,
    body: {
      message: 'Left team successfully',
      teamDeleted: false,
      newLeaderId: newLeaderId ?? team.leader_id,
      memberCount: upd.rows[0]!.member_count,
    },
    afterCommit: () => publishTeamChanged(teamId),
  };
}

// ---------------------------------------------------------------------------
// Remove member (leader only)
// ---------------------------------------------------------------------------
export async function removeMember(
  client: PoolClient,
  leaderId: number,
  teamId: number,
  targetUserId: number,
): Promise<IdempotentResult> {
  const { rows } = await client.query<TeamRow>(`${TEAM_SELECT} WHERE t.id = $1 FOR UPDATE OF t`, [teamId]);
  const team = rows[0];
  if (!team) throw notFound('Team not found');
  if (team.leader_id !== leaderId) throw forbidden('Only the team leader can remove members');

  if (targetUserId === leaderId) {
    throw conflict('Leader cannot be removed. Transfer leadership or leave the team instead.', 'LEADER_CANNOT_BE_REMOVED');
  }

  const isMember = await client.query('SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2', [
    teamId,
    targetUserId,
  ]);
  if (!isMember.rowCount) throw notFound('Member not found in team');

  await client.query('DELETE FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, targetUserId]);

  const upd = await client.query<{ member_count: number; is_open: boolean }>(
    `UPDATE teams SET member_count = member_count - 1, is_open = true
      WHERE id = $1 RETURNING member_count, is_open`,
    [teamId],
  );

  await writeAudit(client, {
    actorId: leaderId,
    teamId,
    action: 'member.removed',
    details: { removedUserId: targetUserId, removedBy: leaderId },
  });

  return {
    status: 200,
    body: {
      message: 'Member removed successfully',
      removedUserId: targetUserId,
      memberCount: upd.rows[0]!.member_count,
    },
    afterCommit: () => publishTeamChanged(teamId),
  };
}

// ---------------------------------------------------------------------------
// Join Requests: Create, Accept (race-safe), Decline, List
// ---------------------------------------------------------------------------
export async function createJoinRequest(
  client: PoolClient,
  userId: number,
  teamId: number,
  _message?: string,
): Promise<IdempotentResult> {
  const { rows } = await client.query<TeamRow>(`${TEAM_SELECT} WHERE t.id = $1`, [teamId]);
  const team = rows[0];
  if (!team) throw notFound('Team not found');

  const existingMember = await client.query('SELECT 1 FROM team_members WHERE hackathon_id = $1 AND user_id = $2', [
    team.hackathon_id,
    userId,
  ]);
  if (existingMember.rowCount) throw alreadyInTeam();

  if (!team.is_open || team.member_count >= team.max_team_size) {
    throw conflict('This team is full or closed', 'TEAM_FULL');
  }

  try {
    const ins = await client.query<{ id: number; created_at: Date }>(
      `INSERT INTO join_requests (team_id, user_id, status)
       VALUES ($1, $2, 'pending') RETURNING id, created_at`,
      [teamId, userId],
    );

    await writeAudit(client, {
      actorId: userId,
      teamId,
      action: 'request.created',
      details: { requestId: ins.rows[0]!.id, userId },
    });

    return {
      status: 201,
      body: {
        message: 'Join request submitted',
        requestId: ins.rows[0]!.id,
        createdAt: ins.rows[0]!.created_at.toISOString(),
      },
      afterCommit: () => publishTeamChanged(teamId),
    };
  } catch (err) {
    if (isUniqueViolation(err, 'one_pending_request')) {
      throw conflict('You already have a pending join request for this team', 'REQUEST_PENDING');
    }
    throw err;
  }
}

export async function acceptJoinRequest(
  client: PoolClient,
  leaderId: number,
  teamId: number,
  requestId: number,
): Promise<IdempotentResult> {
  // 1. Lock team row first
  const { rows } = await client.query<TeamRow>(`${TEAM_SELECT} WHERE t.id = $1 FOR UPDATE OF t`, [teamId]);
  const team = rows[0];
  if (!team) throw notFound('Team not found');
  if (team.leader_id !== leaderId) throw forbidden('Only the team leader can accept join requests');
  if (team.member_count >= team.max_team_size) throw conflict('This team is full', 'TEAM_FULL');

  // 2. Lock request row
  const reqRes = await client.query<{ id: number; user_id: number; status: string }>(
    `SELECT id, user_id, status FROM join_requests WHERE id = $1 AND team_id = $2 FOR UPDATE`,
    [requestId, teamId],
  );
  const req = reqRes.rows[0];
  if (!req) throw notFound('Join request not found');
  if (req.status !== 'pending') throw conflict('This join request is no longer pending', 'REQUEST_NOT_PENDING');

  // 3. Verify user is not already in another team
  const already = await client.query('SELECT 1 FROM team_members WHERE hackathon_id = $1 AND user_id = $2', [
    team.hackathon_id,
    req.user_id,
  ]);
  if (already.rowCount) {
    await client.query("UPDATE join_requests SET status = 'cancelled', decided_at = now() WHERE id = $1", [requestId]);
    throw conflict('This user is already in another team for this hackathon', 'USER_ALREADY_IN_TEAM');
  }

  // 4. Add to team members
  try {
    await client.query('INSERT INTO team_members (team_id, hackathon_id, user_id) VALUES ($1, $2, $3)', [
      team.id,
      team.hackathon_id,
      req.user_id,
    ]);
  } catch (err) {
    if (isUniqueViolation(err)) {
      await client.query("UPDATE join_requests SET status = 'cancelled', decided_at = now() WHERE id = $1", [requestId]);
      throw conflict('This user is already in another team for this hackathon', 'USER_ALREADY_IN_TEAM');
    }
    throw err;
  }

  // 5. Update request status to accepted
  await client.query("UPDATE join_requests SET status = 'accepted', decided_at = now() WHERE id = $1", [requestId]);

  // Cancel any other pending requests for this user
  await client.query(
    "UPDATE join_requests SET status = 'cancelled', decided_at = now() WHERE user_id = $1 AND status = 'pending'",
    [req.user_id],
  );

  // 6. Update team member count
  const upd = await client.query<{ member_count: number; is_open: boolean }>(
    `UPDATE teams SET member_count = member_count + 1, is_open = (member_count + 1 < $2)
      WHERE id = $1 RETURNING member_count, is_open`,
    [team.id, team.max_team_size],
  );

  // 7. Audit log
  await writeAudit(client, {
    actorId: leaderId,
    teamId: team.id,
    action: 'request.accepted',
    details: { requestId, acceptedUserId: req.user_id },
  });
  await writeAudit(client, {
    actorId: req.user_id,
    teamId: team.id,
    action: 'member.joined',
    details: { via: 'join_request', acceptedBy: leaderId },
  });

  const updated = { ...team, member_count: upd.rows[0]!.member_count, is_open: upd.rows[0]!.is_open };
  return {
    status: 200,
    body: { message: 'Join request accepted', team: toDto(updated, leaderId) },
    afterCommit: () => publishTeamChanged(team.id),
  };
}

export async function declineJoinRequest(
  client: PoolClient,
  leaderId: number,
  teamId: number,
  requestId: number,
): Promise<IdempotentResult> {
  const { rows } = await client.query<TeamRow>(`${TEAM_SELECT} WHERE t.id = $1 FOR UPDATE OF t`, [teamId]);
  const team = rows[0];
  if (!team) throw notFound('Team not found');
  if (team.leader_id !== leaderId) throw forbidden('Only the team leader can decline join requests');

  const upd = await client.query<{ id: number; user_id: number }>(
    `UPDATE join_requests SET status = 'declined', decided_at = now()
      WHERE id = $1 AND team_id = $2 AND status = 'pending'
      RETURNING id, user_id`,
    [requestId, teamId],
  );
  if (!upd.rows[0]) throw notFound('Pending join request not found');

  await writeAudit(client, {
    actorId: leaderId,
    teamId,
    action: 'request.declined',
    details: { requestId, declinedUserId: upd.rows[0].user_id },
  });

  return {
    status: 200,
    body: { message: 'Join request declined', requestId },
    afterCommit: () => publishTeamChanged(teamId),
  };
}

export async function listJoinRequests(teamId: number, viewerId: number) {
  const { rows } = await pool.query<TeamRow>(`${TEAM_SELECT} WHERE t.id = $1`, [teamId]);
  const team = rows[0];
  if (!team) throw notFound('Team not found');

  // Verify viewer is either a team member or leader
  const member = await pool.query('SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2', [
    teamId,
    viewerId,
  ]);
  if (!member.rowCount && team.leader_id !== viewerId) {
    throw forbidden('Only team members can view join requests');
  }

  const reqs = await pool.query<{
    id: number;
    team_id: number;
    user_id: number;
    status: string;
    created_at: Date;
    decided_at: Date | null;
    user_name: string;
    user_skills: string[];
    user_timezone: string;
  }>(
    `SELECT r.id, r.team_id, r.user_id, r.status, r.created_at, r.decided_at,
            u.name as user_name, u.skills as user_skills, u.timezone as user_timezone
       FROM join_requests r
       JOIN users u ON u.id = r.user_id
      WHERE r.team_id = $1
      ORDER BY r.created_at DESC`,
    [teamId],
  );

  return {
    requests: reqs.rows.map((r) => ({
      id: r.id,
      teamId: r.team_id,
      userId: r.user_id,
      status: r.status,
      userName: r.user_name,
      skills: r.user_skills,
      timezone: r.user_timezone,
      createdAt: r.created_at.toISOString(),
      decidedAt: r.decided_at?.toISOString() ?? null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Audit Log Reader
// ---------------------------------------------------------------------------
export async function getAuditLogs(teamId: number, viewerId: number) {
  const { rows } = await pool.query<TeamRow>(`${TEAM_SELECT} WHERE t.id = $1`, [teamId]);
  const team = rows[0];
  if (!team) throw notFound('Team not found');

  const member = await pool.query('SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2', [
    teamId,
    viewerId,
  ]);
  if (!member.rowCount && team.leader_id !== viewerId) {
    throw forbidden('Only team members can view audit logs');
  }

  const logs = await pool.query<{
    id: number;
    at: Date;
    actor_id: number | null;
    action: string;
    details: any;
    actor_name: string | null;
  }>(
    `SELECT a.id, a.at, a.actor_id, a.action, a.details, u.name as actor_name
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.actor_id
      WHERE a.team_id = $1
      ORDER BY a.at DESC
      LIMIT 100`,
    [teamId],
  );

  return {
    auditLogs: logs.rows.map((l) => ({
      id: l.id,
      at: l.at.toISOString(),
      actorId: l.actor_id,
      actorName: l.actor_name ?? 'System',
      action: l.action,
      details: l.details,
    })),
  };
}

// ---------------------------------------------------------------------------
// Looking-for-Teammates Live Board (Event-Invalidated Low-Latency Cache)
// ---------------------------------------------------------------------------
interface BoardCacheEntry {
  data: any;
  expiresAt: number;
}
const boardCacheMap = new Map<string, BoardCacheEntry>();

// Evict cached board pages immediately whenever any team or member state changes
bus.on('board', () => {
  boardCacheMap.clear();
});

export async function getBoard(options: {
  hackathonId?: number;
  search?: string;
  skill?: string;
  page?: number;
  limit?: number;
}) {
  const hackathonId = options.hackathonId ?? 1;
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const offset = (page - 1) * limit;

  const cacheKey = `${hackathonId}:${page}:${limit}:${options.search ?? ''}:${options.skill ?? ''}`;
  const cached = boardCacheMap.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  let teamWhere = 't.hackathon_id = $1 AND t.is_open = true';
  const teamParams: any[] = [hackathonId];

  if (options.search) {
    teamParams.push(`%${options.search}%`);
    teamWhere += ` AND t.name ILIKE $${teamParams.length}`;
  }

  const countParams = [...teamParams];
  const queryParams = [...teamParams, limit, offset];

  const countQuery = pool.query<{ count: string }>(
    `SELECT count(*)::text as count FROM teams t WHERE ${teamWhere}`,
    countParams,
  );

  const teamsQuery = pool.query<{
    id: number;
    hackathon_id: number;
    name: string;
    leader_id: number;
    member_count: number;
    is_open: boolean;
    created_at: Date;
    min_team_size: number;
    max_team_size: number;
    leader_name: string;
  }>(
    `SELECT t.id, t.hackathon_id, t.name, t.leader_id, t.member_count, t.is_open,
            t.created_at, h.min_team_size, h.max_team_size,
            u.name as leader_name
       FROM teams t
       JOIN hackathons h ON h.id = t.hackathon_id
       JOIN users u ON u.id = t.leader_id
      WHERE ${teamWhere}
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`,
    queryParams,
  );

  const lookingUsersQuery = pool.query<{
    id: number;
    name: string;
    skills: string[];
    timezone: string;
    created_at: Date;
  }>(
    `SELECT u.id, u.name, u.skills, u.timezone, u.created_at
       FROM users u
      WHERE u.looking_for_team = true
        AND NOT EXISTS (
          SELECT 1 FROM team_members tm WHERE tm.hackathon_id = $1 AND tm.user_id = u.id
        )
      ORDER BY u.created_at DESC
      LIMIT 20`,
    [hackathonId],
  );

  const [countRes, teamRows, lookingUsers] = await Promise.all([
    countQuery,
    teamsQuery,
    lookingUsersQuery,
  ]);

  const totalTeams = parseInt(countRes.rows[0]?.count ?? '0', 10);
  const teamIds = teamRows.rows.map((r) => r.id);

  // Batch-fetch all member skills for returned teams in a single clean query
  const skillsMap = new Map<number, Set<string>>();
  if (teamIds.length > 0) {
    const memberSkills = await pool.query<{ team_id: number; skills: string[] }>(
      `SELECT tm.team_id, u.skills
         FROM team_members tm
         JOIN users u ON u.id = tm.user_id
        WHERE tm.team_id = ANY($1::bigint[])`,
      [teamIds],
    );
    for (const row of memberSkills.rows) {
      if (!skillsMap.has(row.team_id)) {
        skillsMap.set(row.team_id, new Set<string>());
      }
      const set = skillsMap.get(row.team_id)!;
      for (const s of row.skills) {
        set.add(s);
      }
    }
  }

  const result = {
    teams: teamRows.rows.map((t) => ({
      id: t.id,
      hackathonId: t.hackathon_id,
      name: t.name,
      leaderId: t.leader_id,
      leaderName: t.leader_name,
      memberCount: t.member_count,
      minTeamSize: t.min_team_size,
      maxTeamSize: t.max_team_size,
      openSeats: t.max_team_size - t.member_count,
      isOpen: t.is_open,
      isComplete: t.member_count >= t.min_team_size,
      skills: Array.from(skillsMap.get(t.id) ?? []),
      createdAt: t.created_at.toISOString(),
    })),
    totalTeams,
    page,
    limit,
    usersLooking: lookingUsers.rows.map((u) => ({
      userId: u.id,
      name: u.name,
      skills: u.skills,
      timezone: u.timezone,
      createdAt: u.created_at.toISOString(),
    })),
  };

  boardCacheMap.set(cacheKey, { data: result, expiresAt: Date.now() + 2000 });
  return result;
}

// ---------------------------------------------------------------------------
// Teammate Suggestions Algorithm with Score Explainability
// ---------------------------------------------------------------------------
export interface SuggestionResult {
  userId: number;
  name: string;
  skills: string[];
  timezone: string;
  score: number;
  explanation: {
    totalScore: number;
    skillScore: number;
    timezoneScore: number;
    complementarySkills: string[];
    overlappingSkills: string[];
    timezoneDiffHours: number;
    summary: string;
  };
}

export async function getSuggestions(teamId: number, limit = 10): Promise<{ suggestions: SuggestionResult[] }> {
  const { rows } = await pool.query<TeamRow>(`${TEAM_SELECT} WHERE t.id = $1`, [teamId]);
  const team = rows[0];
  if (!team) throw notFound('Team not found');

  // Get current team members, their combined skills, and avg/leader timezone offset
  const teamData = await pool.query<{
    skills: string[];
    utc_offset_min: number;
    is_leader: boolean;
  }>(
    `SELECT u.skills, u.utc_offset_min, (u.id = $2) as is_leader
       FROM team_members tm
       JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = $1`,
    [teamId, team.leader_id],
  );

  const teamSkillsSet = new Set<string>();
  let leaderOffset = 0;
  for (const row of teamData.rows) {
    if (row.is_leader) leaderOffset = row.utc_offset_min;
    for (const s of row.skills) {
      teamSkillsSet.add(s.toLowerCase());
    }
  }

  // Get candidate pool (looking for team and not in any team for this hackathon)
  const candidates = await pool.query<{
    id: number;
    name: string;
    skills: string[];
    timezone: string;
    utc_offset_min: number;
  }>(
    `SELECT u.id, u.name, u.skills, u.timezone, u.utc_offset_min
       FROM users u
      WHERE u.looking_for_team = true
        AND NOT EXISTS (
          SELECT 1 FROM team_members tm
           WHERE tm.hackathon_id = $1 AND tm.user_id = u.id
        )
      LIMIT 150`,
    [team.hackathon_id],
  );

  const scored: SuggestionResult[] = [];

  for (const c of candidates.rows) {
    const compSkills: string[] = [];
    const overlapSkills: string[] = [];

    for (const skill of c.skills) {
      if (teamSkillsSet.has(skill.toLowerCase())) {
        overlapSkills.push(skill);
      } else {
        compSkills.push(skill);
      }
    }

    // 1. Skill Score (0 to 60 pts)
    // 20 points per complementary skill (up to 3 = 60 pts), plus 5 per overlapping skill up to max 60
    const rawSkillScore = compSkills.length * 20 + overlapSkills.length * 5;
    const skillScore = Math.min(60, rawSkillScore);

    // 2. Timezone Score (0 to 40 pts)
    const tzDiffHours = Math.abs(c.utc_offset_min - leaderOffset) / 60;
    const timezoneScore = Math.max(0, Math.round(40 - tzDiffHours * 4));

    // Total Score (0 to 100)
    const totalScore = skillScore + timezoneScore;

    let summary = '';
    if (compSkills.length > 0) {
      summary = `${c.name} brings ${compSkills.length} complementary skill(s) (${compSkills.slice(0, 3).join(', ')}) and is ${tzDiffHours === 0 ? 'in your exact timezone' : `${tzDiffHours}h apart`}.`;
    } else if (overlapSkills.length > 0) {
      summary = `${c.name} shares ${overlapSkills.length} skill(s) with your team (${overlapSkills.slice(0, 3).join(', ')}) with ${tzDiffHours}h timezone difference.`;
    } else {
      summary = `${c.name} is looking for a team with ${tzDiffHours}h timezone difference.`;
    }

    scored.push({
      userId: c.id,
      name: c.name,
      skills: c.skills,
      timezone: c.timezone,
      score: totalScore,
      explanation: {
        totalScore,
        skillScore,
        timezoneScore,
        complementarySkills: compSkills,
        overlappingSkills: overlapSkills,
        timezoneDiffHours: tzDiffHours,
        summary,
      },
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return { suggestions: scored.slice(0, limit) };
}

// ---------------------------------------------------------------------------
// Current User Team in Hackathon
// ---------------------------------------------------------------------------
export async function getUserCurrentTeam(userId: number, hackathonId = 1) {
  const { rows } = await pool.query<{ team_id: number }>(
    `SELECT team_id FROM team_members WHERE user_id = $1 AND hackathon_id = $2`,
    [userId, hackathonId],
  );
  if (!rows[0]) return null;
  return getTeam(rows[0].team_id, userId);
}

export async function getUserRequests(userId: number) {
  const { rows } = await pool.query<{
    id: number;
    team_id: number;
    status: string;
    created_at: Date;
    decided_at: Date | null;
    team_name: string;
  }>(
    `SELECT r.id, r.team_id, r.status, r.created_at, r.decided_at,
            t.name as team_name
       FROM join_requests r
       JOIN teams t ON t.id = r.team_id
      WHERE r.user_id = $1
      ORDER BY r.created_at DESC`,
    [userId],
  );
  return {
    requests: rows.map((r) => ({
      id: r.id,
      teamId: r.team_id,
      teamName: r.team_name,
      status: r.status,
      createdAt: r.created_at.toISOString(),
      decidedAt: r.decided_at?.toISOString() ?? null,
    })),
  };
}
