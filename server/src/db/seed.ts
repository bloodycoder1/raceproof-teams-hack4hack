import { hashPassword } from '../lib/password.js';
import { generateInviteCode, hashInviteCode } from '../lib/inviteCode.js';
import { pool } from './pool.js';

const FIRST_NAMES = [
  'Aiden', 'Alex', 'Alice', 'Amara', 'Arun', 'Bob', 'Charlie', 'Chloe', 'David', 'Dev',
  'Elena', 'Emma', 'Ethan', 'Fatima', 'Grace', 'Hassan', 'Isabella', 'Jack', 'James', 'Jia',
  'Kenji', 'Kiran', 'Leo', 'Liam', 'Maya', 'Mei', 'Noah', 'Olivia', 'Priya', 'Rahul',
  'Ravi', 'Sara', 'Sofia', 'Siddharth', 'Tara', 'Vikram', 'Yuki', 'Zara', 'Zane', 'Zoe'
];

const LAST_NAMES = [
  'Agarwal', 'Chen', 'Das', 'Dubois', 'Garcia', 'Gupta', 'Ito', 'Johnson', 'Kim', 'Kumar',
  'Lopez', 'Miller', 'Nakamura', 'Patel', 'Rao', 'Rossi', 'Sato', 'Sharma', 'Singh', 'Smith',
  'Tanaka', 'Taylor', 'Verma', 'Wang', 'Williams', 'Wu', 'Yilmaz', 'Zhang'
];

const SKILL_POOL = [
  'TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Python', 'Docker',
  'Kubernetes', 'GraphQL', 'Rust', 'Go', 'TailwindCSS', 'AWS',
  'Machine Learning', 'Next.js', 'Redis', 'Figma', 'Solidity', 'System Design'
];

const TIMEZONES = [
  { tz: 'UTC', offset: 0 },
  { tz: 'America/New_York', offset: -300 },
  { tz: 'America/Los_Angeles', offset: -480 },
  { tz: 'America/Chicago', offset: -360 },
  { tz: 'Europe/London', offset: 0 },
  { tz: 'Europe/Berlin', offset: 60 },
  { tz: 'Asia/Kolkata', offset: 330 },
  { tz: 'Asia/Tokyo', offset: 540 },
  { tz: 'Asia/Singapore', offset: 480 },
  { tz: 'Australia/Sydney', offset: 660 },
];

const ADJECTIVES = [
  'Agile', 'Apex', 'Binary', 'Blazing', 'Cloud', 'Cyber', 'Delta', 'Echo', 'Elite', 'Fast',
  'Hyper', 'Infinite', 'Matrix', 'Neural', 'Nova', 'Omni', 'Pixel', 'Quantum', 'Rapid', 'Shadow',
  'Sonic', 'Spectra', 'Swift', 'Sync', 'Titan', 'Turbo', 'Ultra', 'Vector', 'Vortex', 'Zenith'
];

const NOUNS = [
  'Builders', 'Coders', 'Crafters', 'Crew', 'Devs', 'Engineers', 'Force', 'Guild', 'Hackers', 'Innovators',
  'Knights', 'Lab', 'Minds', 'Ninjas', 'Pioneers', 'Rangers', 'Squad', 'Titans', 'Units', 'Wizards'
];

