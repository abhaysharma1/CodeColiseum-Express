# Authorization Bug Analysis — CodeColiseum

## The Bug

Any teacher can access, edit, and delete **any exam or group** in the system, even ones they did not create and are not associated with. A teacher simply needs to navigate to a URL like:

```
/dashboard/teacher/tests/edit/[another-teachers-exam-id]
```

Or call any backend API with another teacher's `examId` or `groupId` parameter, and the system grants access.

---

## Root Cause Analysis

### 1. Seed Data: Global Teacher Role Has All Permissions

In both `prisma/seed.ts` and `seeds/role-permissions.ts`, the `role_org_teacher` global role is assigned **every permission in the system**:

```typescript
const teacherPermissionIds = [
    PERMISSIONS.GROUP_VIEW,       // "group:view"
    PERMISSIONS.GROUP_EDIT,       // "group:edit"
    PERMISSIONS.GROUP_DELETE,     // "group:delete"
    PERMISSIONS.EXAM_CREATE,      // "exam:create"
    PERMISSIONS.EXAM_EDIT,        // "exam:edit"
    PERMISSIONS.EXAM_PUBLISH,     // "exam:publish"
    PERMISSIONS.SUBMISSION_VIEW,  // "submission:view"
    PERMISSIONS.SUBMISSION_GRADE, // "submission:grade"
    PERMISSIONS.ANALYTICS_VIEW    // "analytics:view"
];

// Assigned to role_org_teacher (scope: "ORGANIZATION" — acts as a global role)
...teacherPermissionIds.map(pid => ({ roleId: "role_org_teacher", permissionId: pid }))
```

Additionally, `GROUP_COTEACHER` gets the **identical set** of permissions as `GROUP_OWNER`, which means co-teachers can also delete exams, groups, and remove students — which is unintended.

### 2. `hasPermission()` Checks Global Permissions First (and short-circuits)

In `permission.service.ts`:

```typescript
export async function hasPermission(userId, permission, groupId?) {
    const permissionKeys = getPermissionLookupKeys(permission);

    // ← THIS CHECK RUNS FIRST
    const hasGlobalAccess = await hasGlobalPermission(userId, permissionKeys);
    if (hasGlobalAccess) {
        return true;  // Returns true for EVERY teacher, EVERY exam, EVERY group
    }

    // Group-level check is NEVER reached for ordinary teachers
    if (groupId) {
        const hasGroupAccess = await hasGroupPermission(userId, groupId, permissionKeys);
        if (hasGroupAccess) return true;
    }

    return false;
}
```

Since `role_org_teacher` has `exam:edit`, `group:view`, `analytics:view`, etc., **every teacher** passes `hasGlobalPermission` for every resource — the group-level check (`hasGroupPermission`) and the `creatorId` fallback in controllers are never reached.

### 3. Controller Helpers Rely on `hasPermission()` Instead of Doing Scoped Checks

The three helper functions in `teacher.controllers.ts`:

```typescript
async function canAccessExamWithFallback(userId, examId, creatorId, permission) {
    const groupId = await getExamGroupId(examId);
    const allowed = await hasPermission(userId, permission, groupId);  // ← Uses hasPermission()
    return allowed || creatorId === userId;
}

async function canAccessGroupWithFallback(userId, groupId, creatorId, permission) {
    const allowed = await hasPermission(userId, permission, groupId);  // ← Uses hasPermission()
    return allowed || creatorId === userId;
}

async function canViewGroupAnalytics(userId, groupId, creatorId) {
    const allowed = await hasPermission(userId, PERMISSIONS.ANALYTICS_VIEW, groupId);  // ← Uses hasPermission()
    return allowed || creatorId === userId;
}
```

Because `hasPermission()` returns `true` for every teacher globally, these helpers always return `true` — the `creatorId === userId` fallback is never exercised.

### 4. Route Middleware Has No Group-Id Resolver for Exam Routes

The route-level `requirePermission` middleware also calls `hasPermission()` without a `groupId`:

```typescript
// exam.teacher.route.ts
router.get("/getexam", requirePermission(PERMISSIONS.EXAM_EDIT), getExam);
//                                    ^ no groupId resolver provided
```

This means the middleware only checks global permissions. If global permissions were removed, **all teachers would be blocked** at the middleware level before reaching the controller.

---

## Data Flow of the Bug

