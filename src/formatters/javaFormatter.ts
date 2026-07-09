import { CodeFormatter } from "./codeFormatter.types";
import { executeFormatter } from "./formatterExecutor";
import { formatterConfig } from "@/config/formatter.config";

export class JavaFormatter implements CodeFormatter {
    async format(code: string): Promise<string> {
        const result = await executeFormatter(
            "java",
            ["-jar", formatterConfig.googleJavaFormatJar, "-"],
            code,
        );

        if (result.exitCode !== 0) {
            throw new Error(result.stderr || "Java formatting failed");
        }

        return result.stdout;
    }
}
