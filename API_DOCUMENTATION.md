# CodeColiseum Express API Documentation

## 1. Overview

- Base URL: `http://<host>:<port>`
- Content type: `application/json`
- Auth system: Better Auth session (`/api/auth/*`)
- Route prefixes from app setup:
  - `/problems`
  - `/student`
  - `/teacher`
  - `/admin`
  - `/internal`

## 2. Authentication and Authorization

This project relies on Better Auth session headers/cookies. Endpoints are protected by middleware:

- `isLoggedIn`: any authenticated user
- `isStudent`: authenticated user with `role = STUDENT`
- `isTeacher`: authenticated user with `role = TEACHER`
- `isAdmin`: authenticated user with `role = ADMIN`

Common auth failures:

- `401 Unauthorized`
- `403 Forbidden`

> Note: some middleware paths return status without a JSON body for 401/403.

## 3. Error Response Pattern

There are two styles of errors in code:

1. Global error handler style
```json
{
  "success": false,
  "message": "Error message"
}
```

2. Controller-local style
```json
{
  "error": "Error message"
}
```

## 4. Public/Utility Endpoints

### GET /health
- Auth: none
- Request: none
- Response 200:
```json
{
  "status": "UP",
  "timestamp": "2026-03-22T00:00:00.000Z"
}
```

### GET /
- Auth: none
- Request: none
- Response 200:
```json
{
  "status": "UP"
}
```

### Better Auth routes
- Prefix: `/api/auth/*`
- Managed by Better Auth handler (`toNodeHandler(auth)`).
- Includes signup/signin/session and related auth operations.

## 5. Problem APIs (`/problems`)

### GET /problems/getproblems
- Auth: none
- Query:
  - `searchValue?` string
  - `tags?` string
  - `difficulty?` string (`EASY | MEDIUM | HARD`)
  - `take?` number (default 10)
  - `skip?` number (default 0)
- Response 200: array of problem records with included tag relation.

### GET /problems/gettags
- Auth: none
- Request: none
- Response 200:
```json
[
  {
    "id": "tag_id",
    "name": "Array"
  }
]
```

### GET /problems/gettestcases
- Auth: none
- Query:
  - `id` string (problem id)
- Response 200: run test case object for the problem.
- Response 400/404: missing id or not found.

### POST /problems/gettemplatecode
- Auth: none
- Body:
```json
{
  "problemId": "problem_id",
  "languageId": 71
}
```
- Response 200:
```json
{
  "template": "...",
  "languageId": 71
}
```

### POST /problems/getsubmissions
- Auth: logged in
- Body:
```json
{
  "problemId": "problem_id"
}
```
- Response 200:
```json
{
  "submissions": [
    {
      "id": "submission_id",
      "language": "Python",
      "createdAt": "2026-03-22T00:00:00.000Z",
      "noOfPassedCases": 10,
      "code": "..."
    }
  ]
}
```

### POST /problems/runcode
- Auth: logged in
- Body:
```json
{
  "questionId": "problem_id",
  "languageId": 71,
  "code": "def solve(): ..."
}
```
- Response 200:
```json
{
  "responses": [
    {
      "language": "python",
      "version": "3.12.0",
      "run": {
        "stdout": "...",
        "stderr": "",
        "output": "...",
        "code": 0,
        "signal": null
      },
      "compile": {
        "stdout": "",
        "stderr": "",
        "output": "",
        "code": 0,
        "signal": null
      }
    }
  ],
  "cases": [
    {
      "input": "...",
      "output": "..."
    }
  ]
}
```

### POST /problems/submitcode
- Auth: logged in
- Body:
```json
{
  "questionId": "problem_id",
  "languageId": 71,
  "code": "def solve(): ..."
}
```
- Response 201 or 200:
```json
{
  "status": "ACCEPTED",
  "noOfPassedCases": 20,
  "totalCases": 20,
  "totalTimeTaken": 0.72,
  "totalMemoryUsed": 123456,
  "yourTimeComplexity": "NLOGN",
  "expectedTimeComplexity": "NLOGN"
}
```
- Failure variant example:
```json
{
  "status": "BAD_ALGORITHM",
  "noOfPassedCases": 3,
  "totalCases": 20,
  "failedCase": {
    "language_id": 71,
    "source_code": "...",
    "stdin": "...",
    "expected_output": "..."
  },
  "failedCaseExecutionDetails": {
    "status": {
      "id": 4,
      "description": "Wrong Answer"
    }
  }
}
```

## 6. Student APIs (`/student`)

All endpoints in this section require Student role.

