# Backend Architecture Report

_Date: 2026-11-03_
_Project: `CodeColiseum-Express`_
_Companion document: `docs/backend-audit.md`_

This report documents the production-architecture refactor: the target layout,
the responsibilities of each layer, the migrations completed in this change and
the work that deliberately remains for follow-up slices.

---

## 1. Target structure

```text
src/
├── app.ts                     # compose middleware + module registry
├── config/
│   ├── env.ts                 # Zod-validated environment
│   ├── app.config.ts          # CORS / body limits / rate limits / pagination
│   ├── logger.ts              # Winston logger with redaction
│   └── ssm.ts                 # SEB secrets (unchanged)
├── modules/
│   ├── auth/                  # routes → controller → service → repository
│   ├── problems/
│   ├── notifications/
│   ├── permissions/
│   ├── marketplace/
│   ├── formatter/
│   ├── system/                # health, SEB download
│   ├── internal/              # cron finalization + analytics recompute
│   ├── exams/                 # student exam attempt lifecycle
│   ├── analytics/             # org + teacher + group/student analytics
│   ├── ai-chat/               # exam + lab AI conversations
│   ├── admin/                 # admin flows + problem moderation
│   ├── labs/                  # labs, modules, assessments, XLSX export
│   ├── users/                 # shared user repository (role lookups)
│   ├── teacher/               # exams + groups
│   ├── student/               # dashboard, results, groups + exam router
│   └── index.ts               # module registry
├── infrastructure/
│   └── database/
│       ├── prisma.ts          # single Prisma client
│       ├── transactions.ts    # runInTransaction
│       └── index.ts
├── middleware/
│   ├── authentication.ts      # session + role guards
│   ├── authorization.ts       # requirePermission
│   ├── validation.ts          # Zod before controllers
│   ├── request-id.ts
│   ├── request-logger.ts
│   ├── rate-limit.ts
│   ├── cron-auth.ts           # timing-safe internal endpoint guard
│   └── error-handler.ts       # 404 + centralized error translation
├── shared/
│   ├── errors/                # AppError hierarchy
│   ├── http/                  # asyncHandler, error envelope, pagination
│   ├── types/                 # AuthenticatedUser
│   └── utils/                 # redact, test-case normalizer
├── services/                  # shared stateless services (code execution, analytics recompute)
└── types/                     # ambient declarations
```

Every HTTP domain is now served from `modules/`. The legacy `controllers/` and
`routes/` folders are empty and can be removed. `services/` retains only shared,
domain-agnostic execution/analytics helpers. No API URL or success payload
changed.

---

## 2. Layer responsibilities (enforced for new code)

| Layer | May do | Must not do |
| --- | --- | --- |
| Route | declare paths, attach middleware, attach Zod schemas | business logic, Prisma |
| Controller | read validated input, call one service, set status/body | Prisma, HTTP-agnostic rules |
| Service | business rules, orchestrate repositories, transactions | import Express, touch `req`/`res` |
| Repository | Prisma queries, selects, pagination | business rules, HTTP |
| Schema | Zod validation for body/query/params/env | side effects |

Dependency direction is `route → controller → service → repository → Prisma`.
Services never import controllers or routes. Modules never import each other's
internals; cross-module reads go through exported entry points (e.g. the users
repository used by authentication middleware).

---

## 3. Request lifecycle

```text
request
  → requestId (crypto UUID, echoed as X-Request-Id)
  → requestLogger (structured, redacted)
  → helmet
  → cors (allow-list)
  → rate limit (/api, stricter for /api/public-auth)
  → better-auth handler (/api/auth only)
  → cookieParser + body limits
  → health / module routers
      → authentication (session + DB role)
      → authorization (permission + group scope)
      → validation (Zod)
      → controller → service → repository
  → notFoundHandler
  → errorHandler
```

`asyncHandler` wraps every asynchronous controller so rejections always reach
the centralized handler. Express 5 already forwards rejected promises, but the
explicit wrapper keeps the contract stable.

---

## 4. Error model

All failures are normalized to:

```json
{
  "success": false,
  "message": "Human readable message",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message",
    "details": "optional, redacted",
    "requestId": "uuid"
  }
}
```

- `AppError` subclasses cover 400/401/403/404/409/429/500/503.
- Zod errors become `VALIDATION_ERROR` with `{ errors: [{ path, message }] }`.
- Prisma `P2002` → 409, `P2025` → 404, `P2003` → 409; other known errors are
  logged and returned as a generic 500.
