import XLSX from "xlsx";
import { NotFoundError } from "@/shared/errors";
import * as labRepository from "./lab.repository";

interface ProblemMarks {
  obtained: number;
  max: number;
}

interface StudentRow {
  studentId: string;
  studentName: string;
  email: string;
  rollNumber: string;
  groupName: string;
  problemMarks: Record<string, ProblemMarks>;
  assessmentScore: number | null;
  assessmentMax: number;
  assessmentName: string | null;
  totalMarks: number;
  totalMax: number;
  percentage: number;
}

function computeRank(students: { percentage: number }[]): number[] {
  const sorted = [...students].sort((a, b) => b.percentage - a.percentage);
  const ranks: number[] = [];
  let prevScore = -1;
  let currentRank = 0;
  const scoreToRank = new Map<number, number>();

  for (let i = 0; i < sorted.length; i++) {
    currentRank++;
    if (sorted[i].percentage !== prevScore) {
      scoreToRank.set(sorted[i].percentage, currentRank);
      prevScore = sorted[i].percentage;
    } else {
      scoreToRank.set(
        sorted[i].percentage,
        scoreToRank.get(sorted[i].percentage)!,
      );
    }
  }

  for (const s of sorted) {
    ranks.push(scoreToRank.get(s.percentage)!);
  }

  const rankByPercentage = new Map<number, number>();
  sorted.forEach((s, i) => {
    rankByPercentage.set(s.percentage, ranks[i]);
  });

  return students.map((s) => rankByPercentage.get(s.percentage) ?? 0);
}

