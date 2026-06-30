import prisma from "@/utils/prisma";
import XLSX from "xlsx";

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
      scoreToRank.set(sorted[i].percentage, scoreToRank.get(sorted[i].percentage)!);
    }
  }

  for (const s of sorted) {
    ranks.push(scoreToRank.get(s.percentage)!);
  }

  const orderedRanks: number[] = [];
  const rankByPercentage = new Map<number, number>();
  sorted.forEach((s, i) => {
    rankByPercentage.set(s.percentage, ranks[i]);
  });

  return students.map((s) => rankByPercentage.get(s.percentage) ?? 0);
}

export async function generateModuleExportExcel(moduleId: string, groupId?: string): Promise<Buffer> {
  const module = await prisma.labModule.findUnique({
    where: { id: moduleId },
    include: {
      lab: {
        include: {
          assignments: {
            include: {
              group: { select: { id: true, name: true } },
            },
          },
        },
      },
      problems: {
        include: {
          problem: {
            select: { id: true, number: true, title: true },
          },
        },
        orderBy: { orderIndex: "asc" },
      },
    },
  });

  if (!module) {
    const err = new Error("Module not found");
    (err as any).status = 404;
    throw err;
  }

  const problems = module.problems;
  const groupIds = groupId
    ? [groupId]
    : module.lab.assignments.map((a) => a.group.id);

  const [members, allProgress] = await Promise.all([
    prisma.groupMember.findMany({
      where: { groupId: { in: groupIds } },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            studentProfile: { select: { rollNumber: true } },
          },
        },
        group: { select: { id: true, name: true } },
      },
    }),
    prisma.moduleProblemProgress.findMany({
      where: { moduleProblem: { moduleId } },
      select: {
        userId: true,
        moduleProblemId: true,
        isSolved: true,
      },
    }),
  ]);

  const progressMap = new Map<string, Map<string, boolean>>();
  for (const p of allProgress) {
    if (!progressMap.has(p.userId)) {
      progressMap.set(p.userId, new Map());
    }
    progressMap.get(p.userId)!.set(p.moduleProblemId, p.isSolved);
  }

  let assessmentName: string | null = null;
  const attemptMap = new Map<string, number>();

  if (module.assessmentExamId) {
    const [exam, attempts] = await Promise.all([
      prisma.exam.findUnique({
        where: { id: module.assessmentExamId },
        select: { title: true },
      }),
      prisma.examAttempt.findMany({
        where: { examId: module.assessmentExamId },
        select: { studentId: true, totalScore: true },
      }),
    ]);
    assessmentName = exam?.title ?? null;
    for (const a of attempts) {
      attemptMap.set(a.studentId, a.totalScore);
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

    for (const mp of problems) {
      const solved = progressMap.get(user.id)?.get(mp.id) ?? false;
      const obtained = solved ? maxPerProblem : 0;
      problemMarks[mp.id] = { obtained, max: maxPerProblem };
      marksSum += obtained;
    }

    const totalProblemMax = problems.length * maxPerProblem;
    const assessmentScore = attemptMap.get(user.id) ?? null;
    const assessmentMax = module.assessmentExamId ? 100 : 0;
    const assessmentScoreVal = assessmentScore ?? 0;
    const totalMarks = marksSum + assessmentScoreVal;
    const totalMax = totalProblemMax + assessmentMax;
    const percentage = totalMax > 0 ? Math.round((totalMarks / totalMax) * 10000) / 100 : 0;

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
  for (const mp of problems) {
    const label = `Problem ${mp.problem.number}`;
    problemColumns.push({ key: `${mp.id}_title`, title: `${label} - Title` });
    problemColumns.push({ key: `${mp.id}_obtained`, title: `${label} - Marks Obtained` });
    problemColumns.push({ key: `${mp.id}_max`, title: `${label} - Max Marks` });
  }
  reportHeaders.push(...problemColumns.map((c) => c.title));

  const hasAssessment = !!module.assessmentExamId;
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

  const reportData: any[][] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const row: any[] = [
      r.studentName,
      r.email,
      r.rollNumber,
      r.groupName,
    ];

    for (const mp of problems) {
      const marks = r.problemMarks[mp.id] ?? { obtained: 0, max: 100 };
      row.push(mp.problem.title, marks.obtained, marks.max);
    }

    if (hasAssessment) {
      const as = r.assessmentScore;
      const am = r.assessmentMax;
      const ap = as !== null && am > 0 ? Math.round((as / am) * 10000) / 100 : 0;
      row.push(r.assessmentName ?? "", as ?? 0, am, ap);
    }

    row.push(r.totalMarks, r.totalMax, r.percentage, ranks[i]);
    reportData.push(row);
  }

  const ws1 = XLSX.utils.aoa_to_sheet([reportHeaders, ...reportData]);

  const lastCol = XLSX.utils.encode_col(reportHeaders.length - 1);
  const lastRow = reportData.length + 1;
  ws1["!autofilter"] = { ref: `A1:${lastCol}${lastRow}` };

  ws1["!cols"] = reportHeaders.map((h, idx) => {
    const colData = reportData.map((r) => String(r[idx] ?? "").length);
    const maxLen = Math.max(h.length + 2, ...colData, 10);
    return { wch: Math.min(maxLen, 45) };
  });

  XLSX.utils.book_append_sheet(wb, ws1, "Module Analytics Report");

  // --- Sheet 2: Summary ---
  const percentages = rows.map((r) => r.percentage);
  const sortedPercentages = [...percentages].sort((a, b) => a - b);
  const avgScore =
    percentages.length > 0
      ? Math.round((percentages.reduce<number>((a, b) => a + b, 0) / percentages.length) * 100) / 100
      : 0;
  const highestScore = percentages.length > 0 ? Math.max(...percentages) : 0;
  const lowestScore = percentages.length > 0 ? Math.min(...percentages) : 0;
  const medianScore =
    sortedPercentages.length > 0
      ? sortedPercentages.length % 2 === 0
        ? (sortedPercentages[sortedPercentages.length / 2 - 1] + sortedPercentages[sortedPercentages.length / 2]) / 2
        : sortedPercentages[Math.floor(sortedPercentages.length / 2)]
      : 0;
  const passCount = percentages.filter((p) => p >= 60).length;
  const failCount = percentages.length - passCount;

  const summaryAoa: any[][] = [
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
    ["Problem Title", "Average Marks", "Highest Marks", "Lowest Marks", "Students Attempted", "Students Solved"],
  ];

  for (const mp of problems) {
    const problemProgresses = allProgress.filter((p) => p.moduleProblemId === mp.id);
    const marks = problemProgresses.map((p) => (p.isSolved ? 100 : 0));
    const avgMarks =
      marks.length > 0
        ? Math.round((marks.reduce<number>((a, b) => a + b, 0) / marks.length) * 100) / 100
        : 0;
    const highMarks = marks.length > 0 ? Math.max(...marks) : 0;
    const lowMarks = marks.length > 0 ? Math.min(...marks) : 0;
    const attemptedCount = problemProgresses.length;
    const solvedCount = problemProgresses.filter((p) => p.isSolved).length;

    summaryAoa.push([mp.problem.title, avgMarks, highMarks, lowMarks, attemptedCount, solvedCount]);
  }

  if (module.assessmentExamId) {
    summaryAoa.push([]);
    summaryAoa.push(["Assessment-wise Analytics"]);
    summaryAoa.push(["Assessment Name", "Average Score", "Highest Score", "Lowest Score"]);

    const assessmentScores = rows
      .map((r) => r.assessmentScore)
      .filter((s): s is number => s !== null);

    if (assessmentScores.length > 0) {
      const avgAssess =
        Math.round(
          (assessmentScores.reduce<number>((a, b) => a + b, 0) / assessmentScores.length) * 100,
        ) / 100;
      const highAssess = Math.max(...assessmentScores);
      const lowAssess = Math.min(...assessmentScores);
      summaryAoa.push([assessmentName ?? "Assessment", avgAssess, highAssess, lowAssess]);
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

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buf);
}