- Malformed JSON → 400.
- Unknown errors never expose messages or stack traces; the stack is logged
  server-side with the request id.
- The top-level `message` is kept so existing clients that read
  `response.message` keep working.

Legacy controllers that still attach `error.status` are supported by
`toAppError`, so behaviour is preserved while they are migrated.

---

## 5. Security and production readiness

- **Authentication** is centralized: one session lookup implementation, role
  always re-read from the database (`globalRoleId`), never from client input.
- **Authorization** uses the permission service (global + group scope) with a
  30-second cache; the duplicate `utils/rbac-utils.ts` implementation was
  removed.
- **Validation** happens before controllers for migrated modules; unknown or
  malformed values are rejected instead of silently coerced.
- **Rate limiting** is per-instance fixed-window (user id when authenticated,
  otherwise IP), configurable via `RATE_LIMIT_*`; disabled under `NODE_ENV=test`.
- **CORS** uses an allow-list (`CORS_ORIGINS`, defaults to `FRONTEND_URL`).
- **Secrets** are never logged: the Winston formatter redacts keys matching
  password/token/secret/authorization/cookie/api-key.
- **Startup** asserts `DATABASE_URL`/`DIRECT_URL` (and `BETTER_AUTH_SECRET` in
  production), connects Prisma, then listens.
- **Shutdown** handles `SIGTERM`, `SIGINT`, `unhandledRejection` and
  `uncaughtException`, closes the HTTP server, disconnects Prisma and force-exits
  after 10 s.
- **Body size** remains 10 MB (configurable) and the JSON parser is mounted after
  Better Auth, which needs the raw body.

---

## 6. Database

- One client instance is created in `infrastructure/database/prisma.ts`;
  `utils/prisma.ts` is now a re-export so no second client can appear.
- Connection string parsing preserves the previous sslmode behaviour and the
  optional `PG_USE_LIBPQ_COMPAT` flag.
- `runInTransaction` centralizes interactive transactions. New services use it;
  `marketplace` and notifications were converted.
- No Prisma schema change and no migration was made.
- Pagination helpers accept both `page`/`limit` and the legacy `take`/`skip` and
  cap page size, preventing unbounded queries in migrated modules.

---

## 7. Module status

Every HTTP domain is fully layered (`routes → controller → service → repository`).

| Module | Routes | Layers | Notes |
| --- | --- | --- | --- |
| auth | `/api/public-auth/signup`, `/request-password-reset` | full | duplicate e-mail → 409, reset e-mail → 404, provider errors logged and genericized |
| problems | `/api/problems/*` | full | role-aware visibility preserved, test-case normalization extracted to shared utils, module-problem + SEB guards preserved |
| problems (teacher authoring) | `/api/teacher/problems/*` | full | aggregate create/update in a transaction, ownership checks, teacher reference run has no Express dependency |
| notifications | `/api/notifications/*` | full | recipient resolution and read-state moved to repository/service; sender role checked against DB |
| permissions | `/api/permissions/check`, `/me` | full | Prisma extracted to repository; validation added |
| marketplace | `/api/marketplace/*` | full | service/controller moved into module, typed Prisma filters, `tagIds` comma parsing fixed |
| formatter | `/api/tools/format` | full | Zod validation + logger; response contract unchanged |
| system | `/health`, `/`, `/api/seb/config` | full | removed inline routes from `app.ts` |
| internal | `/api/internal/exams/finalize`, `/analytics/recompute` | full | timing-safe cron guard, transactional finalization, batched submission lookup |
| exams (student) | `/api/student/exam/*` | full | attempt lifecycle extracted; final submit is atomic; submission history ownership enforced |
| student | `/api/student/*` (dashboard, results, groups) | full | repositories for dashboard/result/group queries; group access checks return 403/404; result payload preserved |
| analytics | `/api/admin/analytics/*`, `/api/teacher/exam/stats|recent-activity|top-students` | full | org + teacher dashboard queries; chart uses one query; query validation and caps added |
| admin moderation | `/api/admin/problems/pending|rejected|approved`, `/:id/approve|reject` | full | typed 404/400/validation errors; list pagination capped |
| ai-chat | `/api/student/exam/ai/*`, `/api/student/lab/ai/*` | full | repository/service/controller split; availability no longer crashes; lab access enforced; first-message rate-limit bug fixed |
| group analytics | `/api/teacher/group-*-stats`, `/api/teacher/analytics/*` | full | 15 endpoints moved into repository/service; query validation/caps; time chart single query; CSV/PDF preserved |
| labs | `/api/teacher/labs|modules|module-problems/*`, `/api/student/my-labs|modules|module-problems/*` | full | repository/service/controller split; student access checks on every read; XLSX export preserved |
| teacher (exams/groups) | `/api/teacher/exam/*`, `/api/teacher/*group*` | full | exam/group repositories and services; permission ordering preserved; batch user lookups |
| admin | `/api/admin/*` (problems, uploads, performance tooling, bulk signup, credentials) | full | problem editor/import and account flows; multer moved to `admin.upload.ts`; runtime analyzer takes headers instead of `Request` |