### GET /student/getdashboarddata
- Query: none
- Response 200:
```json
{
  "groups": [],
  "exams": {
    "upcomingExams": [],
    "ongoingExams": []
  },
  "prevResults": [],
  "problemDetails": {
    "totalSolvedProblems": 0,
    "easyProblemSolved": 0,
    "mediumProblemSolved": 0,
    "hardProblemSolved": 0,
    "totalNoOfQuestions": 0
  }
}
```

### GET /student/getgroups
- Query:
  - `take?` number
  - `skip?` number
  - `searchValue?` string
  - `groupType?` enum value
- Response 200: groups where student is a member.

### GET /student/getgroupdata
- Query:
  - `groupId` string
- Response 200: group object.

### GET /student/getgroupexams
- Query:
  - `groupId` string
  - `take?` number
  - `skip?` number
  - `searchValue?` string
- Response 200: exam array for that group.

### GET /student/getgroupcreator
- Query:
  - `groupId` string
- Response 200: creator user object.

### GET /student/getexamresult
- Query:
  - `examId` string
- Response 200:
```json
{
  "examDetails": {
    "id": "exam_id",
    "title": "Exam",
    "examStatus": "completed",
    "description": "...",
    "durationMin": 60,
    "startDate": "2026-03-22T00:00:00.000Z",
    "endDate": "2026-03-22T01:00:00.000Z",
    "creator": {
      "id": "teacher_id",
      "name": "Teacher",
      "email": "teacher@example.com"
    },
    "problems": []
  },
  "examAttempt": {
    "id": "attempt_id",
    "status": "SUBMITTED",
    "startedAt": "...",
    "expiresAt": "...",
    "submittedAt": "...",
    "totalScore": 80
  },
  "finalScore": 80,
  "submissionReports": [],
  "ranking": {
    "currentStudent": {
      "rank": 2,
      "studentId": "student_id",
      "studentName": "Student",
      "studentEmail": "student@example.com",
      "totalScore": 80,
      "submittedAt": "..."
    },
    "allRankings": []
  }
}
```

### GET /student/getexamairesult
- Query:
  - `examId` string
- Response 200: array of AI evaluation records with submission and problem details.

## 7. Student Exam APIs (`/student/exam`)

All endpoints require Student role.

### GET /student/exam/problem-description
- Query: `problemId` string
- Response 200: problem record.

### GET /student/exam/submissions
- Query:
  - `attemptId` string
  - `problemId` string
- Response 200:
```json
{
  "submissions": []
}
```

### GET /student/exam/test-cases
- Query: `questionId` string
- Response 200: run test case record.

### GET /student/exam/exam-details
- Query: `examId` string
- Response 200: exam object.

### POST /student/exam/test-problems
- Body:
```json
{
  "examId": "exam_id"
}
```
- Response 200: array of exam-problem mappings.

### POST /student/exam/heartbeat
- Body: none
- Response 200:
```json
{
  "ok": true
}
```

### POST /student/exam/start-test
- Body:
```json
{
  "examId": "exam_id"
}
```
- Response 201: created/updated exam attempt.

### POST /student/exam/submit-code
- Body:
```json
{
  "examId": "exam_id",
  "problemId": "problem_id",
  "sourceCode": "...",
  "languageId": 71
}
```
- Response 200:
```json
{
  "success": true,
  "submissionId": "submission_id",
  "status": "ACCEPTED",
  "score": 100,
  "passedCount": 10,
  "totalCount": 10,
  "results": [
    {
      "status": "ACCEPTED",
      "stdout": "...",
      "stderr": null,
      "compile_output": null,
      "time": "0.02",
      "memory": 1234
    }
  ],
  "totalTimeTaken": 0.24,
  "totalMemoryTaken": 12000,
  "yourTimeComplexity": "NLOGN",
  "expectedTimeComplexity": "NLOGN"
}
```

### POST /student/exam/submit-test
- Body:
```json
{
  "examId": "exam_id"
}
```
- Response 200:
```json
{
  "success": true,
  "attemptId": "attempt_id",
  "status": "SUBMITTED",
  "submittedAt": "2026-03-22T00:00:00.000Z",
  "totalScore": 85
}
```

## 8. Student AI Chat APIs (`/student/exam/ai`)

### GET /student/exam/ai/isenabledandgetgroupid
- Query:
  - `examId` string
- Response 200:
```json
{
  "enabled": true,
  "groupId": "group_id"
}
```
- Fallback response can be:
```json
{
  "enabled": false
}
```

### POST /student/exam/ai/chat
- Body:
```json
{
  "groupId": "group_id",
  "examId": "exam_id",
  "problemId": "problem_id",
  "message": "I am stuck on edge cases",
  "language": "Python"
}
```
- Response 201:
```json
{
  "status": "PROCESSING"
}
```

