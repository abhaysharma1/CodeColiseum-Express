import { describe, expect, it } from "vitest";
import {
  buildPasswordsCsv,
  classifyComplexity,
  normalizeProgrammingLanguage,
  parseCredentialsCsv,
  parseStudentSignupRow,
  parseTeacherSignupRow,
  resolveGlobalRoleId,
  sanitizeCsvFilename,
  stripCaseDelimiters,
} from "@/modules/admin/admin.helpers";
import {
  bulkSignUpSchema,
  problemEditorSchema,
  uploadProblemsSchema,
  validateComplexitySchema,
} from "@/modules/admin/admin.schema";
import { GLOBAL_ROLE_IDS } from "@/permissions/role.constants";

describe("admin role resolution", () => {
  it("defaults to the organization student role", () => {
    expect(resolveGlobalRoleId({})).toBe(GLOBAL_ROLE_IDS.ORG_STUDENT);
  });

  it("honours an explicit role", () => {
    expect(resolveGlobalRoleId({ roleId: GLOBAL_ROLE_IDS.ORG_TEACHER })).toBe(
      GLOBAL_ROLE_IDS.ORG_TEACHER,
    );
  });
});

describe("admin language resolution", () => {
  it("normalizes a supported language key", () => {
    expect(normalizeProgrammingLanguage({ language: " Python " })).toBe(
      "python",
    );
  });

  it("resolves a runtime language id", () => {
    expect(normalizeProgrammingLanguage({ languageId: 2 })).toBe("cpp");
  });

  it("rejects unsupported input", () => {
    expect(normalizeProgrammingLanguage({ language: "rust" })).toBeNull();
    expect(normalizeProgrammingLanguage({ languageId: 99 })).toBeNull();
  });
});

describe("complexity classification", () => {
  it("returns UNSTABLE when the two ratios disagree", () => {
    expect(classifyComplexity(2, 4).complexity).toBe("UNSTABLE");
  });

  it("classifies linear growth", () => {
    expect(classifyComplexity(1.5, 1.55).complexity).toBe("N");
  });

  it("classifies quadratic growth", () => {
    expect(classifyComplexity(3.5, 3.6).complexity).toBe("N2");
  });
});

describe("admin CSV helpers", () => {
  it("rejects path separators in download names", () => {
    expect(sanitizeCsvFilename("../../etc/passwd")).toBe(
      "._._etc_passwd.csv",
    );
  });

  it("appends the csv extension only when missing", () => {
    expect(sanitizeCsvFilename("report.csv")).toBe("report.csv");
    expect(sanitizeCsvFilename("report")).toBe("report.csv");
  });

  it("only exports successfully created credentials", () => {
    const csv = buildPasswordsCsv([
      { email: "a@x.com", name: "A", password: "pass1", result: "created" },
      {
        email: "b@x.com",
        name: "B",
        password: "",
        result: "error",
        message: "nope",
      },
    ]);

    expect(csv).toBe("Email,Password\na@x.com,pass1");
  });

  it("skips the header and keeps 1-based data line numbers", () => {
    const rows = parseCredentialsCsv("Email,Password\na@x.com,secret\n\nb@x.com,pw");

    expect(rows).toEqual([
      { lineNumber: 2, email: "a@x.com", password: "secret" },
      { lineNumber: 4, email: "b@x.com", password: "pw" },
    ]);
  });
});

describe("bulk spreadsheet row parsing", () => {
  it("normalizes student rows", () => {
    expect(
      parseStudentSignupRow({
        Name: " Ada ",
        Email: " ADA@Example.com ",
        "Roll Number": " 21 ",
        Branch: " CSE ",
        Semester: "5",
        Batch: " 2026 ",
      }),
    ).toEqual({
      name: "Ada",
      email: "ada@example.com",
      rollNumber: "21",
      branch: "CSE",
      semester: 5,
      batch: "2026",
    });
  });

  it("keeps optional teacher fields nullable", () => {
    expect(
      parseTeacherSignupRow({ Name: "Grace", Email: "G@X.com" }),
    ).toEqual({
      name: "Grace",
      email: "g@x.com",
      employeeId: null,
      department: null,
    });
  });
});

describe("admin validation schemas", () => {
  it("removes synthetic case delimiters", () => {
    expect(
      stripCaseDelimiters("__CASE_START__\n1 2\n__CASE_END__\n"),
    ).toBe("1 2");
  });

  it("rejects an empty bulk import", () => {
    expect(uploadProblemsSchema.safeParse([]).success).toBe(false);
  });

  it("applies problem editor defaults", () => {
    const parsed = problemEditorSchema.parse({
      title: "Two Sum",
      testCases: {},
    });

    expect(parsed.difficulty).toBe("MEDIUM");
    expect(parsed.status).toBe("DRAFT");
    expect(parsed.hidden).toBe(false);
    expect(parsed.description).toBe("");
    expect(parsed.testCases).toEqual({ public: [], hidden: [] });
    expect(Object.keys(parsed.driverCode)).toEqual([
      "c",
      "cpp",
      "python",
      "java",
    ]);
  });

  it("requires the testCases envelope like the legacy editor", () => {
    expect(problemEditorSchema.safeParse({ title: "Two Sum" }).success).toBe(
      false,
    );
  });

  it("caps bulk signup batches at 500 emails", () => {
    const emails = Array.from({ length: 501 }, (_, i) => `u${i}@x.com`);
    expect(bulkSignUpSchema.safeParse({ emails }).success).toBe(false);
  });

  it("requires exactly three complexity cases", () => {
    const result = validateComplexitySchema.safeParse({
      problemId: "p1",
      casesData: {
        expectedComplexity: "N2",
        cases: [
          { input: "1", output: "1", size: "N" },
          { input: "2", output: "2", size: "2N" },
        ],
      },
    });

    expect(result.success).toBe(false);
  });
});
