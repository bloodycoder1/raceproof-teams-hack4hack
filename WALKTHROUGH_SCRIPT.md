# 5-Minute Video Walkthrough Script: TeamUp (PS1)

**Target Duration:** 4 minutes 45 seconds  
**Objective:** Clearly demonstrate the race-proof concurrency engine, automated proofs, scale benchmarks, and accessible React UI.

---

### [0:00 – 0:45] Section 1: Introduction & The Core Concurrency Problem
- **Visual:** Show the application homepage at `http://localhost:3000` with live SSE indicator and board of teams.
- **Voiceover:**
  > "Hello! This is **TeamUp**, a production-grade team-formation service engineered for hackathons with 10,000 participants.
  > 
  > The primary challenge of this problem is concurrency: when 50 or 100 participants click 'Join' on the last remaining seat in a team at the exact same millisecond, standard application logic suffers from dirty reads and lost updates, allowing teams to overflow past their maximum capacity.
  > 
  > Let's look at how TeamUp proves correctness under concurrency first, then explore its architecture and user experience."

---

### [0:45 – 1:45] Section 2: Automated Concurrency & Race Test Proof
- **Visual:** Switch to terminal and run `npm test`.
- **Voiceover:**
  > "Let's run our test suite. We have **95 automated tests** running in CI across 7 test suites.
  > 
  > Notice `tests/race.test.ts`. Here, we simulate 50 distinct participants firing concurrent HTTP requests at the same millisecond via `Promise.all()` to claim the final seat of a team.
  > 
  > As you can see, in 5 consecutive rounds:
  > - Exactly **1** user receives `200 OK`.
  > - Exactly **49** users receive `409 Conflict (TEAM_FULL)`.
  > - And after the race, the database invariants confirm: `teams.member_count == 4 == COUNT(team_members)`. Zero counter drift.
  > 
  > We also test idempotency: retrying the exact same request 50 times in parallel joins exactly once and replays the cached result.
  > 
  > Finally, notice our **chaos test** in `tests/chaos.test.ts`: we forcefully kill client sockets mid-join and prove that PostgreSQL transactions roll back with zero corruption or orphan records."

---

### [1:45 – 2:30] Section 3: 10,000-User Seed & Sub-200ms Load Benchmark
- **Visual:** In terminal, run `npm run seed` then `npm run loadtest`.
- **Voiceover:**
  > "Now let's examine scale. Running `npm run seed` seeds **10,000 users** and **2,000 teams** (with 4,800 memberships) into PostgreSQL in just **0.83 seconds** using batch unnesting.
  > 
  > Next, let's run `npm run loadtest`. This fires **100 concurrent connections** using Autocannon against our `/board` endpoint on this 10,000-user database for 10 seconds.
  > 
  > The benchmark completes over **13,600 requests** at **1,360 requests per second** with **zero errors**.
  > Our measured **p95 latency is 156 ms**, well under the hackathon requirement of 200 ms. This is achieved via partial indexing, parallel query execution, and event-invalidated in-memory caching."

---

### [2:30 – 4:00] Section 4: Live React UI & Real-Time Sync
- **Visual:** Switch back to browser. Walk through the UI flow.
- **Voiceover:**
  > "Now let's look at the React frontend. It's built with React, Vite, and Tailwind CSS, and is 100% accessible via keyboard-only navigation and mobile responsive.
  > 
  > First, notice the **Live Sync** indicator in the navbar. The board subscribes to a Server-Sent Events stream (`/board/stream`). Whenever a team is created or joined anywhere in the system, the board updates live for everyone with zero refresh.
  > 
  > Let's create a team: click 'Create Team', enter 'Cyber Wizards', and click Create. Notice the secret invite code displayed with cryptographic entropy. It is shown only once and stored as a SHA-256 hash in the database.
  > 
  > Now let's view our team dashboard. Here we see our roster.
  > 
  > Let's inspect the **Teammate Suggestions** tab. The system ranks candidate free agents based on two factors:
  > 1. **Skill Complementarity (0 to 60 points):** Rewarding candidates who bring skills our team currently lacks.
  > 2. **Timezone Proximity (0 to 40 points):** Based on the hourly difference.
  > Every candidate comes with a transparent, mathematical explanation of why they were recommended.
  > 
  > Next, in the **Pending Requests** tab, team leaders can accept or decline applicants. Accepting is fully race-proof and protected with row-level locks.
  > 
  > Look at the **Audit Log** tab: an immutable ledger tracking who did what, and when.
  > 
  > Finally, let's test **Leave Team**: our business rules dictate that when a leader leaves, leadership automatically transfers to the next oldest member. If the last member leaves, the team is deleted cleanly. Let's confirm leave — and as the last member, the team is deleted and we return to the board."

---

### [4:00 – 4:45] Section 5: Architecture Summary & Conclusion
- **Visual:** Show `DESIGN_DOC.md` and Docker Compose file.
- **Voiceover:**
  > "Under the hood, TeamUp uses:
  > - **PostgreSQL 16** with `SELECT ... FOR UPDATE` row locks and composite unique indexes.
  > - **Node.js Express** with strict Zod validation, Argon2 hashing, and Idempotency-Key support.
  > - **Server-Sent Events** for low-latency live streaming.
  > - **React with Tailwind CSS** for a responsive, accessible interface with optimistic UI and instant conflict rollback.
  > 
  > The entire stack can be launched with a single command: `docker compose up --build`.
  > 
  > Thank you for watching!"