### GET /student/exam/ai/chat/status
- Query:
  - `examId` string
  - `problemId` string
- Response 200 variants:
```json
{
  "status": "IDLE"
}
```
```json
{
  "status": "PROCESSING"
}
```
```json
{
  "status": "COMPLETED",
  "message": {
    "id": "msg_id",
    "role": "assistant",
    "content": "Hint...",
    "createdAt": "2026-03-22T00:00:00.000Z"
  }
}
```

## 9. Teacher APIs (`/teacher`)

All endpoints require Teacher role.

### POST /teacher/creategroup
- Body:
```json
{
  "groupName": "Batch A",
  "description": "Spring batch",
  "emails": ["student1@example.com", "student2@example.com"],
  "allowJoinByLink": true,
  "isAiEnabled": true,
  "type": "CLASS",
  "aiMaxMessages": 20,
  "aiMaxTokens": 2000
}
```
- Response 200:
```json
{
  "notFoundMembers": [],
  "notStudents": [],
  "alreadyMembers": [],
  "addedCount": 2,
  "successfullyAdded": [
    {
      "email": "student1@example.com",
      "name": "student1"
    }
  ]
}
```

### GET /teacher/getallgroups
- Query: optional pagination/search filters
- Response 200: teacher-owned groups.

### GET /teacher/getgroupdetails
- Query: `groupId` string
- Response 200: group object.

### GET /teacher/getgroupmembers
- Query: `groupId` string
- Response 200: user array for group members.

### GET /teacher/getgroupexams
- Query: `groupId` string
- Response 200: array of exams linked to the group (each exam includes at least `id`, `title`, `isPublished`, `status`, `startDate`, `endDate`).

### POST /teacher/addmembertogroup
- Body:
```json
{
  "groupId": "group_id",
  "newEmails": "student1@example.com,student2@example.com"
}
```
- Response 200:
```json
{
  "message": "Members added successfully",
  "notFoundStudents": []
}
```

### GET /teacher/group-overall-stats
- Query: `groupId` string
- Response 200: group overall stats object or `null`.

### GET /teacher/group-problem-stats
- Query:
  - `groupId` string
  - `take?` number
  - `skip?` number
  - `searchValue?` string
- Response 200: problem stats array (with problem metadata).

### GET /teacher/student-overall-stats
- Query: `groupId` string
- Response 200: student overall stats array (with student metadata).

### GET /teacher/student-problem-stats
- Query:
  - `groupId` string
  - `studentId` string
- Response 200: student-problem stats array.

## 10. Teacher Exam APIs (`/teacher/exam`)

### GET /teacher/exam/fetchallexams
- Query:
  - `take?` number
  - `skip?` number
  - `searchvalue?` string
- Response 200: teacher-created exams.

### GET /teacher/exam/draftexam
- Request: none
- Response 201: newly created draft exam.

### GET /teacher/exam/getexam
- Query: `examId` string
- Response 200: exam object if owned by teacher and not published.

### GET /teacher/exam/getallgroups
- Query optional filters
- Response 200: groups owned by teacher.

### GET /teacher/exam/getallexamgroups
- Query: `examId` string
- Response 200: groups attached to exam.

### GET /teacher/exam/getallexamproblem
- Query: `examId` string
- Response 200:
```json
{
  "problems": [
    {
      "id": "exam_problem_id"
    }
  ]
}
```

### POST /teacher/exam/savedraft
- Body:
```json
{
  "updatedExamDetails": {
    "id": "exam_id",
    "title": "Exam 1",
    "description": "...",
    "startDate": "2026-03-23T10:00:00.000Z",
    "endDate": "2026-03-23T11:00:00.000Z",
    "durationMin": 60,
    "sebEnabled": false
  },
  "selectedGroups": [
    {
      "id": "group_id"
    }
  ],
  "selectedProblemsId": ["problem_id_1", "problem_id_2"]
}
```
- Response 200:
```json
{
  "message": "Draft saved successfully"
}
```

### POST /teacher/exam/publishexam
- Body: same shape as save draft.
- Response 200:
```json
{
  "message": "Exam published successfully"
}
```

### GET /teacher/exam/getresults
- Query: `examId` string
- Response 200:
```json
{
  "examDetails": {
    "id": "exam_id",
    "title": "Exam",
    "description": "...",
    "durationMin": 60,
    "startDate": "...",
    "endDate": "...",
    "isPublished": true,
    "status": "completed",
    "sebEnabled": false,
    "problems": []
  },
  "studentResults": [
    {
      "studentId": "student_id",
      "studentName": "Student",
      "studentEmail": "student@example.com",
      "attemptId": "attempt_id",
      "status": "SUBMITTED",
      "startedAt": "...",
      "submittedAt": "...",
      "expiresAt": "...",
      "totalScore": 80,
      "lastHeartbeatAt": "...",
      "disconnectCount": 0,
      "problemScores": []
    }
  ],
  "statistics": {
    "totalStudents": 10,
    "submitted": 8,
    "inProgress": 1,
    "notStarted": 1,
    "averageScore": 64.25,
    "highestScore": 100,
    "lowestScore": 20,
    "completionRate": 80
  }
}
```