```
Teacher B navigates to /dashboard/teacher/tests/edit/Exam-A-examId

  ↓ Frontend calls GET /teacher/exam/getexam?examId=Exam-A-examId

  ↓ Route middleware: requirePermission(EXAM_EDIT)
    → hasPermission(TeacherB, "exam:edit")
    → hasGlobalPermission → role_org_teacher HAS "exam:edit" → TRUE
    → ✅ PASSES

  ↓ Controller: getExam()
    → canAccessExamWithFallback(TeacherB, Exam-A, TeacherA, "exam:edit")
    → hasPermission(TeacherB, "exam:edit", groupOfExamA)
    → hasGlobalPermission → role_org_teacher HAS "exam:edit" → TRUE
    → returns TRUE
    → ✅ Teacher B views/edits Teacher A's exam

  ↓ Same pattern for:
    - GET /teacher/exam/getallexamgroups … ✅
    - GET /teacher/exam/getallexamproblem … ✅
    - POST /teacher/exam/savedraft … ✅
    - POST /teacher/exam/delete-bulk … ✅
    - POST /teacher/exam/publishexam … ✅
```

---

## What the System Should Do

| User Type | Can view own exams | Can view others' exams | Can delete own exams | Can delete others' exams | Can add students to group | Can remove students |
|-----------|-------------------|----------------------|---------------------|------------------------|--------------------------|-------------------|
| **Exam creator** (Teacher A) | ✅ | N/A | ✅ | N/A | ✅ (own groups) | ✅ (own groups) |
| **Group owner** | ✅ | ✅ (group's exams) | ✅ | ✅ (group's exams) | ✅ | ✅ |
| **Co-teacher** | ✅ | ✅ (group's exams) | ❌ | ❌ | ✅ | ❌ |
| **Unaffiliated teacher** | ✅ (own) | ❌ | ✅ (own) | ❌ | ❌ | ❌ |

---

## Changes Required

### Change 1: Fix Controller Helpers — Use Group-Scoped Permissions Only

**Files:** `src/controllers/teacher.controllers.ts`

The three helper functions should skip `hasPermission()` (which checks global permissions) and instead:
1. Check `creatorId === userId` (owner always has access)
2. Check if user is `PLATFORM_ADMIN` (super-admin override)
3. Check **group-scoped permissions only** using `hasGroupPermission()` directly

Replace the existing helpers at the top of the file:

```typescript
async function canAccessExamWithFallback(
    userId: string,
    examId: string,
    creatorId: string,
    permission: string,
): Promise<boolean> {
    // Owner always has access
    if (creatorId === userId) return true;

    // Platform admin can access everything
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { globalRoleId: true },
    });
    if (user?.globalRoleId === GLOBAL_ROLE_IDS.PLATFORM_ADMIN) return true;

    // For non-owners: check group-scoped permission ONLY
    const groupId = await getExamGroupId(examId);
    if (!groupId) return false;

    const permissionKeys = getPermissionLookupKeys(permission);
    return hasGroupPermission(userId, groupId, permissionKeys);
}

async function canAccessGroupWithFallback(
    userId: string,
    groupId: string,
    creatorId: string,
    permission: string,
): Promise<boolean> {
    if (creatorId === userId) return true;

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { globalRoleId: true },
    });
    if (user?.globalRoleId === GLOBAL_ROLE_IDS.PLATFORM_ADMIN) return true;

    const permissionKeys = getPermissionLookupKeys(permission);
    return hasGroupPermission(userId, groupId, permissionKeys);
}

async function canViewGroupAnalytics(
    userId: string,
    groupId: string,
    creatorId: string,
): Promise<boolean> {
    if (creatorId === userId) return true;

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { globalRoleId: true },
    });
    if (user?.globalRoleId === GLOBAL_ROLE_IDS.PLATFORM_ADMIN) return true;

    const permissionKeys = getPermissionLookupKeys(PERMISSIONS.ANALYTICS_VIEW);
    return hasGroupPermission(userId, groupId, permissionKeys);
}
```

> **Note:** `getPermissionLookupKeys` is already exported from `permission.service.ts` and is available for import. If it is not exported, add `export` before the function definition in that file.

### Change 2: Fix Seed — Split GROUP_COTEACHER Permissions

**Files:** `prisma/seed.ts`, `seeds/role-permissions.ts`

Replace the current `teacherPermissionIds` with two separate sets — one for owners, one for co-teachers:

```typescript
const teacherPermissionIds = [
    PERMISSIONS.GROUP_VIEW,
    PERMISSIONS.GROUP_EDIT,
    PERMISSIONS.GROUP_DELETE,
    PERMISSIONS.EXAM_CREATE,
    PERMISSIONS.EXAM_EDIT,
    PERMISSIONS.EXAM_PUBLISH,
    PERMISSIONS.SUBMISSION_VIEW,
    PERMISSIONS.SUBMISSION_GRADE,
    PERMISSIONS.ANALYTICS_VIEW,
];

const coTeacherPermissionIds = [
    PERMISSIONS.GROUP_VIEW,       // Can view group and members
    PERMISSIONS.GROUP_EDIT,       // Can add students (not delete)
    PERMISSIONS.EXAM_CREATE,      // Can create exams for this group
    PERMISSIONS.SUBMISSION_VIEW,  // Can view submissions
    PERMISSIONS.ANALYTICS_VIEW,   // Can view analytics
    // NOT: GROUP_DELETE — cannot delete group
    // NOT: EXAM_EDIT — cannot edit/delete existing exams
    // NOT: EXAM_PUBLISH — cannot publish exams
    // NOT: SUBMISSION_GRADE — cannot trigger AI evaluations
];
```

Then update the role assignments section:

```typescript
const rolePermissions = [
    // PLATFORM_ADMIN gets everything
    ...allPermissionIds.map(pid => ({
        roleId: ROLE_IDS.PLATFORM_ADMIN,
        permissionId: pid,
    })),

    // ORG_TEACHER (global role) — same set as before (coarse gate for routes)
    ...teacherPermissionIds.map(pid => ({
        roleId: ROLE_IDS.ORG_TEACHER,
        permissionId: pid,
    })),

    // GROUP_OWNER gets full permissions (scoped to group)
    ...teacherPermissionIds.map(pid => ({
        roleId: ROLE_IDS.GROUP_OWNER,
        permissionId: pid,
    })),

    // GROUP_COTEACHER gets restricted permissions (scoped to group)
    ...coTeacherPermissionIds.map(pid => ({
        roleId: ROLE_IDS.GROUP_COTEACHER,
        permissionId: pid,
    })),

    // ORG_STUDENT and GROUP_MEMBER stay the same
    ...studentPermissionIds.map(pid => ({
        roleId: ROLE_IDS.ORG_STUDENT,
        permissionId: pid,
    })),
    ...studentPermissionIds.map(pid => ({
        roleId: ROLE_IDS.GROUP_MEMBER,
        permissionId: pid,
    })),
];
```

### Change 3: Add Explicit Owner-Only Guards for Destructive Operations

**Files:** `src/controllers/teacher.controllers.ts`

For endpoints like `deleteBulkExams` and `archiveBulkExams`, add an explicit role check **after** the existing `canAccessExamWithFallback` check.

#### `deleteBulkExams` (around line 227):

After the `canAccessExamWithFallback` check loop, add:

```typescript
for (const exam of exams) {
    const hasAccess = await canAccessExamWithFallback(
        user.id,
        exam.id,
        exam.creatorId,
        PERMISSIONS.EXAM_EDIT,
    );
    if (!hasAccess) {
        return res
            .status(403)
            .json({ error: `Access denied for exam ${exam.id}` });
    }

    // Extra guard: only the exam creator or GROUP_OWNER can DELETE
    if (exam.creatorId !== user.id) {
        const groupId = await getExamGroupId(exam.id);
        if (groupId) {
            const membership = await prisma.groupMember.findUnique({
                where: {
                    groupId_userId: { groupId, userId: user.id },
                },
                select: { roleId: true },
            });
            if (membership?.roleId !== GROUP_ROLE_IDS.OWNER) {
                return res.status(403).json({
                    error:
                        "Only the exam creator or group owner can delete exams",
                });
            }
        } else {
            return res.status(403).json({
                error: "Only the exam creator can delete this exam",
            });
        }
    }
}
```

#### `archiveBulkExams` (around line 254):

Apply the same pattern — after the `canAccessExamWithFallback` check loop, add the same extra guard.

### Change 4: Route Middleware — Leave As-Is

**Files:** `src/routes/exam.teacher.route.ts`, `src/routes/teacher.route.ts`

The route-level `requirePermission` middleware should be left unchanged. The global `role_org_teacher` permissions act as a **coarse gate** — they confirm "this user is a teacher with some capabilities." The real authorization happens in the controllers via the fixed helper functions.

---

## How the Fix Works (Trace)

### Scenario: Co-teacher tries to delete an exam

```
Step 1 — Route middleware: requirePermission(EXAM_EDIT)
  → hasPermission(CoTeacher, "exam:edit")
  → hasGlobalPermission → role_org_teacher HAS "exam:edit" → TRUE
  → ✅ Middleware passes

Step 2 — Controller: canAccessExamWithFallback(CoTeacher, exam, TeacherA, "exam:edit")
  → creatorId (TeacherA) === userId (CoTeacher)? → FALSE
  → Is CoTeacher a PLATFORM_ADMIN? → FALSE
  → getExamGroupId(exam) → groupX
  → hasGroupPermission(CoTeacher, groupX, ["exam:edit"])
    → CoTeacher's role in groupX is GROUP_COTEACHER
    → GROUP_COTEACHER does NOT have EXAM_EDIT (from Change 2) → FALSE
  → returns FALSE → ❌ canAccessExamWithFallback fails

Step 3 — Controller responds with 403
```

### Scenario: Co-teacher tries to view a group's analytics

```
Step 1 — Route middleware: requirePermission(ANALYTICS_VIEW)
  → hasPermission(CoTeacher, "analytics:view")
  → hasGlobalPermission → role_org_teacher HAS "analytics:view" → TRUE
  → ✅ Middleware passes

Step 2 — Controller: canViewGroupAnalytics(CoTeacher, groupX, TeacherA)
  → creatorId (TeacherA) === userId (CoTeacher)? → FALSE
  → Is CoTeacher a PLATFORM_ADMIN? → FALSE
  → hasGroupPermission(CoTeacher, groupX, ["analytics:view"])
    → GROUP_COTEACHER HAS "analytics:view" (from Change 2) → TRUE
  → returns TRUE → ✅ Access granted
```

### Scenario: Unaiffiliated teacher tries to view any group

```
Step 1 — Route middleware: requirePermission(GROUP_VIEW)
  → hasPermission(StrangerTeacher, "group:view")
  → hasGlobalPermission → role_org_teacher HAS "group:view" → TRUE
  → ✅ Middleware passes

Step 2 — Controller: canAccessGroupWithFallback(StrangerTeacher, groupX, TeacherA, "group:view")
  → creatorId (TeacherA) === userId (StrangerTeacher)? → FALSE
  → Is StrangerTeacher a PLATFORM_ADMIN? → FALSE
  → hasGroupPermission(StrangerTeacher, groupX, ["group:view"])
    → StrangerTeacher is NOT a member of groupX → FALSE
  → returns FALSE → ❌ Access denied
```

---

## Fix Verification Checklist

After implementing the changes, verify the following scenarios:

| # | Scenario | Expected Result |
|---|----------|----------------|
| 1 | Teacher A views their own exam list | ✅ Sees only their exams |
| 2 | Teacher A edits their own exam | ✅ Allowed |
| 3 | Teacher A deletes their own exam | ✅ Allowed |
| 4 | Teacher B (unaffiliated) views Teacher A's exam | ❌ 403 Forbidden |
| 5 | Teacher B deletes Teacher A's exam | ❌ 403 Forbidden |
| 6 | Group owner views group details | ✅ Allowed |
| 7 | Co-teacher views group details | ✅ Allowed |
| 8 | Co-teacher adds a student to the group | ✅ Allowed |
| 9 | Co-teacher removes a student from the group | ❌ Only owner can remove |
| 10 | Co-teacher deletes a group exam | ❌ Only owner can delete |
| 11 | Co-teacher archives a group exam | ❌ Only owner can archive |
| 12 | Co-teacher edits a group exam | ❌ No EXAM_EDIT at group level |
| 13 | Platform admin accesses any resource | ✅ Allowed (super-admin override) |

---

## Files Changed Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/controllers/teacher.controllers.ts` | **Modify** | Fix `canAccessExamWithFallback`, `canAccessGroupWithFallback`, `canViewGroupAnalytics` to skip global permissions and use `hasGroupPermission()` directly; add owner-only guard to `deleteBulkExams` and `archiveBulkExams` |
| `prisma/seed.ts` | **Modify** | Add `coTeacherPermissionIds` with restricted permission set; update role assignments to use separate sets for `GROUP_OWNER` vs `GROUP_COTEACHER` |
| `seeds/role-permissions.ts` | **Modify** | Same split as `prisma/seed.ts` (both files are identical and must be kept in sync) |
| `src/routes/exam.teacher.route.ts` | **No change** | Route middleware stays as coarse gate |
| `src/routes/teacher.route.ts` | **No change** | Route middleware stays as coarse gate |
| `src/permissions/permission.service.ts` | **No change** | `hasPermission()` behavior remains the same — the controller helpers now bypass it |

---

## Why Not Remove Global Permissions Instead?

Removing permissions from `role_org_teacher` (the global role) would **break the route middleware** for every teacher endpoint. The `requirePermission` middleware calls `hasPermission()` without a `groupId` resolver for exam routes, so it can only check global permissions. Without global permissions, **every teacher would get a 403 before reaching any controller**.

The correct approach is to keep the seed data (global role + all permissions) to satisfy the route middleware, but fix the controller helpers to do the real scoping by:
1. Checking creator ownership first (`creatorId === userId`)
2. Falling through to **group-scoped permissions only** (bypassing global permissions)

This way the middleware acts as a coarse "is this user a teacher with any permission?" gate, and the controllers do the fine-grained "does this user own this resource?" authorization.