export async function generateModuleExportExcel(
  moduleId: string,
  groupId?: string,
): Promise<Buffer> {
  const module = await labRepository.findModuleForExport(moduleId);

  if (!module) {
    throw new NotFoundError("Module not found");
  }

  const problems = module.problems;
  const groupIds = groupId
    ? [groupId]
    : module.lab.assignments.map((assignment) => assignment.group.id);

  const [members, allProgress] = await Promise.all([
    labRepository.findGroupMembersWithProfile(groupIds),
    labRepository.findModuleProblemProgressSlim(moduleId),
  ]);

  const progressMap = new Map<string, Map<string, boolean>>();
  for (const progress of allProgress) {
    if (!progressMap.has(progress.userId)) {
      progressMap.set(progress.userId, new Map());
    }
    progressMap
      .get(progress.userId)!
      .set(progress.moduleProblemId, progress.isSolved);
  }

  let assessmentName: string | null = null;
  const attemptMap = new Map<string, number>();

  if (module.assessmentExamId) {
    const [exam, attempts] = await Promise.all([
      labRepository.findExamTitle(module.assessmentExamId),
      labRepository.findExamAttemptScores(module.assessmentExamId),
    ]);
    assessmentName = exam?.title ?? null;
    for (const attempt of attempts) {
      attemptMap.set(attempt.studentId, attempt.totalScore);
    }
  }

  const seenStudents = new Set<string>();
  const rows: StudentRow[] = [];
  const maxPerProblem = 100;

  for (const member of members) {
    const user = member.user;
    if (!user || seenStudents.has(user.id)) continue;
    seenStudents.add(user.id);

    const problemMarks: Record<string, ProblemMarks> = {};
    let marksSum = 0;

    for (const moduleProblem of problems) {
      const solved =
        progressMap.get(user.id)?.get(moduleProblem.id) ?? false;
      const obtained = solved ? maxPerProblem : 0;
      problemMarks[moduleProblem.id] = { obtained, max: maxPerProblem };
      marksSum += obtained;
    }

    const totalProblemMax = problems.length * maxPerProblem;
    const assessmentScore = attemptMap.get(user.id) ?? null;
    const assessmentMax = module.assessmentExamId ? 100 : 0;
    const assessmentScoreVal = assessmentScore ?? 0;
    const totalMarks = marksSum + assessmentScoreVal;
    const totalMax = totalProblemMax + assessmentMax;
    const percentage =
      totalMax > 0 ? Math.round((totalMarks / totalMax) * 10000) / 100 : 0;

    rows.push({
      studentId: user.id,
      studentName: user.name,
      email: user.email,
      rollNumber: user.studentProfile?.rollNumber ?? "",
      groupName: member.group.name,
      problemMarks,
      assessmentScore,
      assessmentMax,
      assessmentName,
      totalMarks,
      totalMax,
      percentage,
    });
  }

  const ranks = computeRank(rows);

  const wb = XLSX.utils.book_new();

  // --- Sheet 1: Module Analytics Report ---
  const reportHeaders: string[] = [
    "Student Name",
    "Email",
    "Roll Number",
    "Group",
  ];

  const problemColumns: { key: string; title: string }[] = [];
  for (const moduleProblem of problems) {
    const label = `Problem ${moduleProblem.problem.number}`;
    problemColumns.push({
      key: `${moduleProblem.id}_title`,
      title: `${label} - Title`,
    });
    problemColumns.push({
      key: `${moduleProblem.id}_obtained`,
      title: `${label} - Marks Obtained`,
    });
    problemColumns.push({
      key: `${moduleProblem.id}_max`,
      title: `${label} - Max Marks`,
    });
  }
  reportHeaders.push(...problemColumns.map((column) => column.title));

  const hasAssessment = Boolean(module.assessmentExamId);
  if (hasAssessment) {
    reportHeaders.push(
      "Assessment Name",
      "Assessment Marks Obtained",
      "Assessment Maximum Marks",
      "Assessment Percentage",
    );
  }

  reportHeaders.push(
    "Total Marks Obtained",
    "Total Possible Marks",
    "Percentage",
    "Rank",
  );

  const reportData: unknown[][] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const values: unknown[] = [
      row.studentName,
      row.email,
      row.rollNumber,
      row.groupName,
    ];

    for (const moduleProblem of problems) {
      const marks = row.problemMarks[moduleProblem.id] ?? {
        obtained: 0,
        max: 100,
      };
      values.push(moduleProblem.problem.title, marks.obtained, marks.max);
    }

    if (hasAssessment) {
      const score = row.assessmentScore;
      const max = row.assessmentMax;
      const percentage =
        score !== null && max > 0
          ? Math.round((score / max) * 10000) / 100
          : 0;
      values.push(row.assessmentName ?? "", score ?? 0, max, percentage);
    }

    values.push(row.totalMarks, row.totalMax, row.percentage, ranks[i]);
    reportData.push(values);
  }

  const ws1 = XLSX.utils.aoa_to_sheet([reportHeaders, ...reportData]);

  const lastCol = XLSX.utils.encode_col(reportHeaders.length - 1);
  const lastRow = reportData.length + 1;
  ws1["!autofilter"] = { ref: `A1:${lastCol}${lastRow}` };

  ws1["!cols"] = reportHeaders.map((header, idx) => {
    const colData = reportData.map((row) => String(row[idx] ?? "").length);
    const maxLen = Math.max(header.length + 2, ...colData, 10);
    return { wch: Math.min(maxLen, 45) };
  });

  XLSX.utils.book_append_sheet(wb, ws1, "Module Analytics Report");

  // --- Sheet 2: Summary ---
  const percentages = rows.map((row) => row.percentage);
  const sortedPercentages = [...percentages].sort((a, b) => a - b);
  const avgScore =
    percentages.length > 0
      ? Math.round(
          (percentages.reduce<number>((a, b) => a + b, 0) /
            percentages.length) *
            100,
        ) / 100
      : 0;
  const highestScore = percentages.length > 0 ? Math.max(...percentages) : 0;
  const lowestScore = percentages.length > 0 ? Math.min(...percentages) : 0;
  const medianScore =
    sortedPercentages.length > 0
      ? sortedPercentages.length % 2 === 0
        ? (sortedPercentages[sortedPercentages.length / 2 - 1] +
            sortedPercentages[sortedPercentages.length / 2]) /
          2
        : sortedPercentages[Math.floor(sortedPercentages.length / 2)]
      : 0;
  const passCount = percentages.filter((percentage) => percentage >= 60).length;
  const failCount = percentages.length - passCount;

  const summaryAoa: unknown[][] = [
    ["Metric", "Value"],
    ["Module Name", module.title],
    ["Total Students", rows.length],
    ["Total Problems", problems.length],
    ["Total Assessments", module.assessmentExamId ? 1 : 0],
    ["Average Score", avgScore],
    ["Highest Score", highestScore],
    ["Lowest Score", lowestScore],
    ["Median Score", medianScore],
    ["Pass Count", passCount],
    ["Fail Count", failCount],
    [],
    ["Problem-wise Analytics"],
    [
      "Problem Title",
      "Average Marks",
      "Highest Marks",
      "Lowest Marks",
      "Students Attempted",
      "Students Solved",
    ],
  ];

  for (const moduleProblem of problems) {
    const problemProgresses = allProgress.filter(
      (progress) => progress.moduleProblemId === moduleProblem.id,
    );
    const marks = problemProgresses.map((progress) =>
      progress.isSolved ? 100 : 0,
    );
    const avgMarks =
      marks.length > 0
        ? Math.round(
            (marks.reduce<number>((a, b) => a + b, 0) / marks.length) * 100,
          ) / 100
        : 0;
    const highMarks = marks.length > 0 ? Math.max(...marks) : 0;
    const lowMarks = marks.length > 0 ? Math.min(...marks) : 0;
    const attemptedCount = problemProgresses.length;
    const solvedCount = problemProgresses.filter(
      (progress) => progress.isSolved,
    ).length;

    summaryAoa.push([
      moduleProblem.problem.title,
      avgMarks,
      highMarks,
      lowMarks,
      attemptedCount,
      solvedCount,
    ]);
  }

  if (module.assessmentExamId) {
    summaryAoa.push([]);
    summaryAoa.push(["Assessment-wise Analytics"]);
    summaryAoa.push([
      "Assessment Name",
      "Average Score",
      "Highest Score",
      "Lowest Score",
    ]);

    const assessmentScores = rows
      .map((row) => row.assessmentScore)
      .filter((score): score is number => score !== null);

    if (assessmentScores.length > 0) {
      const avgAssess =
        Math.round(
          (assessmentScores.reduce<number>((a, b) => a + b, 0) /
            assessmentScores.length) *
            100,
        ) / 100;
      const highAssess = Math.max(...assessmentScores);
      const lowAssess = Math.min(...assessmentScores);
      summaryAoa.push([
        assessmentName ?? "Assessment",
        avgAssess,
        highAssess,
        lowAssess,
      ]);
    } else {
      summaryAoa.push([assessmentName ?? "Assessment", "N/A", "N/A", "N/A"]);
    }
  }

  const ws2 = XLSX.utils.aoa_to_sheet(summaryAoa);
  ws2["!cols"] = [
    { wch: 40 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
  ];

  XLSX.utils.book_append_sheet(wb, ws2, "Summary");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buffer);
}