### GET /teacher/exam/getairesult
- Query: `examId` string
- Response 200: submission list with `aiEvaluation`, `user`, and `problem`.

### POST /teacher/exam/start-ai-evaluation
- Body:
```json
{
  "examId": "exam_id"
}
```
- Response 201:
```json
{
  "message": "AI evaluation started",
  "total": 42
}
```

### GET /teacher/exam/get-ai-evaluation-status
- Query: `examId` string
- Response 200:
```json
{
  "total": 42,
  "completed": 17
}
```

## 11. Admin APIs (`/admin`)

All endpoints require Admin role.

### POST /admin/complexity-cases
- Body:
```json
{
  "problemId": "problem_id",
  "expectedComplexity": "NLOGN",
  "cases": [
    { "input": "...", "output": "..." }
  ]
}
```
- Response 201:
```json
{
  "success": true,
  "data": {
    "id": "complexity_case_id",
    "problemId": "problem_id"
  }
}
```

### POST /admin/driver-code
- Body:
```json
{
  "problemId": "problem_id",
  "languageId": 71,
  "header": "...",
  "template": "...",
  "footer": "..."
}
```
- Response 201:
```json
{
  "success": true,
  "data": {
    "id": "driver_code_id",
    "problemId": "problem_id",
    "languageId": 71
  }
}
```

### GET /admin/problem-test-generator
- Query: `problemId` string
- Response 200:
```json
{
  "generator": {
    "problemId": "problem_id",
    "type": "ARRAY",
    "pattern": "RANDOM",
    "minValue": 1,
    "maxValue": 100,
    "sizes": [1000, 2000, 4000],
    "expectedComplexity": "NLOGN"
  }
}
```

### POST /admin/problem-test-generator
- Body:
```json
{
  "problemId": "problem_id",
  "type": "ARRAY",
  "pattern": "RANDOM",
  "minValue": 1,
  "maxValue": 100,
  "sizes": [1000, 2000, 4000],
  "expectedComplexity": "NLOGN"
}
```
- Response 200:
```json
{
  "generator": {
    "problemId": "problem_id"
  }
}
```

### POST /admin/upload-problems
- Body: array (max 2000) of:
```json
[
  {
    "title": "Two Sum",
    "description": "...",
    "difficulty": "EASY",
    "source": "LeetCode",
    "tags": ["Array", "HashMap"],
    "publicTests": [{ "input": "...", "output": "..." }],
    "hiddenTests": [{ "input": "...", "output": "..." }],
    "referenceSolution": {
      "languageId": 71,
      "code": "..."
    }
  }
]
```
- Response 201:
```json
{
  "success": true,
  "results": [
    {
      "title": "Two Sum",
      "result": "created",
      "number": 101
    }
  ]
}
```

### POST /admin/validate-complexity-cases
- Body:
```json
{
  "problemId": "problem_id",
  "casesData": {
    "expectedComplexity": "NLOGN",
    "cases": [
      { "input": "...", "output": "...", "size": "N" },
      { "input": "...", "output": "...", "size": "2N" },
      { "input": "...", "output": "...", "size": "4N" }
    ]
  }
}
```
- Success response 200:
```json
{
  "validation": "Successful",
  "expectedComplexity": "NLOGN",
  "yourComplexity": "NLOGN",
  "ratio": 2.01
}
```
- Failed-complexity response 422:
```json
{
  "validation": "Failed",
  "expectedComplexity": "N",
  "yourComplexity": "N2",
  "ratio": 3.8
}
```

### POST /admin/validate-problem
- Body: same schema as upload problems, typically validates first problem in the array.
- Response 200:
```json
{
  "responses": [
    {
      "stdout": "...",
      "time": "0.01",
      "memory": 1200,
      "stderr": null,
      "token": "judge0_token",
      "compile_output": null,
      "message": null,
      "status": {
        "id": 3,
        "description": "Accepted"
      }
    }
  ],
  "cases": [
    {
      "input": "...",
      "output": "..."
    }
  ]
}
```

### POST /admin/bulkSignup
- Body:
```json
{
  "emails": ["teacher1@example.com", "teacher2@example.com"],
  "role": "TEACHER"
}
```
- Response status:
  - `201` if all created
  - `207` if partial success
  - `400` if all failed
