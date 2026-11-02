const CASE_START_TOKEN = "_CASE_START_";
const CASE_END_TOKEN = "_CASE_END_";

export type NormalizedTestCase = {
  input: string;
  output: string;
};

const stripCaseDelimiters = (value: string) =>
  (value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/^\s*_CASE_START_\s*$/gm, "")
    .replace(/^\s*_CASE_END_\s*$/gm, "")
    .trim();

const parseDelimitedBlocks = (value: string) => {
  if (!value.includes(CASE_START_TOKEN) || !value.includes(CASE_END_TOKEN)) {
    return [];
  }

  const matches = [
    ...value.matchAll(/_CASE_START_\s*([\s\S]*?)\s*_CASE_END_/g),
  ];
  return matches
    .map((match) => stripCaseDelimiters((match[1] ?? "").trim()))
    .filter((block) => block !== "");
};

const splitBundledInput = (input: string, expectedCases: number) => {
  if (expectedCases <= 1) {
    return [input.trim()];
  }

  const lines = input.split(/\r?\n/).map((line) => line.trimEnd());
  const firstLine = lines[0]?.trim() ?? "";
  const declaredCount = Number.parseInt(firstLine, 10);
  const hasLeadingCount =
    Number.isFinite(declaredCount) && declaredCount === expectedCases;

  const inputLines = hasLeadingCount ? lines.slice(1) : lines;
  if (inputLines.length === 0) {
    return Array.from({ length: expectedCases }, () => "");
  }

  if (inputLines.length % expectedCases === 0) {
    const linesPerCase = inputLines.length / expectedCases;
    return Array.from({ length: expectedCases }, (_, index) => {
      const start = index * linesPerCase;
      const end = start + linesPerCase;
      return inputLines.slice(start, end).join("\n").trim();
    });
  }

  return Array.from({ length: expectedCases }, (_, index) =>
    (inputLines[index] ?? "").trim(),
  );
};

/**
 * Normalizes the various stored test-case formats (JSON string, array, single
 * object, `_CASE_START_` delimited bundles) into a single list of input/output
 * pairs. Shared by practice and exam flows so both parse identically.
 */
export const normalizeProblemTestCases = (
  rawCases: unknown,
): NormalizedTestCase[] => {
  let parsedCases = rawCases;

  if (typeof parsedCases === "string") {
    try {
      parsedCases = JSON.parse(parsedCases);
    } catch {
      return [];
    }
  }

  const sourceCases = Array.isArray(parsedCases)
    ? parsedCases
    : parsedCases && typeof parsedCases === "object"
      ? [parsedCases]
      : [];

  const normalized: NormalizedTestCase[] = [];

  for (const caseItem of sourceCases) {
    if (!caseItem || typeof caseItem !== "object") {
      continue;
    }

    const input =
      typeof (caseItem as { input?: unknown }).input === "string"
        ? (caseItem as { input: string }).input
        : "";
    const output =
      typeof (caseItem as { output?: unknown }).output === "string"
        ? (caseItem as { output: string }).output
        : "";

    if (!input && !output) {
      continue;
    }

    const inputBlocks = parseDelimitedBlocks(input);
    const outputBlocks = parseDelimitedBlocks(output);

    if (outputBlocks.length === 0) {
      normalized.push({
        input: stripCaseDelimiters(input),
        output: stripCaseDelimiters(output),
      });
      continue;
    }

    const mappedInputBlocks =
      inputBlocks.length > 0
        ? inputBlocks
        : splitBundledInput(stripCaseDelimiters(input), outputBlocks.length);
    const pairCount = outputBlocks.length;

    for (let index = 0; index < pairCount; index += 1) {
      normalized.push({
        input: stripCaseDelimiters(mappedInputBlocks[index] ?? ""),
        output: stripCaseDelimiters(outputBlocks[index] ?? ""),
      });
    }
  }

  return normalized;
};
