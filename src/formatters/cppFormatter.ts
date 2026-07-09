import { CodeFormatter } from "./codeFormatter.types";
import { executeFormatter } from "./formatterExecutor";
import { formatterConfig } from "@/config/formatter.config";

export class CppFormatter implements CodeFormatter {
    async format(code: string): Promise<string> {
        const result = await executeFormatter(
            formatterConfig.clangFormatPath,
            ["--assume-filename=temp.cpp"],
            code,
        );

        if (result.exitCode !== 0) {
            throw new Error(result.stderr || "C++ formatting failed");
        }

        return result.stdout;
    }
}