- Response body:
```json
{
  "success": false,
  "results": [
    {
      "email": "teacher1@example.com",
      "result": "created"
    },
    {
      "email": "teacher2@example.com",
      "result": "error",
      "message": "User already exists"
    }
  ]
}
```

## 12. Internal APIs (`/internal`)

### POST /internal/exams/finalize
- Auth: Cron secret header only
- Required header:
  - `x-cron-secret: <CRON_SECRET>`
- Request body: none
- Response 200 when work exists:
```json
{
  "message": "Finalized 3 exam(s)",
  "finalizedExamIds": ["exam_id_1", "exam_id_2", "exam_id_3"]
}
```
- Response 200 when no work:
```json
{
  "message": "No exams to finalize"
}
```
- Response 401:
```json
{
  "error": "Unauthorized"
}
```

## 13. Important Behavioral Notes

- Many list endpoints support `take` and `skip` pagination.
- Some query names are case/style-sensitive in current implementation (example: `searchvalue` for `/teacher/exam/fetchallexams`).
- Practice run-code (`/problems/runcode`) executes synchronously through Piston and requires `PISTON_URI`.
- Exam code submission and practice submit-code paths integrate Judge0 and may fail if `JUDGE0_DOMAIN` or `JUDGE0_API_KEY` are missing.
- Exam routes can enforce Safe Exam Browser when `sebEnabled = true` via `x-safeexambrowser-configkeyhash`.
- AI endpoints depend on group AI settings, exam state, and an async worker pipeline (AWS SQS queue + worker).

---

## 14. Lab Management APIs

### Overview

Lab Management introduces a modular lab structure with assessments tied to the existing Exam system. Labs are created by teachers, assigned to groups, and contain weekly modules with problems. Modules can have an assessment exam linked or created inline.

### Permission Constants

| Permission | Key |
|---|---|
| `LAB_VIEW` | `lab:view` |
| `LAB_EDIT` | `lab:edit` |
| `LAB_CREATE` | `lab:create` |
| `LAB_DELETE` | `lab:delete` |
| `LAB_ASSIGN` | `lab:assign` |

**Note:** Assessment endpoints reuse existing `EXAM_CREATE`, `EXAM_EDIT`, and `ANALYTICS_VIEW` permissions.

### Teacher Lab Routes (`/api/teacher`)

All endpoints require `isTeacher` middleware + `requirePermission`.

#### 14.1 Create Lab

```http
POST /api/teacher/labs
Permission: lab:create
```

Request:
```json
{
  "title": "Data Structures Lab",
  "description": "Weekly DSA practice sessions"
}
```

Response `201`:
```json
{
  "id": "uuid",
  "title": "Data Structures Lab",
  "description": "Weekly DSA practice sessions",
  "creatorId": "user-uuid",
  "createdAt": "2026-06-12T00:00:00.000Z",
  "updatedAt": "2026-06-12T00:00:00.000Z"
}
```

---

#### 14.2 List Labs

```http
GET /api/teacher/labs?take=10&skip=0
Permission: lab:view
```

Returns only labs created by the authenticated teacher.

Response `200`:
```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Data Structures Lab",
      "description": "...",
      "creatorId": "user-uuid",
      "createdAt": "...",
      "updatedAt": "...",
      "modulesCount": 5
    }
  ],
  "pagination": {
    "take": 10,
    "skip": 0,
    "total": 1,
    "pages": 1
  }
}
```

---

#### 14.3 Get Lab

```http
GET /api/teacher/labs/:labId
Permission: lab:view
```

Response `200`:
```json
{
  "id": "uuid",
  "title": "Data Structures Lab",
  "description": "...",
  "creatorId": "user-uuid",
  "createdAt": "...",
  "updatedAt": "...",
  "modulesCount": 5
}
```

`404` if not found or not owned by teacher.

---

#### 14.4 Update Lab

```http
PATCH /api/teacher/labs/:labId
Permission: lab:edit
```

Request (all fields optional):
```json
{
  "title": "Updated Title",
  "description": "Updated description"
}
```

Response `200`:
```json
{
  "id": "uuid",
  "title": "Updated Title",
  "description": "Updated description",
  "creatorId": "user-uuid",
  "createdAt": "...",
  "updatedAt": "..."
}
```

---

#### 14.5 Delete Lab

```http
DELETE /api/teacher/labs/:labId
Permission: lab:delete
```

Hard deletes the lab and cascades to modules, assignments, and progress records.

Response `200`:
```json
{
  "success": true,
  "message": "Lab deleted"
}
```

---

#### 14.6 Assign Lab to Groups

```http
POST /api/teacher/labs/:labId/assign
Permission: lab:assign
```

