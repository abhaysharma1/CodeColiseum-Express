# Backend Audit — Express Application

_Date: 2026-11-03_
_Scope: `CodeColiseum-Express/src` (generated Prisma client excluded)_

This document records the state of the backend before the production-architecture
refactor, the problems found, and the migration plan that this refactor follows.

> **Status:** see `backend-architecture.md` for the current state. Every HTTP
> domain is now fully layered (`auth`, `problems` incl. teacher authoring,
> `notifications`, `permissions`, `marketplace`, `formatter`, `system`,
> `internal`, `analytics` incl. group/student stats, AI chat, admin incl.
> moderation, labs, teacher exams/groups, student exams/dashboard/results/groups).
> The remaining work is test depth, shared-service repository extraction and
> batching analytics writes.

---

## 1. Current structure

```text
src/
├── app.ts                  # Express app + middleware + all route mounting + error handler
├── routes/                 # 14 route files
├── controllers/            # 17 controller files (≈ 10 500 LOC)
├── services/               # 21 service files (≈ 3 900 LOC)
├── middleware/             # 5 files, role checks duplicated
├── permissions/            # RBAC constants + service (Prisma inline)
├── validations/            # 2 Zod schema files (lab, marketplace)
├── utils/                  # Prisma client, auth, SQS, S3, mail, exam helpers, RBAC util
├── config/                 # SSM loader + formatter config
├── formatters/             # language formatters
├── types/                  # ambient + domain types
└── generated/prisma/       # generated client (do not edit)
```

`server.ts` lives at the repository root and owns process lifecycle.

### Route surface (must be preserved)

| Mount | Router | Notes |
| --- | --- | --- |
| `/api/auth` | Better Auth node handler | session, sign-in/out, reset |
| `/api/teacher` | `teacher.route` + `lab.teacher.route` | exams, groups, problems, analytics, labs |
| `/api/student` | `student.routes` + `lab.student.route` | dashboard, results, labs, AI chat |
| `/api/marketplace` | `marketplace.routes` | browse, duplicate, rate |
| `/api/admin` | `admin.route` | problems, moderation, bulk signup, analytics |
| `/api/problems` | `problem.route` | practice list/detail/run/submit |
| `/api/internal` | `internal.routes` | cron: finalize exams, recompute analytics |
| `/api/permissions` | `permissions.route` | permission snapshot/check |
| `/api/public-auth` | `public.auth.route` | signup, password reset |
| `/api/notifications` | `notifications.route` | inbox, sent, read state |
| `/api/tools` | `formatter.routes` | code formatting |
| `/api/seb/config` | inline in `app.ts` | Safe Exam Browser config download |
| `/health`, `/` | inline in `app.ts` | liveness |

---

## 2. Findings

### 2.1 Controllers contain business logic and run Prisma queries

Every controller imports `@/utils/prisma` directly. Examples:

- `teacher.controllers.ts` (2 278 LOC) — exam lifecycle, group membership,
  enrollment, analytics aggregation and Prisma writes in one file.
- `admin.controllers.ts` (2 106 LOC) — problem CRUD, bulk CSV/XLSX signup,
  moderation, role assignment, password resets.
- `student.exam.controllers.ts` — exam attempt lifecycle, scoring, SEB checks
  and Prisma in the HTTP handler.
- `notifications.controllers.ts` — recipient resolution queries are in the
  controller while create/mark-read live in a service (split logic).
- `teacherProblem.controllers.ts` — ~600 LOC of schema + persistence logic.

Consequence: business rules cannot be tested without Express, and the same
queries are duplicated between controllers.

### 2.2 Routes contain logic and ad-hoc validation

`teacher.route.ts` defines `getGroupIdFromQuery` / `getGroupIdFromBody` helpers
and passes them into `requirePermission`. `admin.route.ts` configures multer
inline. No route/controller shares a single validation strategy.

### 2.3 Business logic depends on the HTTP request object

`runCodeService(req, …)`, `submitCodeService(req, …)`,
`getPracticeSubmissionStatusService(req, …)` and
`getExamSubmissionStatusService(req, …)` all take an Express `Request` to read
headers/session. Services therefore cannot be used from jobs, queues or tests.

### 2.4 Inconsistent error handling

Three incompatible error conventions coexist:

1. `next(error)` with an attached `(error as any).status = N`.
2. Plain `res.status(N).json({ message })` inside controllers.
3. `throw new Error(...)` from services with arbitrary HTTP semantics.

The global handler returns `{ success: false, message, stack }` (stack leaked in
development, not redacted), while many handlers return `{ error }`, `{ message }`
or `{ errors }`. Database errors are surfaced verbatim.

### 2.5 Duplicated authentication

`isLoggedin`, `isTeacher`, `isStudent` and `isAdmin` each re-implement session
lookup, `fromNodeHeaders`, and a Prisma role query. `problem.controllers.ts`
performs a fifth inline session lookup. Errors differ (`{error}` vs `{message}`,
empty `403` body for students).

