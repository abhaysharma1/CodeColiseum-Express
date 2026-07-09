import { spawn } from "child_process";
import { ExecResult } from "./codeFormatter.types";

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
            const err = new Error("Formatting timed out");
            (err as any).status = 408;
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
                const error = new Error(`Formatter executable not found: ${executable}`);
                (error as any).status = 500;
                reject(error);
            } else {
                reject(err);
            }
        });

        child.stdin.write(stdin);
        child.stdin.end();
    });
}