Request:
```json
{
  "groupIds": ["group-uuid-1", "group-uuid-2"]
}
```

Skips duplicates silently.

Response `200`:
```json
{
  "labId": "uuid",
  "assignedGroups": [
    { "groupId": "group-uuid-1", "groupName": "CSE-A" },
    { "groupId": "group-uuid-2", "groupName": "CSE-B" }
  ],
  "totalAssigned": 2
}
```

Groups not found → `400`.

---

#### 14.7 Create Module

```http
POST /api/teacher/labs/:labId/modules
Permission: lab:edit
```

Request:
```json
{
  "title": "Week 1 - Arrays",
  "description": "Basic array problems",
  "weekNumber": 1,
  "orderIndex": 0,
  "unlockAt": "2026-06-15T00:00:00.000Z",
  "dueAt": "2026-06-22T00:00:00.000Z",
  "assessmentExamId": "optional-exam-uuid"
}
```

Validation:
- `weekNumber` must be unique within the lab (`409` on conflict)
- `unlockAt` must be before `dueAt` (if both provided)

Response `201`:
```json
{
  "id": "module-uuid",
  "title": "Week 1 - Arrays",
  "description": "Basic array problems",
  "labId": "lab-uuid",
  "weekNumber": 1,
  "orderIndex": 0,
  "unlockAt": "2026-06-15T00:00:00.000Z",
  "dueAt": "2026-06-22T00:00:00.000Z",
  "assessmentExamId": null,
  "createdAt": "...",
  "updatedAt": "..."
}
```

---

#### 14.8 List Modules

```http
GET /api/teacher/labs/:labId/modules
Permission: lab:view
```

Response `200`:
```json
[
  {
    "id": "module-uuid",
    "title": "Week 1 - Arrays",
    "labId": "lab-uuid",
    "weekNumber": 1,
    "orderIndex": 0,
    "unlockAt": "...",
    "dueAt": "...",
    "assessmentExamId": null,
    "createdAt": "...",
    "updatedAt": "...",
    "problemsCount": 3
  }
]
```

Ordered by `orderIndex` asc, then `weekNumber` asc.

---

#### 14.9 Get Module

```http
GET /api/teacher/modules/:moduleId
Permission: lab:view
```

Response `200`:
```json
{
  "id": "module-uuid",
  "title": "Week 1 - Arrays",
  "labId": "lab-uuid",
  "weekNumber": 1,
  "orderIndex": 0,
  "unlockAt": "...",
  "dueAt": "...",
  "assessmentExamId": null,
  "createdAt": "...",
  "updatedAt": "...",
  "problemsCount": 3
}
```

---

#### 14.10 Update Module

```http
PATCH /api/teacher/modules/:moduleId
Permission: lab:edit
```

Request (all fields optional):
```json
{
  "title": "Updated Week Title",
  "weekNumber": 2,
  "unlockAt": "2026-06-16T00:00:00.000Z",
  "dueAt": null
}
```

Changing `weekNumber` checks uniqueness within the lab.

Response `200`: updated module object.

---

#### 14.11 Delete Module

```http
DELETE /api/teacher/modules/:moduleId
Permission: lab:edit
```

Cascades to module problems and their progress records.

Response `200`:
```json
{
  "success": true,
  "message": "Module deleted"
}
```

---

#### 14.12 Add Problems to Module

```http
POST /api/teacher/modules/:moduleId/problems
Permission: lab:edit
```

Request:
```json
{
  "problemIds": ["problem-uuid-1", "problem-uuid-2"]
}
```

Skips duplicates. Validates all problems exist.

Response `200`:
```json
{
  "moduleId": "module-uuid",
  "addedCount": 2
}
```

---

#### 14.13 List Module Problems

```http
GET /api/teacher/modules/:moduleId/problems
Permission: lab:view
```

Response `200`:
```json
[
  {
    "id": "module-problem-uuid",
    "moduleId": "module-uuid",
    "problemId": "problem-uuid-1",
    "orderIndex": 0,
    "problem": {
      "id": "problem-uuid-1",
      "number": 101,
      "title": "Two Sum",
      "difficulty": "EASY"
    }
  }
]
```

Ordered by `orderIndex` asc.

---

#### 14.14 Remove Problem from Module

```http
DELETE /api/teacher/module-problems/:moduleProblemId
Permission: lab:edit
```

Response `200`:
```json
{
  "success": true,
  "message": "Problem removed from module"
}
```

---

### Assessment APIs

#### 14.15 Assign Existing Exam to Module

```http
POST /api/teacher/modules/:moduleId/assessment
Permission: lab:edit
```

Request:
```json
{
  "examId": "exam-uuid"
}
```

