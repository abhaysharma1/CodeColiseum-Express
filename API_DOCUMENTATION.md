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
      "stdout": "...",
      "stderr": null,
      "compile_output": null,
      "message": null,
      "time": "0.01",
      "memory": 1234,
      "token": "judge0_token",
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
- Exam code submission and practice submission both integrate Judge0 and may fail if `JUDGE0_DOMAIN` or `JUDGE0_API_KEY` are missing.
- Exam routes can enforce Safe Exam Browser when `sebEnabled = true` via `x-safeexambrowser-configkeyhash`.
- AI endpoints depend on group AI settings, exam state, and Cloud Tasks/SQS worker pipeline.

## 14. Source of Truth

This document was generated from the route and controller implementation in:

- `src/app.ts`
- `src/routes/*.ts`
- `src/controllers/*.ts`
- `src/services/codeRunner.service.ts`
- `src/services/problemSubmission.service.ts`
- `src/services/codeSubmission.service.ts`
