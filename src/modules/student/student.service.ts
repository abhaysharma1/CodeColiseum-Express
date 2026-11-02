import { ForbiddenError, NotFoundError } from "@/shared/errors";
import * as studentRepository from "./student.repository";
import type {
  GroupExamsQuery,
  StudentGroupsQuery,
} from "./student.schema";

export async function getDashboardData(userId: string) {
  const now = new Date();

  const [groups, exams, prevResults, problemsSolved, totalNoOfQuestions] =
    await Promise.all([
      studentRepository.findDashboardGroups(userId),
      studentRepository.findDashboardExams(userId, now),
      studentRepository.findPreviousResults(userId),
      studentRepository.findSolvedProblems(userId),
      studentRepository.countProblems(),
    ]);

  const upcomingExams = exams.filter((exam) => exam.startDate > now);
  const ongoingExams = exams.filter(
    (exam) => exam.endDate > now && exam.startDate < now,
  );

  const easyProblemSolved = problemsSolved.filter(
    (submission) => submission.problem.difficulty === "EASY",
  ).length;
  const mediumProblemSolved = problemsSolved.filter(
    (submission) => submission.problem.difficulty === "MEDIUM",
  ).length;
  const hardProblemSolved = problemsSolved.filter(
    (submission) => submission.problem.difficulty === "HARD",
  ).length;

  return {
    groups,
    exams: { upcomingExams, ongoingExams },
    prevResults,
    problemDetails: {
      totalSolvedProblems: problemsSolved.length,
      easyProblemSolved,
      mediumProblemSolved,
      hardProblemSolved,
      totalNoOfQuestions,
    },
  };
}

export async function getExamResult(userId: string, examId: string) {
  const examDetails = await studentRepository.findExamForResult(examId);

  if (!examDetails) {
    throw new NotFoundError("Exam not found");
  }

  const examAttempt = await studentRepository.findAttemptForStudent(
    examId,
    userId,
  );

  if (!examAttempt) {
    throw new NotFoundError("Exam attempt not found");
  }

  const finalSubmissions = await studentRepository.findFinalSubmissions(
    examAttempt.id,
  );

  // Keep the latest final submission per problem.
  const distinctSubmissionsMap = new Map<
    string,
    (typeof finalSubmissions)[number]
  >();

  finalSubmissions.forEach((submission) => {
    if (!distinctSubmissionsMap.has(submission.problemId)) {
      distinctSubmissionsMap.set(submission.problemId, submission);
    }
  });

  const submissionReports = Array.from(
    distinctSubmissionsMap.values(),
  ).map((submission) => ({
    problemId: submission.problemId,
    submissionId: submission.id,
    code: submission.sourceCode,
    language: submission.language,
    passedTestcases: submission.passedTestcases,
    totalTestcases: submission.totalTestcases,
    executionTime: submission.executionTime,
    memory: submission.memory,
    createdAt: submission.createdAt,
    isSuccessful:
      submission.passedTestcases === submission.totalTestcases,
    status: submission.status,
  }));

  const allAttempts = await studentRepository.findRankedAttempts(examId);

  const ranking = allAttempts.map((attempt, index) => ({
    rank: index + 1,
    studentId: attempt.studentId,
    studentName: attempt.student.name,
    studentEmail: attempt.student.email,
    totalScore: attempt.totalScore,
    submittedAt: attempt.submittedAt,
  }));

  const currentStudentRanking = ranking.find(
    (entry) => entry.studentId === userId,
  );

  return {
    examDetails: {
      id: examDetails.id,
      title: examDetails.title,
      examStatus: examDetails.status,
      description: examDetails.description,
      durationMin: examDetails.durationMin,
      startDate: examDetails.startDate,
      endDate: examDetails.endDate,
      creator: examDetails.creator,
      problems: examDetails.problems.map((examProblem) => ({
        order: examProblem.order,
        problem: examProblem.problem,
      })),
    },
    examAttempt: {
      id: examAttempt.id,
      status: examAttempt.status,
      startedAt: examAttempt.startedAt,
      expiresAt: examAttempt.expiresAt,
      submittedAt: examAttempt.submittedAt,
      totalScore: examAttempt.totalScore,
    },
    maxScore: 100,
    finalScore: examAttempt.totalScore,
    submissionReports,
    ranking: {
      currentStudent: currentStudentRanking,
      allRankings: ranking,
    },
  };
}

export async function getExamAIResult(userId: string, examId: string) {
  const exam = await studentRepository.findExam(examId);

  if (!exam) {
    throw new NotFoundError("Exam Not Found");
  }

  const aiEvaluations = await studentRepository.findAiEvaluations(
    exam.id,
    userId,
  );

  if (aiEvaluations.length === 0) {
    throw new NotFoundError("Couldn't Find AI Submission");
  }

  return aiEvaluations;
}

export async function listGroups(
  userId: string,
  query: StudentGroupsQuery,
) {
  return studentRepository.findGroupsForStudent(userId, query);
}

async function requireGroupAccess(
  userId: string,
  groupId: string,
) {
  const group = await studentRepository.findGroupById(groupId);

  if (!group) {
    throw new NotFoundError("No Group Found");
  }

  const membership = await studentRepository.findGroupMembership(
    groupId,
    userId,
  );

  if (!membership) {
    throw new ForbiddenError("You Don't have access to this Group");
  }

  return group;
}

export async function getGroupData(userId: string, groupId: string) {
  return requireGroupAccess(userId, groupId);
}

export async function getGroupExams(
  userId: string,
  query: GroupExamsQuery,
) {
  await requireGroupAccess(userId, query.groupId);

  const exams = await studentRepository.findGroupExams({
    groupId: query.groupId,
    take: query.take,
    skip: query.skip,
    searchValue: query.searchValue,
  });

  const attempts = await studentRepository.findAttemptsForExams(
    userId,
    exams.map((exam) => exam.id),
  );

  const attemptByExamId = new Map(
    attempts.map((attempt) => [attempt.examId, attempt]),
  );

  return exams.map((exam) => ({
    ...exam,
    attempt: attemptByExamId.get(exam.id) ?? null,
  }));
}

export async function getGroupCreator(userId: string, groupId: string) {
  const group = await requireGroupAccess(userId, groupId);

  const creator = await studentRepository.findUserById(group.creatorId);

  if (!creator) {
    throw new NotFoundError("Couldn't find Creator");
  }

  return creator;
}
