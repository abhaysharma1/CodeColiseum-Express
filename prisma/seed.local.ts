/**
 * Local development seed.
 *
 * Creates:
 *   - 3 demo users (admin / teacher / student) with working credentials
 *   - 2 published practice problems with run + submit test cases
 *
 * Idempotent: safe to run on every startup.
 *
 * Run with:
 *   npx tsx prisma/seed.local.ts
 *
 * Password for all accounts: Password123!
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const PASSWORD = "Password123!";

// ---------------------------------------------------------------------------
// database connection (mirrors prisma/seed.ts, but defaults to no TLS locally)
// ---------------------------------------------------------------------------
const rawConnectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!rawConnectionString) {
  throw new Error("DIRECT_URL or DATABASE_URL must be set before running the local seed");
}

const connectionUrl = new URL(rawConnectionString);

const prismaSchema = connectionUrl.searchParams.get("schema");
if (prismaSchema) {
  const existingOptions = connectionUrl.searchParams.get("options");
  const searchPathOption = `-c search_path=${prismaSchema}`;

  if (existingOptions) {
    if (!existingOptions.includes("search_path")) {
      connectionUrl.searchParams.set("options", `${existingOptions} ${searchPathOption}`);
    }
  } else {
    connectionUrl.searchParams.set("options", searchPathOption);
  }

  connectionUrl.searchParams.delete("schema");
}

if (!connectionUrl.searchParams.has("sslmode")) {
  connectionUrl.searchParams.set("sslmode", "disable");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: connectionUrl.toString() }),
});

// ---------------------------------------------------------------------------
// demo users
// ---------------------------------------------------------------------------
const DEMO_USERS = [
  {
    email: "admin@local.test",
    name: "Local Admin",
    globalRoleId: "role_platform_admin",
  },
  {
    email: "teacher@local.test",
    name: "Local Teacher",
    globalRoleId: "role_org_teacher",
  },
  {
    email: "student@local.test",
    name: "Local Student",
    globalRoleId: "role_org_student",
  },
] as const;

async function seedUsers() {
  // Imported dynamically because better-auth ships ESM-only entry points.
  const { hashPassword } = await import("better-auth/crypto");
  const passwordHash = await hashPassword(PASSWORD);

  for (const demo of DEMO_USERS) {
    const existing = await prisma.user.findUnique({ where: { email: demo.email } });

    const user = existing
      ? await prisma.user.update({
          where: { email: demo.email },
          data: {
            name: demo.name,
            globalRoleId: demo.globalRoleId,
            isOnboarded: true,
            emailVerified: true,
          },
        })
      : await prisma.user.create({
          data: {
            id: randomUUID(),
            email: demo.email,
            name: demo.name,
            globalRoleId: demo.globalRoleId,
            isOnboarded: true,
            emailVerified: true,
          },
        });

    await prisma.account.upsert({
      where: {
        providerId_accountId: {
          providerId: "credential",
          accountId: user.id,
        },
      },
      update: { password: passwordHash },
      create: {
        id: randomUUID(),
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: passwordHash,
      },
    });

    console.log(`[seed] user ready: ${demo.email} (${demo.globalRoleId})`);
  }
}

// ---------------------------------------------------------------------------
// demo problems
// ---------------------------------------------------------------------------
type SeedLanguage = "c" | "cpp" | "python" | "java";
type SeedProblem = {
  number: number;
  title: string;
  description: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  cases: Array<{ input: string; output: string }>;
  templates: Record<SeedLanguage, string>;
};

const DEMO_PROBLEMS: SeedProblem[] = [
  {
    number: 1,
    title: "Sum of Two Numbers",
    description:
      "Read two integers from standard input and print their sum.\n\nInput format:\nTwo space separated integers.\n\nOutput format:\nA single integer.",
    difficulty: "EASY",
    cases: [
      { input: "2 3\n", output: "5\n" },
      { input: "10 -4\n", output: "6\n" },
      { input: "-7 -8\n", output: "-15\n" },
    ],
    templates: {
      c: String.raw`#include <stdio.h>

int main() {
    int a, b;
    scanf("%d %d", &a, &b);
    printf("%d\n", a + b);
    return 0;
}
`,
      cpp: String.raw`#include <iostream>

int main() {
    int a, b;
    std::cin >> a >> b;
    std::cout << a + b << std::endl;
    return 0;
}
`,
      python: `a, b = map(int, input().split())
print(a + b)
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int a = sc.nextInt();
        int b = sc.nextInt();
        System.out.println(a + b);
    }
}
`,
    },
  },
  {
    number: 2,
    title: "Reverse a String",
    description:
      "Read one line of text and print it reversed.\n\nInput format:\nA single line of text.\n\nOutput format:\nThe same text in reverse order.",
    difficulty: "EASY",
    cases: [
      { input: "hello\n", output: "olleh\n" },
      { input: "codecoliseum\n", output: "muiesolocedoc\n" },
      { input: "abc 123\n", output: "321 cba\n" },
    ],
    templates: {
      c: String.raw`#include <stdio.h>
#include <string.h>

int main() {
    char s[1024];
    if (!fgets(s, sizeof(s), stdin)) return 0;
    size_t n = strlen(s);
    while (n > 0 && (s[n - 1] == '\n' || s[n - 1] == '\r')) s[--n] = '\0';
    for (size_t i = 0; i < n / 2; i++) {
        char t = s[i];
        s[i] = s[n - 1 - i];
        s[n - 1 - i] = t;
    }
    printf("%s\n", s);
    return 0;
}
`,
      cpp: String.raw`#include <iostream>
#include <string>
#include <algorithm>

int main() {
    std::string s;
    std::getline(std::cin, s);
    std::reverse(s.begin(), s.end());
    std::cout << s << std::endl;
    return 0;
}
`,
      python: `print(input()[::-1])
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String s = sc.hasNextLine() ? sc.nextLine() : "";
        System.out.println(new StringBuilder(s).reverse());
    }
}
`,
    },
  },
];

async function seedProblems() {
  for (const demo of DEMO_PROBLEMS) {
    const problem = await prisma.problem.upsert({
      where: { number: demo.number },
      update: {
        title: demo.title,
        description: demo.description,
        difficulty: demo.difficulty,
        source: "Local Seed",
        isPublished: true,
        hidden: false,
        ownerType: "ADMIN",
        visibility: "PUBLIC",
        approvalStatus: "APPROVED",
      },
      create: {
        number: demo.number,
        title: demo.title,
        description: demo.description,
        difficulty: demo.difficulty,
        source: "Local Seed",
        isPublished: true,
        hidden: false,
        ownerType: "ADMIN",
        visibility: "PUBLIC",
        approvalStatus: "APPROVED",
      },
    });

    // Used by the code execution worker for actual submissions.
    await prisma.testCase.upsert({
      where: { problemId: problem.id },
      update: { cases: demo.cases },
      create: { problemId: problem.id, cases: demo.cases },
    });

    // Used by the "Run against sample tests" button in the UI.
    await prisma.runTestCase.upsert({
      where: { problemId: problem.id },
      update: { cases: demo.cases },
      create: { problemId: problem.id, cases: demo.cases },
    });

    await prisma.performanceConstraints.upsert({
      where: { problemId: problem.id },
      update: {},
      create: { problemId: problem.id },
    });

    // Editor starter code for each supported language.
    for (const language of Object.keys(
      demo.templates,
    ) as SeedLanguage[]) {
      const template = demo.templates[language];
      await prisma.driverCode.upsert({
        where: {
          language_problemId: { language, problemId: problem.id },
        },
        update: { template },
        create: { language, problemId: problem.id, template },
      });
    }

    console.log(`[seed] problem ready: #${demo.number} ${demo.title}`);
  }
}

async function main() {
  await seedUsers();
  await seedProblems();
  console.log("[seed] local seed complete");
  console.log(`[seed] login with any of: ${DEMO_USERS.map((u) => u.email).join(", ")}`);
  console.log(`[seed] password: ${PASSWORD}`);
}

main()
  .catch((error) => {
    console.error("[seed] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