Validates:
- Module exists and teacher owns the lab
- Exam exists and teacher owns the exam

Response `200`:
```json
{
  "moduleId": "module-uuid",
  "assessmentExamId": "exam-uuid"
}
```

---

#### 14.16 Update Assessment

```http
PATCH /api/teacher/modules/:moduleId/assessment
Permission: lab:edit
```

Request:
```json
{
  "examId": "new-exam-uuid"
}
```

Replaces the existing assessment exam ID. Same validation as assign.

Response `200`:
```json
{
  "moduleId": "module-uuid",
  "assessmentExamId": "new-exam-uuid"
}
```

`400` if no assessment is currently set.

---

#### 14.17 Remove Assessment

```http
DELETE /api/teacher/modules/:moduleId/assessment
Permission: lab:edit
```

Sets `assessmentExamId` to `null`. Does **not** delete the Exam.

Response `200`:
```json
{
  "success": true,
  "message": "Assessment removed from module"
}
```

---

#### 14.18 Get Assessment

```http
GET /api/teacher/modules/:moduleId/assessment
Permission: lab:view
```

Response `200`:
```json
{
  "examId": "exam-uuid",
  "title": "Week 1 Assessment",
  "startTime": "2026-06-15T00:00:00.000Z",
  "endTime": "2026-06-22T00:00:00.000Z",
  "durationMinutes": 60,
  "status": "UPCOMING"
}
```

`status` is computed from dates:
| Condition | Status |
|---|---|
| `now < startTime` | `UPCOMING` |
| `now > endTime` | `COMPLETED` |
| otherwise | `ACTIVE` |

---

#### 14.19 Create Assessment (One-Click)

```http
POST /api/teacher/modules/:moduleId/create-assessment
Permission: lab:edit
```

Creates a new Exam, links it to all groups the lab is assigned to, and sets `assessmentExamId` on the module — all in one transaction.

Request:
```json
{
  "title": "Week 1 - Arrays Assessment",
  "durationMin": 45
}
```

Both fields optional. Defaults:
- `title`: `"{module.title} - Assessment"`
- `durationMin`: `60`
- `startDate`: `module.unlockAt` or `now`
- `endDate`: `module.dueAt` or `now + 7 days`

Response `201`:
```json
{
  "moduleId": "module-uuid",
  "assessmentExamId": "new-exam-uuid",
  "exam": {
    "id": "new-exam-uuid",
    "title": "Week 1 - Arrays Assessment",
    "description": "Assessment for Week 1 - Arrays",
    "isPublished": false,
    "creatorId": "user-uuid",
    "startDate": "...",
    "endDate": "...",
    "durationMin": 45,
    "sebEnabled": false,
    "status": "scheduled"
  }
}
```

The exam is created as **unpublished draft** so the teacher can add problems and configure before publishing.

---

### Analytics APIs

#### 14.20 Assessment Results

```http
GET /api/teacher/modules/:moduleId/assessment-results
Permission: analytics:view
```

Reuses existing `ExamAttempt` infrastructure.

Response `200`:
```json
{
  "totalStudents": 120,
  "attemptedStudents": 100,
  "averageScore": 72.5,
  "highestScore": 100,
  "lowestScore": 12
}
```

`404` if no assessment is linked.

---

#### 14.21 Student Progress

```http
GET /api/teacher/modules/:moduleId/student-progress
Permission: analytics:view
```

Per-student progress across all module problems.

Response `200`:
```json
[
  {
    "studentId": "user-uuid",
    "studentName": "John Doe",
    "solvedProblems": 5,
    "totalProblems": 10,
    "completionPercentage": 50
  }
]
```

---

#### 14.22 Problem Analytics

```http
GET /api/teacher/modules/:moduleId/problem-analytics
Permission: analytics:view
```

Per-problem analytics across all students.

Response `200`:
```json
[
  {
    "problemId": "problem-uuid",
    "problemNumber": 101,
    "problemTitle": "Two Sum",
    "attemptedStudents": 50,
    "solvedStudents": 35,
    "solveRate": 70,
    "averageAttempts": 2.4
  }
]
```

---

### Student Lab Routes (`/api/student`)

All endpoints require `isStudent` middleware.

#### 14.23 Get My Labs

```http
GET /api/student/my-labs
```

Returns only labs assigned to the student's groups. Locked modules (where `unlockAt > now`) are excluded.

