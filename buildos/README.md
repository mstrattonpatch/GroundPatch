# BuildOS (working name) — clickable prototype

One connected construction platform: quality, programme, workforce & safety, and commercial, all sharing one project record. Built from the *Construction Management Platform Product Blueprint* and the *BuildOS Interface Designs v0.1*.

**Everything shown is sample data.** It resets when the server restarts, or from the avatar menu → *Reset sample data*.

## Run it

```bash
cd buildos
npm install
npm run dev        # http://localhost:3000
npm test           # business-rule unit tests
npm run typecheck
```

Open `/` for the public site, then **Log in** and pick a role. Each role lands on the screen designed for it, and you can switch roles from the avatar menu.

## What's in it

| Area | Routes |
| --- | --- |
| Public site | `/` homepage, `/pricing`, `/security`, `/demo` |
| Control centre | `/app`: portfolio, money, quality, workforce, my tasks, activity |
| Project overview | `/app/projects/[id]`: attention list, milestone readiness, lookahead, diary |
| Quality | Defect register with filters and CSV export, defect workflow (assign → rectify → verify/reject), ITPs with hold-point release |
| Programme | Gantt chart of forecast vs baseline, slip per task |
| Commercial | Contract, variations with delegated approval limits, budget by cost code, progress claims |
| Safety & workforce | SWMS review and acknowledgement, site eligibility with the exact missing requirement, contractor insurances |
| Documents, site diary | Revision control (in review vs current vs superseded); diary auto-fills attendance |
| Site app (mobile) | `/site` today screen, `/site/defect` raise defect (works offline), `/site/sign-in` worker QR sign-in |

## Rules the prototype enforces (on the server)

- A defect can't be assigned without a due date. Closing one needs completion evidence and an authorised reviewer. A rejected repair goes back to rectification.
- A variation over a project manager's $50k limit needs a director. Unapproved variations show only as *exposure* and never change the contract value. Approving the same variation twice is refused.
- Releasing a hold point records who released it and when. It does **not** mark the programme task complete.
- A worker can't sign in to site until the blocking requirement is met (induction, White Card, SWMS acknowledgement). A check-in is attendance, not an approved timesheet.
- Subcontractors see only their own company's defects and get a 404 on commercial pages.
- Submitted diaries can't be overwritten. Every action writes an audit event.
- Offline defects are queued on the device and sent when signal returns, with a client key so a retry can't create a duplicate.

## Code layout

```
src/lib/domain/   pure business rules: types, permissions, workflows (unit-tested)
src/lib/server/   in-memory store, seed data, session, derived views
src/app/          Next.js App Router pages and server actions
src/components/   UI kit (status badges, stepper, metric cards, forms, shell)
db/schema.sql     draft PostgreSQL schema with the same shape as the store
tests/            node:test unit tests
```

## Not built yet (next steps)

1. **Database:** swap `store.ts` for PostgreSQL using `db/schema.sql` (e.g. Supabase or managed Postgres plus Drizzle/Prisma).
2. **Auth:** replace the demo role picker with a managed identity provider, with MFA for privileged roles.
3. **File storage:** photos are counted but not uploaded yet. Planned: private bucket, signed URLs, thumbnails and virus scanning.
4. **Not yet built:** NCRs, permits and incidents, timesheets, purchase orders and invoices, handover, reports, guided project setup, and the accounting integration.
5. **PWA:** service worker, installable app, camera QR scanning.
