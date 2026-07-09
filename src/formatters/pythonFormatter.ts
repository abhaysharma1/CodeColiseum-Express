import { CodeFormatter } from "./codeFormatter.types";
import { executeFormatter } from "./formatterExecutor";
import { formatterConfig } from "@/config/formatter.config";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export class PythonFormatter implements CodeFormatter {
    async format(code: string): Promise<string> {
        // Try stdin mode first (black - reads from stdin)
        try {
            const result = await executeFormatter(
                formatterConfig.blackPath,
                ["-"],
                code,
                10000,
            );
            if (result.exitCode === 0) {
                return result.stdout;
            }
        } catch {
            // Fall through to temp file approach
        }

        // Fallback: write to temp file, format in-place, read back
        const tmpFile = path.join(
            os.tmpdir(),
            `codecoliseum_${Date.now()}_${Math.random().toString(36).slice(2)}.py`,
        );

        try {
            fs.writeFileSync(tmpFile, code, "utf-8");
            const result = await executeFormatter(
                formatterConfig.blackPath,
                [tmpFile],
                "",
                10000,
            );

            if (result.exitCode !== 0) {
                throw new Error(result.stderr || "Python formatting failed");
            }

            return fs.readFileSync(tmpFile, "utf-8");
        } finally {
            try {
                fs.unlinkSync(tmpFile);
            } catch {
                // ignore cleanup errors
            }
        }
    }
}