`hasPermission` exists twice: `permissions/permission.service.ts` (global +
group, cached) and `utils/rbac-utils.ts` (group only, uncached). The latter is
unused but importable, creating two sources of truth.

### 2.6 Missing / ad-hoc validation

Only `lab`, `marketplace` and public-auth bodies use Zod. Most endpoints read
`req.body` / `req.query` with `as string` casts and manual presence checks.
`take` / `skip` are parsed ad hoc (`parseInt`) with no upper bound, allowing
unbounded result sets on some endpoints.

### 2.7 Security issues

- `server.ts` never connects/disconnects Prisma and has no `SIGINT` handling.
- `trust proxy` is unconditionally `true`.
- CORS accepts exactly one origin and no preflight allow-list changes.
- No rate limiting anywhere (credential endpoints included).
- SEB config path is computed from `process.cwd()` (fine) but the route lives in
  `app.ts`.
- Errors may leak stack traces and raw driver messages to clients.
- `console.log(error)` in auth controllers may log auth provider internals.
- No request IDs, so production errors cannot be correlated.

### 2.8 Database / transaction issues

- Multiple Prisma clients possible in theory; only `utils/prisma.ts` exists, but
  there is no transaction helper and service code calls `$transaction` inline.
- N+1 patterns in analytics loops (per-student/per-group `upsert` inside loops).
- `finalizeExams` writes results without a transaction, so partial finalization
  is possible.
- Pagination is inconsistent (`take`/`skip` vs `page`/`limit`).

### 2.9 Excessive parameter lists

Examples: `recalculateStudentStats(userId, groupId)`,
`calculateGroupExamAnalytics(examId, groupId)`,
`upsertModuleProblemProgress(userId, submissionId, status, moduleProblemId)`,
`getStudentGroups(userId, groupIds, params)` — mostly tolerable, but
`createExam`, `publishExam`, `saveDraft` controller flows pass 6–10 values
positionally inside long functions. New code uses typed input objects.

### 2.10 Configuration and observability

- No environment validation; a missing `DATABASE_URL` fails at import time with
  a generic error.
- `winston` is a dependency but unused; logging is `console.*` and `morgan`.
- No graceful shutdown of HTTP server + database.
- `notification`-style modules log without redaction.

### 2.11 Testing

- `package.json` runs Jest but there are **no tests** and no Jest/Vitest config.
- No unit tests for permission resolution, validation, error mapping or scoring.

---

## 3. Migration plan (incremental)

The refactor is delivered in vertical slices, one concern at a time, so the API
contract is never broken.

### Phase 0 — Foundation (no behaviour change)

1. `config/env.ts` — Zod-validated environment with defaults; fail fast in prod.
2. `config/logger.ts` — Winston logger with context + redaction.
3. `config/app.config.ts` — typed app/CORS/rate-limit config.
4. `shared/errors` — `AppError` hierarchy and `toAppError`.
5. `shared/http` — `asyncHandler`, pagination helpers, error envelope.
6. `shared/utils/redact.ts` — recursive secret masking.
7. `infrastructure/database` — single Prisma client + `runInTransaction`.
8. Middleware: `request-id`, `validation`, `authentication`, `authorization`,
   `rate-limit`, `error-handler`.
9. Rebuild `app.ts` via `createApp()` and a module registry; update `server.ts`
   for env validation, logging and graceful shutdown.

Acceptance: identical endpoints, identical success payloads, consistent error
envelope, typecheck passes.

### Phase 1 — Migrate self-contained modules

| Module | Files | Why first |
| --- | --- | --- |
| `auth` | public signup / password reset | small, has Zod already, security sensitive |
| `problems` | practice list/detail/tests/template, run/submit/status | services exist, HTTP coupling to remove |
| `notifications` | inbox / sent / read | already half-layered |
| `permissions` | check / me | repository extraction |
| `marketplace` | browse / duplicate / rate | already service-oriented |
| `formatter` | format | tiny, validates HTTP separation |
| `system` | health, SEB download | keeps `app.ts` free of routes |

Each module gets `*.routes.ts`, `*.controller.ts`, `*.service.ts`,
`*.repository.ts`, `*.schema.ts`, `*.types.ts`, `index.ts`.

### Phase 2 — Legacy domain extraction (larger files, separate changes)

`teacher` (2 278 LOC), `admin` (2 106 LOC), `student`/`exams`,
`labs` (997 + 959 LOC), `internal` (314 LOC) are registered through module
entry points now, but their controllers still contain persistence logic.
They will be split in follow-up slices (see `docs/backend-architecture.md`,
“Remaining work”), because moving them in one change would make review and
rollback unsafe.

### Phase 3 — Tests

Vitest + Supertest, with unit tests for the new infrastructure and integration
tests for `/health`, 404/error envelope and migrated validation paths.

---

## 4. Non-goals

- No Prisma schema change, no migration (per `AGENTS.md`).
- No change to success response shapes or endpoint URLs.
- No new ORM, queue or auth provider.
- No dependency-injection framework.