Services that used to require an Express `Request` were refactored:

- `codeRunner.service` now takes `{ userId, questionId, languageId, code }`.
- `problemSubmission.service` now takes `{ userId, … }` and returns typed
  responses.
- `codeSubmission.service` now takes `{ userId, sebContext, … }`.
- `runReferenceSolution.service` now takes `{ languageId, code, cases }`.
- `exam.utils` exposes `SebRequestContext` + `toSebRequestContext(req)`, and
  `canGiveExamForUser()` so services do not import Express. Eligibility failures
  now raise typed 403/404/409 errors instead of generic 500s.

`normalizeProblemTestCases` moved to `shared/utils/problem-test-cases.ts` and is
shared by practice and exam flows.

### Internal finalization

`finalizeExpiredExams` now:

1. Loads expired exams and all in-progress attempts.
2. Fetches final submissions once per exam (no per-attempt query).
3. Persists results, attempt state and exam status in one transaction per exam.
4. Refreshes group/student/exam analytics after commit; group and student stats
   upserts are themselves transactional.

### Student exam flow

The exam routes are served by `modules/exams`. `getSubmissions` now verifies the
attempt belongs to the requesting student, closing an IDOR where any student
could read another attempt's submissions. `submitTest` writes the attempt state
and `ExamResult` row atomically.

---

## 8. Remaining limitations

No HTTP domain is left in the legacy `controllers/`/`routes/` folders. The
remaining improvement areas are internal quality and test depth:

- `services/analytics.service.ts`, `services/group.service.ts` and the code
  execution services still use Prisma directly instead of repositories. They are
  shared orchestration services and are candidates for repository extraction.
- N+1 writes in `updateGroupStatistics` (one student upsert per loop); batching
  needs a schema-level upsert plan.
- Some teacher exam listing/dashboard authorization still iterates exams (legacy
  behavior, preserved deliberately).
- A few legacy handlers still return bare `{ message }` payloads on success
  paths; failure responses are unified through the error envelope.
- `npm audit` reports pre-existing transitive advisories (mostly development
  tooling). They were not force-upgraded because the fix requires major
  dependency bumps and belongs in a dedicated security pass.
- No DB-backed integration tests yet; unit tests use mocked repositories, and the
  smoke test covers read-only/unauthorized paths against the configured database.

---

## 9. Behaviour changes (intentional, documented)

1. **Error envelope** is now consistent and includes `requestId`. The legacy
   top-level `message` is retained, so existing clients keep working.
2. **Validation is stricter** on migrated endpoints (unknown enum values,
   missing IDs, oversized page sizes now return 400 instead of being ignored).
3. **Rate limiting** is enabled outside tests (`RATE_LIMIT_MAX`, 30/min for
   public auth). Set `RATE_LIMIT_DISABLED=true` to opt out.
4. **Startup fails fast** when the database URL is missing; the process no longer
   starts in a half-configured state.
5. **Marketplace `tagIds`** accepts a comma-separated string (previously the
   schema rejected it before the controller could split it).
6. **Notification sender role** is verified against the database rather than the
   session snapshot.
7. **CORS** is an explicit allow-list; unknown origins receive no CORS headers.
8. **Internal cron endpoints deny access when `CRON_SECRET` is unset.** The
   legacy check allowed the request when both the configured secret and the
   header were `undefined`. Comparison is now timing-safe.
9. **Exam eligibility failures return typed statuses** (403/404/409) instead of
   generic 500 responses from thrown `Error`s.
10. **Exam submission history requires ownership** of the attempt.
11. **Exam final submission and cron finalization are atomic** (attempt/result
    and exam-status writes happen in a transaction).
12. **Student group search defaults to empty** instead of the string
    `"undefined"` (the legacy handler filtered `title contains "undefined"`
    when `searchValue` was omitted).
13. **Student group access failures** return 403/404 instead of generic 500s,
    and list pagination defaults/caps are enforced.
