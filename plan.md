# Lab Management REST APIs — Implementation Plan

## Architecture

```
src/
├── routes/
│   ├── lab.teacher.route.ts      # Teacher lab routes (mounted at /api/teacher)
│   └── lab.student.route.ts      # Student lab routes (mounted at /api/student)
├── controllers/
│   ├── lab.teacher.controllers.ts # 22 teacher controller functions
│   └── lab.student.controllers.ts # 4 student controller functions
├── services/
│   └── lab.service.ts            # Shared business logic
├── validations/
│   └── lab.schema.ts             # Zod validation schemas
├── types/
│   └── lab.types.ts              # DTOs/interfaces
└── app.ts                        # Route mounting
```

## Prisma Schema — 5 New Models

| Model | Key Fields | Constraints |
|---|---|---|
| `Lab` | `id` (uuid), `title`, `description?`, `creatorId` → User | `@index([creatorId])` |
| `LabAssignment` | `labId` → Lab, `groupId` → Group | `@@unique([labId, groupId])` |
| `LabModule` | `labId` → Lab, `weekNumber`, `orderIndex?`, `unlockAt?`, `dueAt?`, `assessmentExamId?` | `@@unique([labId, weekNumber])` |
| `ModuleProblem` | `moduleId` → LabModule, `problemId` → Problem, `orderIndex?` | `@@unique([moduleId, problemId])` |
| `ModuleProblemProgress` | `userId` → User, `moduleProblemId` → ModuleProblem, `attemptCount`, `isSolved`, `solvedAt?`, `latestSubmissionId?`, `bestSubmissionId?`, `lastAttemptAt?` | `@@unique([userId, moduleProblemId])` |

## Routes

### Teacher Routes (`/api/teacher`)
```
POST   /labs                         -> createLab           [LAB_CREATE]
GET    /labs                         -> getLabs             [LAB_VIEW]
GET    /labs/:labId                  -> getLab              [LAB_VIEW]
PATCH  /labs/:labId                  -> updateLab           [LAB_EDIT]
DELETE /labs/:labId                  -> deleteLab           [LAB_DELETE]
POST   /labs/:labId/assign           -> assignLab           [LAB_ASSIGN]
POST   /labs/:labId/modules          -> createModule        [LAB_EDIT]
GET    /labs/:labId/modules          -> getLabModules       [LAB_VIEW]
GET    /modules/:moduleId            -> getModule           [LAB_VIEW]
PATCH  /modules/:moduleId            -> updateModule        [LAB_EDIT]
DELETE /modules/:moduleId            -> deleteModule        [LAB_EDIT]
POST   /modules/:moduleId/problems   -> addModuleProblems   [LAB_EDIT]
GET    /modules/:moduleId/problems   -> getModuleProblems   [LAB_VIEW]
DELETE /module-problems/:moduleProblemId -> removeModuleProblem [LAB_EDIT]
POST   /modules/:moduleId/assessment -> assignAssessment    [LAB_EDIT]
PATCH  /modules/:moduleId/assessment -> updateAssessment    [LAB_EDIT]
DELETE /modules/:moduleId/assessment -> removeAssessment    [LAB_EDIT]
POST   /modules/:moduleId/create-assessment -> createAssessment [LAB_EDIT + EXAM_CREATE]
GET    /modules/:moduleId/assessment -> getAssessment       [LAB_VIEW]
GET    /modules/:moduleId/assessment-results -> getAssessmentResults [ANALYTICS_VIEW]
GET    /modules/:moduleId/student-progress -> getModuleStudentProgress [ANALYTICS_VIEW]
GET    /modules/:moduleId/problem-analytics -> getModuleProblemAnalytics [ANALYTICS_VIEW]
```

### Student Routes (`/api/student`)
```
GET    /my-labs                    -> getMyLabs
GET    /my-labs/:labId             -> getMyLab
GET    /modules/:moduleId/problems -> getModuleProblems (with progress)
GET    /modules/:moduleId/progress -> getModuleProgress
GET    /modules/:moduleId/assessment -> getAssessment
```

## Key Design Decisions

- **IDs**: `uuid()` (matching majority of models)
- **Delete**: Hard delete (matching `exam.deleteMany` pattern)
- **Errors**: `{ success: false, message: "..." }` (global error handler format)
- **Success**: Direct data return (existing controller pattern)
- **Assessment**: Thin integration layer — reuses existing `Exam` model, `assessmentExamId` link
- **One-click flow**: `create-assessment` creates Exam + ExamGroup links + sets link in one transaction
- **Progress**: Idempotent upsert with `latestSubmissionId` dedup check
- **Module status**: Computed on read from ModuleProblemProgress + ExamAttempt
- **Transactions**: `prisma.$transaction(async tx => ...)` for atomic operations
- **Validation**: Zod schemas in dedicated file, parsed in controllers
- **Pagination**: skip/take pattern

## Assessment Integration

- `assessmentExamId` on `LabModule` links to existing `Exam`
- `getAssessment`: Fetches linked Exam, computes status from dates
- `createAssessment`: Creates draft Exam + ExamGroup links for all lab-assigned groups
- `getAssessmentResults`: Queries ExamAttempt for aggregated stats (total/attempted students, avg/high/low scores)
- Module completion: All ModuleProblems solved + assessment attempted (if exists)

## Submission Integration

In `problemSubmission.service.ts` and `codeSubmission.service.ts`:

When returning a terminal submission status, defer a call to `upsertModuleProblemProgress`:
- Find ModuleProblem by problemId — skip if not a lab problem
- Dedup by checking latestSubmissionId
- Upsert with attemptCount increment
- Set isSolved only on ACCEPTED and if not already solved
