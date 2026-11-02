import { spawn } from "child_process";
import { ExecResult } from "./codeFormatter.types";
import { AppError } from "@/shared/errors";

export async function executeFormatter(
    executable: string,
    args: string[],
    stdin: string,
    timeoutMs: number = 5000,
): Promise<ExecResult> {
    return new Promise<ExecResult>((resolve, reject) => {
        const child = spawn(executable, args, { shell: false });
        let stdout = "";
        let stderr = "";
        let timedOut = false;

        const timer = setTimeout(() => {
            timedOut = true;
            child.kill();
            const err = new AppError("Formatting timed out", 408, {
                code: "SERVICE_UNAVAILABLE",
            });
            reject(err);
        }, timeoutMs);

        child.stdout.on("data", (data: Buffer) => {
            stdout += data.toString();
        });

        child.stderr.on("data", (data: Buffer) => {
            stderr += data.toString();
        });

        child.on("close", (code) => {
            if (timedOut) return;
            clearTimeout(timer);
            resolve({ stdout, stderr, exitCode: code ?? -1 });
        });

        child.on("error", (err: NodeJS.ErrnoException) => {
            clearTimeout(timer);
            if (err.code === "ENOENT") {
                const error = new AppError(
                    `Formatter executable not found: ${executable}`,
                    500,
                    { code: "INTERNAL_SERVER_ERROR", isOperational: false },
                );
                reject(error);
            } else {
                reject(err);
            }
        });

        child.stdin.write(stdin);
        child.stdin.end();
    });
}