14. **Student dashboard queries run in parallel** instead of sequentially.
15. **Teacher problem aggregate writes are atomic** (tags, tests, driver code,
    solutions and fields are replaced in one transaction).
16. **Teacher problem ownership failures** return 403/404 and validation errors
    use the shared envelope instead of ad-hoc `{ errors }` payloads.
17. **Analytics endpoints validate and cap query parameters**, and the teacher
    chart uses a single range query instead of one query per day.
18. **Admin moderation** returns typed 404/400 errors and caps list pagination;
    the duplicate organization-admin check was removed because the admin router
    already enforces the platform-admin role.
19. **Exam AI availability** returns `{ enabled: false }` when the student has no
    AI-enabled group instead of crashing on `group[0].id`.
20. **The first AI message is no longer rate-limited** (the legacy code created
    the rate-limit row and immediately rejected the request).
21. **Null AI quotas mean unlimited** instead of immediately exceeding the quota.
22. **Lab AI chat/status require the lab to be assigned to the student**, and all
    AI failures use typed errors.
23. **Group analytics validates and caps** pagination/filter inputs, uses
    `array_contains` for the JSON weak-topic filter, reports real
    `avgAttempts`, and builds the time chart with one problem lookup instead of
    an N+1 loop.
24. **Labs** now validate bodies/queries at the route boundary (centralized error
    envelope) and enforce student access on every lab/module/module-problem read.
    Legacy pagination quirks and XLSX payloads were preserved.
25. **Teacher exams/groups** now raise typed 400/403/404 errors instead of
    legacy 500s, reject missing IDs at validation time, default omitted
    `selectedProblemsId` to `[]`, and batch user lookups during group
    creation/member addition.
26. **Admin flows** validate bodies/queries/params at the route boundary (multer
    field names preserved) and return the shared error envelope on failures.
    Bulk CSV/XLSX parsing, row messages, status codes and generated
    passwords are unchanged.
27. **Runtime analyzer** now accepts `IncomingHttpHeaders` instead of an Express
    `Request`, so the admin service layer has no HTTP dependency.

No route URL, HTTP method or success payload was changed.

---

## 10. Verification

Run from `CodeColiseum-Express`:

```bash
npx tsc --noEmit     # pass
npm run build        # pass (tsc + tsc-alias)
npm test             # 17 files, 123 tests pass (Vitest + Supertest)
npm run lint         # 0 errors, 0 warnings
```

Tests cover:

- error hierarchy + legacy status normalization,
- pagination helpers,
- test-case bundle normalization,
- permission key/alias resolution,
- `/health`, 404 envelope, request-id propagation,
- Zod validation envelope,
- authentication guard on `/api/tools/format`,
- cron secret guard (missing, wrong-length, unset configuration),
- exam score calculation (highest-per-problem and final averaging),
- exam submission-history ownership enforcement,
- student group membership/ownership checks,
- teacher problem ownership, deletion conflicts and resubmission rules,
- admin moderation rules (teacher-only problems, approval),
- organization analytics mapping and single-query chart bucketing,
- AI chat availability, quota null-handling, cooldown and lab access,
- group analytics access, rankings, overview metrics, chart distributions and CSV output,
- teacher exam/group access rules and pure exam rules,
- labs teacher/student access and module-problem availability windows,
- admin helpers/schemas and admin service rules.

DB-backed integration tests were not added because no disposable PostgreSQL
instance is provisioned in this environment; the automated tests deliberately
avoid database access.

Manual smoke test on the production build (`node dist/server.js`, port 5110):

- `GET /health` → 200 with `X-Request-Id`
- `GET /api/problems/getproblems` / `gettags` → 200 from the migrated repository/service
- `GET /api/does-not-exist` → 404 error envelope with `requestId`
- `GET /api/permissions/me` (anonymous) → 401 error envelope
- malformed JSON → 400 `VALIDATION_ERROR` envelope
- teacher exam/labs/problems/analytics, student dashboard/labs/exam/AI,
  admin problems/performance/analytics/moderation (anonymous) → 401 envelopes

Prisma connected successfully against the configured database during the smoke
test.

---

## 11. Next steps

1. Add DB-backed integration tests (Supertest + a disposable Postgres schema).
2. Introduce OpenAPI/contract tests generated from the Zod schemas.
3. Replace group/student analytics N+1 upserts with batched writes.
4. Extract repositories for the remaining shared services (`analytics`,
   `group`, code execution).
5. Add a load test for the rate limiter and submission polling endpoints.
6. Run a dependency security pass (`npm audit`) in a dedicated change.
