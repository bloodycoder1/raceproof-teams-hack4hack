# TeamUp: Race-Proof Team Formation at Scale (PS1)

[![CI](https://github.com/bloodycoder1/raceproof-teams-hack4hack/actions/workflows/ci.yml/badge.svg)](https://github.com/bloodycoder1/raceproof-teams-hack4hack/actions)
![Tests](https://img.shields.io/badge/tests-95%20passed-brightgreen)
![Benchmark](https://img.shields.io/badge/p95%20latency-156ms%20(%3C200ms)-blue)
![Scale](https://img.shields.io/badge/seeded-10k%20users%20%7C%202k%20teams-purple)
![Stack](https://img.shields.io/badge/stack-PostgreSQL%20%7C%20Express%20%7C%20React%20%7C%20Tailwind%20v4-emerald)

> **The Challenge:** Hundreds of people clicking "Join" at the exact same millisecond. Exactly one person gets the last seat.

**TeamUp** is a production-grade team-formation service engineered for 10,000 hackathon participants: invite codes, join requests accepted/declined by leaders, live zero-refresh boards, explainable teammate matchmaking, and strict ACID concurrency guarantees backed by automated race proofs.

---

## Deliverables & Documentation Quick Links

- 📄 **1-Page Design Document:** [DESIGN_DOC.md](file:///d:/Hack4Hack/DESIGN_DOC.md) *(Data model, concurrency prevention, trade-offs, and 1-week roadmap)*
- 📊 **Load Test Report:** [load-test-report.md](file:///d:/Hack4Hack/load-test-report.md) *(Autocannon benchmark: 100 concurrent users, p95 = 156ms)*
- 🎬 **5-Minute Video Walkthrough Script:** [WALKTHROUGH_SCRIPT.md](file:///d:/Hack4Hack/WALKTHROUGH_SCRIPT.md) *(Scene-by-scene demonstration guide)*
- 🚀 **Free-Tier Deployment Guide:** [DEPLOYMENT.md](file:///d:/Hack4Hack/DEPLOYMENT.md) *(1-click Render blueprint and Railway instructions)*

---

## Architecture Overview

```
teamup/
├── docker-compose.yml          One-command startup (Postgres 16 + App)
├── Dockerfile                  Multi-stage build (Vite React + Express API)
├── load-test-report.md         Autocannon benchmark report (p95 < 200ms)
├── DESIGN_DOC.md               1-page architectural design document
├── WALKTHROUGH_SCRIPT.md       5-minute demo video walkthrough script
├── .github/workflows/ci.yml    Continuous Integration (Typecheck, Migrate, 95 Tests)
├── client/                     React SPA (Vite + Tailwind CSS v4 + @tailwindcss/vite)
│   └── src/
│       ├── components/         Board, TeamDashboard, Modals, Navbar
│       ├── context/            AuthContext, ToastContext (Optimistic UI)
│       └── lib/                api.ts (Automatic Idempotency-Key injection)
└── server/                     Express + TypeScript Backend
    ├── scripts/
    │   └── load-test.ts        Autocannon benchmark runner (100 concurrent users)
    ├── src/
    │   ├── db/
    │   │   ├── migrations/     001_init.sql, 002_default_hackathon.sql
    │   │   ├── pool.ts         Connection pool (max 50, withTransaction)
    │   │   └── seed.ts         Batch seeder (10k users & 2k teams in 0.83s)
    │   ├── lib/                idempotency.ts, inviteCode.ts, events.ts (SSE bus), audit.ts
    │   ├── middleware/         auth.ts, rateLimit.ts, validate.ts (Zod)
    │   ├── routes/             auth.ts, users.ts, teams.ts, board.ts, health.ts
    │   └── services/           teams.service.ts, auth.service.ts
    └── tests/
        ├── race.test.ts        Concurrency proof: 50 joiners for 1 seat
        ├── lifecycle.test.ts   Leadership transfer, team deletion, requests race
        ├── chaos.test.ts       Socket destroy mid-join ACID rollback test
        ├── auth.test.ts        Registration, login, JWT cookies, rate limiting
        └── teams.test.ts       Validation, rotation, member checks
```

---

## How We Prevent Race Conditions

### The Dual-Layer Concurrency Defense
1. **Layer 1 — Row-Level Pessimistic Locking (`SELECT ... FOR UPDATE`):**
   When 50 users click "Join" on a team with only 1 slot open, the first request acquires the exclusive row lock on the team. The remaining 49 requests cleanly queue behind it. When the first commits (`member_count = 4`), PostgreSQL re-reads the row for the waiters, immediately evaluates `4 >= 4 (TEAM_FULL)`, rolls back, and returns `409 Conflict`.
2. **Layer 2 — Composite Database Constraints (`UNIQUE (hackathon_id, user_id)`):**
   If a user tries to race two join calls simultaneously to two different teams in the same hackathon, the unique index immediately raises error `23505`, guaranteeing no user is ever in two teams.

### Automated Concurrency Proof:
Running `npm test` executes the proof:
- **50 parallel joins for 1 seat:** Exactly **1** gets HTTP 200, exactly **49** receive HTTP 409 `TEAM_FULL`. Tested across 5 consecutive rounds.
- **Idempotency proof:** Retrying the same join request 50 times in parallel joins exactly once and replays the cached response.
- **Concurrent Request Acceptance Race:** 20 leaders/threads simultaneously accept requests for 1 seat $\rightarrow$ exactly 1 succeeds, 19 fail with 409 `TEAM_FULL`.
- **Chaos Mid-Flight Abort:** Client socket is forcefully destroyed mid-join. Transaction cleanly rolls back with zero corruption or orphan records.

---

## Quick Start: One Command (Docker Compose)

Launch the entire stack (PostgreSQL + Express API + React Frontend) with a single command:

```bash
docker compose up --build
```

- **Frontend & App:** Open [http://localhost:4000](http://localhost:4000)
- **API Health:** Open [http://localhost:4000/health](http://localhost:4000/health)
- **System Metrics:** Open [http://localhost:4000/metrics](http://localhost:4000/metrics)

---

## Local Development Setup

### 1. Prerequisites
- Node.js $\ge 20$
- PostgreSQL 14+ running on port 5432 (default user `teamup:teamup` or configured in `.env`)

### 2. Backend Server
```bash
cd server
cp .env.example .env
npm install
npm run migrate      # Applies PostgreSQL schema
npm run seed         # Seeds 10,000 users and 2,000 teams in < 1 second!
npm run dev          # API running on http://localhost:4000
```

### 3. Frontend Client
```bash
cd client
npm install
npm run dev          # Vite SPA running on http://localhost:3000 (proxies /api to :4000)
```

---

## Testing & Benchmarks

### 1. Run Automated Test Suite (95 Tests)
```bash
cd server
npm test
```
```text
 Test Files  7 passed (7)
      Tests  95 passed (95)
   Duration  27.99s
 ✓ tests/teams.test.ts (36 tests)
 ✓ tests/lifecycle.test.ts (20 tests)
 ✓ tests/race.test.ts (10 tests)
 ✓ tests/auth.test.ts (24 tests)
 ✓ tests/chaos.test.ts (1 test)
 ✓ tests/rateLimit.test.ts (2 tests)
 ✓ tests/health.test.ts (2 tests)
```

### 2. Run High-Speed Scale Seeder (10,000 Users)
```bash
cd server
npm run seed
```
- Inserts **10,000 realistic users**, **2,000 teams** (1,600 open, 400 full), and **4,800 memberships** in **0.83 seconds**.
- Default demo user: `user1@hackathon.dev` / `Password123!`

### 3. Run Autocannon Load Benchmark (100 Concurrent Users)
```bash
cd server
npm run loadtest
```
```text
📊 Benchmark Summary:
   Concurrent Users:  100
   Duration:          10s
   Total Requests:    13,611
   Req / Second:      1,361.1 req/s
   Average Latency:   73.82 ms
   p50 Latency:       58 ms
   p90 Latency:       90 ms
   p95 Latency:       156 ms  (Target: < 200 ms)  ✅ PASSED
   Errors / Non-2xx:  0  (100% Success Rate)
```

---

## Complete API Reference

### Authentication & Users
| Method | Path | Description |
| :--- | :--- | :--- |
| `POST` | `/auth/register` | Register new participant (`email`, `password`, `name`, `timezone`, `skills[]`) |
| `POST` | `/auth/login` | Authenticate participant and set secure httpOnly JWT cookie (rate limited) |
| `POST` | `/auth/logout` | Clears authentication session cookie |
| `GET` | `/users/me` | Fetch authenticated user profile |
| `PATCH` | `/users/me` | Update skills, timezone, or looking-for-team flag |
| `GET` | `/users/me/team` | Fetch user's current team membership in the hackathon |
| `GET` | `/users/me/requests` | List user's pending and historical join requests |

### Teams & Concurrency
| Method | Path | Description |
| :--- | :--- | :--- |
| `POST` | `/teams` | Create new team (`name`, `hackathonId`). *Requires `Idempotency-Key`* |
| `POST` | `/teams/join-by-code` | Race-proof seat acquisition via invite code. *Requires `Idempotency-Key`* |
| `GET` | `/teams/:id` | Get team details, members, and leader status |
| `POST` | `/teams/:id/invite-code` | Rotate secret invite code (Leader only). *Requires `Idempotency-Key`* |
| `POST` | `/teams/:id/leave` | Leave team: auto-transfers leadership or deletes team if last member |
| `DELETE` | `/teams/:id/members/:memberId` | Remove member from team (Leader only). *Requires `Idempotency-Key`* |
| `GET` | `/teams/:id/stream` | **SSE live stream** for real-time team page synchronization |

### Join Requests & Matchmaking
| Method | Path | Description |
| :--- | :--- | :--- |
| `POST` | `/teams/:id/requests` | Submit request to join open team. *Requires `Idempotency-Key`* |
| `GET` | `/teams/:id/requests` | View pending join requests (Team members & Leader) |
| `POST` | `/teams/:id/requests/:requestId/accept` | Race-proof request approval with seat locking (Leader only) |
| `POST` | `/teams/:id/requests/:requestId/decline` | Decline join request (Leader only) |
| `GET` | `/teams/:id/suggestions` | **Matchmaking engine**: ranks free agents by skills & timezone with score breakdown |
| `GET` | `/teams/:id/audit` | View immutable audit ledger (`who`, `what`, `when`) |

### Looking-for-Teammates Board
| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/board` | Paginated open teams and free-agent participants with search & skill filters |
| `GET` | `/board/stream` | **SSE live stream** broadcasting real-time updates when teams or seats change |
| `GET` | `/health` | Liveness health check |
| `GET` | `/metrics` | System observability metrics (DB pool stats, memory usage, row counts) |

---

## Teammate Suggestions Algorithm

The matchmaking engine (`GET /teams/:id/suggestions`) evaluates available participants using a transparent, explainable formula:

$$\text{Score} = \min(60, |S_{\text{new}}| \times 20 + |S_{\text{overlap}}| \times 5) + \max(0, 40 - |\Delta\text{TZ}| \times 4)$$

- **Skill Complementarity (0 to 60 pts):** Rewards candidates bringing skills that the team currently lacks ($20\text{ pts}$ per missing skill).
- **Timezone Proximity (0 to 40 pts):** Scores compatibility based on hourly offset difference $|\Delta\text{TZ}|$ from the team leader's timezone.
- **Explainability:** Each recommendation returns an explanation breakdown object with scores, missing skills covered, and human-readable reasoning.

---

## Accessibility & Keyboard Navigation

- **100% Keyboard Operable:** Complete tab sequence with prominent focus rings (`focus-visible`).
- **Modal Dialogs:** Fully compliant with WAI-ARIA (`role="dialog"`, `aria-modal="true"`, `aria-labelledby`), with automatic `Escape` key dismissal and backdrop click support.
- **Screen Reader Announcements:** Toast alerts render inside an `aria-live="polite"` live region.
- **Mobile-First Responsive Layout:** Adaptive drawer menus, full touch target heights ($\ge 44\text{px}$), and swipeable tabs.
