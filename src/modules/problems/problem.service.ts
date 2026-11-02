import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors";
import { GLOBAL_ROLE_IDS } from "@/permissions/role.constants";
import {
  resolveLanguageFromInput,
  resolveLanguageId,
} from "@/utils/languageCatalog";
import { canAccessModuleProblem } from "@/modules/labs/lab.service";
import {
  normalizeProblemTestCases,
} from "@/shared/utils/problem-test-cases";
import { verifySEB } from "@/utils/exam.utils";
import type { SebRequestContext } from "@/utils/exam.utils";
import {
  getPracticeSubmissionStatusService,
  submitCodeService,
} from "@/services/problemSubmission.service";
import { runCodeService } from "@/services/codeRunner.service";
import * as problemRepository from "./problem.repository";
import type {
  ListProblemsQuery,
  RunCodeBody,
  SubmissionsBody,
  TemplateCodeBody,
} from "./problem.schema";

const MODULE_ACCESS_MESSAGES: Record<string, string> = {
  LOCKED: "Problem is currently locked",
  NOT_YET_AVAILABLE: "Problem is not yet available",
  EXPIRED: "Problem access window has expired",
};

export interface PracticeViewer {
  id?: string;
  globalRoleId?: string | null;
}

function resolveViewerRole(viewer: PracticeViewer): problemRepository.PracticeViewerRole {
  if (viewer.globalRoleId === GLOBAL_ROLE_IDS.PLATFORM_ADMIN) {
    return "ADMIN";
  }

  if (viewer.globalRoleId === GLOBAL_ROLE_IDS.ORG_TEACHER) {
    return "TEACHER";
  }

  if (viewer.globalRoleId === GLOBAL_ROLE_IDS.ORG_STUDENT) {
    return "STUDENT";
  }

  return "ANONYMOUS";
}

export async function listPracticeProblems(
  viewer: PracticeViewer,
  query: ListProblemsQuery,
) {
  return problemRepository.findProblemsForViewer({
    viewerRole: resolveViewerRole(viewer),
    viewerId: viewer.id,
    filters: {
      searchValue: query.searchValue,
      tags: query.tags,
      difficulty: query.difficulty,
    },
    pagination: { take: query.take, skip: query.skip },
  });
}

export async function getProblemTags() {
  return problemRepository.findAllTags();
}

export async function getProblemTestCases(problemId: string) {
  const testCases = await problemRepository.findRunTestCases(problemId);

  if (!testCases) {
    throw new NotFoundError("Test cases not found");
  }

  return {
    ...testCases,
    cases: normalizeProblemTestCases(testCases.cases),
  };
}

export async function getProblemDetails(problemId: string) {
  const problem = await problemRepository.findProblemDetails(problemId);

  if (!problem) {
    throw new NotFoundError("Problem not found");
  }

  return problem;
}

export async function getProblemSubmissions(
  userId: string,
  body: SubmissionsBody,
) {
  const exists = await problemRepository.problemExists(body.problemId);

  if (!exists) {
    throw new NotFoundError("Problem not found");
  }

  const { submissions, total } =
    await problemRepository.findSubmissionPage({
      problemId: body.problemId,
      userId,
      skip: body.skip,
      take: body.take,
    });

  return {
    submissions,
    total,
    skip: body.skip,
    take: body.take,
  };
}

export async function getTemplateCode(body: TemplateCodeBody) {
  const resolvedLanguage = resolveLanguageFromInput({
    language: body.language,
    languageId: body.languageId,
  });

  if (!resolvedLanguage) {
    throw new ValidationError("Unsupported language");
  }

  return problemRepository.findDriverCodeTemplate(
    resolvedLanguage,
    body.problemId,
  );
}

async function assertModuleProblemAccess(moduleProblemId: string): Promise<void> {
  const moduleProblem =
    await problemRepository.findModuleProblemAccessInfo(moduleProblemId);

  if (!moduleProblem) {
    throw new NotFoundError("Module problem not found");
  }

  const access = canAccessModuleProblem({
    isUnlocked: moduleProblem.isUnlocked ?? false,
    availableFrom: moduleProblem.availableFrom ?? null,
    availableUntil: moduleProblem.availableUntil ?? null,
  });

  if (!access.allowed) {
    throw new ForbiddenError(
      MODULE_ACCESS_MESSAGES[access.reason ?? ""] ?? "Problem not accessible",
    );
  }
}

async function assertModuleProblemSeb(
  moduleProblemId: string,
  sebContext: SebRequestContext,
): Promise<void> {
  const moduleProblem =
    await problemRepository.findModuleProblemSebInfo(moduleProblemId);

  if (moduleProblem?.module?.lab?.sebEnabled) {
    verifySEB(sebContext);
  }
}

async function verifyModuleProblemGuards(
  moduleProblemId: string | undefined,
  sebContext: SebRequestContext,
): Promise<void> {
  if (!moduleProblemId) {
    return;
  }

  await assertModuleProblemAccess(moduleProblemId);
  await assertModuleProblemSeb(moduleProblemId, sebContext);
}

export async function runPracticeCode(params: {
  userId: string;
  body: RunCodeBody;
  sebContext: SebRequestContext;
}) {
  const languageId = resolveLanguageId({
    language: params.body.language,
    languageId: params.body.languageId,
  });

  if (!languageId) {
    throw new ValidationError("Unsupported language");
  }

  await verifyModuleProblemGuards(
    params.body.moduleProblemId,
    params.sebContext,
  );

  return runCodeService({
    userId: params.userId,
    questionId: params.body.questionId,
    languageId,
    code: params.body.code,
  });
}

export async function submitPracticeCode(params: {
  userId: string;
  body: RunCodeBody;
  sebContext: SebRequestContext;
}) {
  const languageId = resolveLanguageId({
    language: params.body.language,
    languageId: params.body.languageId,
  });

  if (!languageId) {
    throw new ValidationError("Unsupported language");
  }

  await verifyModuleProblemGuards(
    params.body.moduleProblemId,
    params.sebContext,
  );

  return submitCodeService({
    userId: params.userId,
    questionId: params.body.questionId,
    languageId,
    code: params.body.code,
    moduleProblemId: params.body.moduleProblemId,
  });
}

export async function getSubmissionStatus(params: {
  userId: string;
  submissionId: string;
  moduleProblemId?: string;
}) {
  return getPracticeSubmissionStatusService(params);
}