export async function seed() {
  const start = performance.now();
  console.log('🚀 Starting high-speed seed for 10,000 users and 2,000 teams...');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Reset tables cleanly
    console.log('🧹 Truncating existing tables...');
    await client.query(`
      TRUNCATE TABLE audit_log, idempotency_keys, join_requests, team_members, teams, users RESTART IDENTITY CASCADE
    `);

    // Ensure Default Hackathon exists
    await client.query(`
      INSERT INTO hackathons (id, name, min_team_size, max_team_size)
      OVERRIDING SYSTEM VALUE
      VALUES (1, 'Global Hackathon 2026', 2, 4)
      ON CONFLICT (id) DO UPDATE SET min_team_size = 2, max_team_size = 4
    `);

    // 2. Pre-compute standard password hash ONCE
    console.log('🔑 Computing standard password hash for all users...');
    const defaultPasswordHash = await hashPassword('Password123!');

    // 3. Generate 10,000 users
    console.log('👥 Generating 10,000 realistic users...');
    const TOTAL_USERS = 10_000;
    const emails: string[] = [];
    const names: string[] = [];
    const passwordHashes: string[] = [];
    const timezones: string[] = [];
    const utcOffsets: number[] = [];
    const skillsList: string[][] = [];
    const lookingList: boolean[] = [];

    for (let i = 1; i <= TOTAL_USERS; i++) {
      const fn = FIRST_NAMES[i % FIRST_NAMES.length]!;
      const ln = LAST_NAMES[(i * 7) % LAST_NAMES.length]!;
      const name = `${fn} ${ln}`;
      const email = `user${i}@hackathon.dev`;
      const tzInfo = TIMEZONES[i % TIMEZONES.length]!;

      // 3-5 distinct skills per user
      const userSkillsCount = 3 + (i % 3);
      const userSkills: string[] = [];
      for (let s = 0; s < userSkillsCount; s++) {
        const skill = SKILL_POOL[(i * 3 + s) % SKILL_POOL.length]!;
        if (!userSkills.includes(skill)) userSkills.push(skill);
      }

      emails.push(email);
      names.push(name);
      passwordHashes.push(defaultPasswordHash);
      timezones.push(tzInfo.tz);
      utcOffsets.push(tzInfo.offset);
      skillsList.push(userSkills);
      // First 4800 users will be in teams, remaining 5200 are looking for a team
      lookingList.push(i > 4800);
    }

    // Insert 10,000 users in chunks of 2,500 using unnest
    console.log('⚡ Inserting 10,000 users into PostgreSQL...');
    const skillsCsvList = skillsList.map((arr) => arr.join(','));
    const CHUNK_SIZE = 2500;
    for (let c = 0; c < TOTAL_USERS; c += CHUNK_SIZE) {
      await client.query(
        `INSERT INTO users (email, password_hash, name, timezone, utc_offset_min, skills, looking_for_team)
         SELECT u.email, u.password_hash, u.name, u.timezone, u.utc_offset_min,
                string_to_array(u.skills_csv, ','), u.looking_for_team
           FROM UNNEST(
             $1::text[],
             $2::text[],
             $3::text[],
             $4::text[],
             $5::int[],
             $6::text[],
             $7::boolean[]
           ) AS u(email, password_hash, name, timezone, utc_offset_min, skills_csv, looking_for_team)`,
        [
          emails.slice(c, c + CHUNK_SIZE),
          passwordHashes.slice(c, c + CHUNK_SIZE),
          names.slice(c, c + CHUNK_SIZE),
          timezones.slice(c, c + CHUNK_SIZE),
          utcOffsets.slice(c, c + CHUNK_SIZE),
          skillsCsvList.slice(c, c + CHUNK_SIZE),
          lookingList.slice(c, c + CHUNK_SIZE),
        ],
      );
    }
    console.log(`✅ 10,000 users inserted successfully.`);

    // 4. Generate 2,000 Teams
    console.log('🏆 Generating and inserting 2,000 teams...');
    const TOTAL_TEAMS = 2_000;
    const teamNames: string[] = [];
    const leaderIds: number[] = [];
    const memberCounts: number[] = [];
    const isOpens: boolean[] = [];
    const inviteHashes: Buffer[] = [];
    const inviteExpiries: Date[] = [];

    // Distribution of team sizes:
    // 500 teams of size 1 (open, 3 seats left)
    // 600 teams of size 2 (open, 2 seats left)
    // 500 teams of size 3 (open, 1 seat left)
    // 400 teams of size 4 (full, closed)
    let currentUserIndex = 1;
    const teamMembersToInsert: { teamId: number; userId: number; isLeader: boolean }[] = [];

    const now = new Date();
    const expiry = new Date(now.getTime() + 48 * 3600 * 1000);

    for (let t = 1; t <= TOTAL_TEAMS; t++) {
      let desiredSize = 1;
      if (t <= 500) desiredSize = 1;
      else if (t <= 1100) desiredSize = 2;
      else if (t <= 1600) desiredSize = 3;
      else desiredSize = 4;

      const adj = ADJECTIVES[(t * 3) % ADJECTIVES.length]!;
      const noun = NOUNS[(t * 7) % NOUNS.length]!;
      const teamName = `${adj} ${noun} ${t}`;

      const leaderId = currentUserIndex;
      const code = generateInviteCode();
      const codeHash = hashInviteCode(code);

      teamNames.push(teamName);
      leaderIds.push(leaderId);
      memberCounts.push(desiredSize);
      isOpens.push(desiredSize < 4);
      inviteHashes.push(codeHash);
      inviteExpiries.push(expiry);

      for (let m = 0; m < desiredSize; m++) {
        teamMembersToInsert.push({
          teamId: t,
          userId: currentUserIndex,
          isLeader: m === 0,
        });
        currentUserIndex++;
      }
    }

    // Insert teams
    await client.query(
      `INSERT INTO teams (id, hackathon_id, name, leader_id, member_count, is_open, invite_code_hash, invite_expires_at)
       SELECT t.id, 1, t.name, t.leader_id, t.member_count, t.is_open, t.invite_code_hash, t.invite_expires_at
         FROM UNNEST(
           $1::bigint[],
           $2::text[],
           $3::bigint[],
           $4::int[],
           $5::boolean[],
           $6::bytea[],
           $7::timestamptz[]
         ) AS t(id, name, leader_id, member_count, is_open, invite_code_hash, invite_expires_at)`,
      [
        Array.from({ length: TOTAL_TEAMS }, (_, idx) => idx + 1),
        teamNames,
        leaderIds,
        memberCounts,
        isOpens,
        inviteHashes,
        inviteExpiries,
      ],
    );
    console.log(`✅ 2,000 teams inserted successfully.`);

    // 5. Insert Team Members
    console.log(`🤝 Inserting ${teamMembersToInsert.length} team memberships...`);
    const tmTeamIds = teamMembersToInsert.map((m) => m.teamId);
    const tmUserIds = teamMembersToInsert.map((m) => m.userId);

    await client.query(
      `INSERT INTO team_members (team_id, hackathon_id, user_id)
       SELECT m.team_id, 1, m.user_id
         FROM UNNEST(
           $1::bigint[],
           $2::bigint[]
         ) AS m(team_id, user_id)`,
      [tmTeamIds, tmUserIds],
    );
    console.log(`✅ ${teamMembersToInsert.length} team memberships inserted.`);

    // 6. Reset Sequences to avoid id collision on future inserts
    await client.query(`SELECT setval('users_id_seq', (SELECT max(id) FROM users))`);
    await client.query(`SELECT setval('teams_id_seq', (SELECT max(id) FROM teams))`);

    await client.query('COMMIT');

    const duration = ((performance.now() - start) / 1000).toFixed(2);
    console.log(`🎉 Seeding completed in ${duration}s!`);
    console.log(`   📊 Summary:`);
    console.log(`   - Users: 10,000 (4,800 in teams, 5,200 looking for teams)`);
    console.log(`   - Teams: 2,000 (1,600 open, 400 full)`);
    console.log(`   - Default test login: user1@hackathon.dev / Password123!`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Allow direct CLI execution: tsx src/db/seed.ts
if (process.argv[1]?.endsWith('seed.ts')) {
  seed()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async () => {
      await pool.end();
      process.exit(1);
    });
}