Response `200`:
```json
[
  {
    "id": "lab-uuid",
    "title": "Data Structures Lab",
    "description": "...",
    "modulesCount": 3,
    "modules": [
      {
        "id": "module-uuid",
        "title": "Week 1 - Arrays",
        "weekNumber": 1,
        "orderIndex": 0,
        "unlockAt": "2026-06-15T00:00:00.000Z",
        "dueAt": "2026-06-22T00:00:00.000Z",
        "problemsCount": 3,
        "completedProblems": 2,
        "totalProblems": 3,
        "completionPercentage": 67,
        "moduleStatus": "IN_PROGRESS",
        "progress": [
          {
            "moduleProblemId": "mp-uuid",
            "attemptCount": 3,
            "isSolved": true,
            "lastAttemptAt": "2026-06-16T10:00:00.000Z"
          }
        ],
        "assessment": {
          "examId": "exam-uuid",
          "title": "Week 1 Assessment",
          "startTime": "...",
          "status": "UPCOMING"
        }
      }
    ]
  }
]
```

`moduleStatus` values:
| Condition | Status |
|---|---|
| `unlockAt > now` | `LOCKED` |
| All problems solved + assessment attempted (if exists) | `COMPLETED` |
| Some progress | `IN_PROGRESS` |
| No progress | `NOT_STARTED` |

---

#### 14.24 Get My Lab

```http
GET /api/student/my-labs/:labId
```

Same structure as `getMyLabs` but for a single lab. `404` if not assigned to student.

---

#### 14.25 Get Module Problems (Student)

```http
GET /api/student/modules/:moduleId/problems
```

Includes problem data and student's progress for each problem. `403` if module is locked.

Response `200`:
```json
{
  "module": {
    "id": "module-uuid",
    "title": "Week 1 - Arrays",
    "weekNumber": 1,
    "unlockAt": "...",
    "dueAt": "...",
    "assessmentExamId": "exam-uuid"
  },
  "completedProblems": 2,
  "totalProblems": 3,
  "completionPercentage": 67,
  "assessment": {
    "examId": "exam-uuid",
    "title": "Week 1 Assessment",
    "startTime": "...",
    "status": "UPCOMING"
  },
  "problems": [
    {
      "id": "mp-uuid",
      "moduleId": "module-uuid",
      "problemId": "problem-uuid",
      "orderIndex": 0,
      "problem": {
        "id": "problem-uuid",
        "number": 101,
        "title": "Two Sum",
        "difficulty": "EASY"
      },
      "progress": {
        "attemptCount": 3,
        "isSolved": true,
        "lastAttemptAt": "..."
      }
    }
  ]
}
```

---

#### 14.26 Get Module Progress

```http
GET /api/student/modules/:moduleId/progress
```

Response `200`:
```json
{
  "problems": [
    {
      "moduleProblemId": "mp-uuid",
      "attemptCount": 3,
      "isSolved": true,
      "lastAttemptAt": "2026-06-16T10:00:00.000Z"
    }
  ]
}
```

---

#### 14.27 Get Module Assessment (Student)

```http
GET /api/student/modules/:moduleId/assessment
```

Response `200`:
```json
{
  "examId": "exam-uuid",
  "title": "Week 1 Assessment",
  "startTime": "2026-06-15T00:00:00.000Z",
  "endTime": "2026-06-22T00:00:00.000Z",
  "durationMinutes": 60,
  "status": "UPCOMING"
}
```

---

### Submission Integration

When a **practice** (`selfSubmission`) or **exam** (`Submission`) reaches a terminal status via the polling endpoints:

- `GET /api/problems/submission-status/:submissionId`
- `GET /api/student/exam/submission-status/:submissionId`

The system automatically checks if the problem belongs to a `ModuleProblem`. If it does, `ModuleProblemProgress` is upserted idempotently:

| Behaviour | Detail |
|---|---|
| **attemptCount** | Incremented by 1 (first attempt = 1) |
| **latestSubmissionId** | Set to current submission ID |
| **lastAttemptAt** | Updated to now |
| **isSolved** | Set to `true` only if status is `ACCEPTED` and not already solved |
| **solvedAt** | Set on first solve |
| **bestSubmissionId** | Set on first solve |

The update is **idempotent**: if `latestSubmissionId` already matches, the upsert is skipped. Uses `prisma.$transaction` for atomicity.

---

## 15. Source of Truth

This document was generated from the route and controller implementation in:

- `src/app.ts`
- `src/routes/*.ts`
- `src/controllers/*.ts`
- `src/services/codeRunner.service.ts`
- `src/services/problemSubmission.service.ts`
- `src/services/codeSubmission.service.ts`
- `src/services/lab.service.ts`
- `src/controllers/lab.teacher.controllers.ts`
- `src/controllers/lab.student.controllers.ts`
- `src/routes/lab.teacher.route.ts`
- `src/routes/lab.student.route.ts`
- `src/validations/lab.schema.ts`
- `src/types/lab.types.ts`
