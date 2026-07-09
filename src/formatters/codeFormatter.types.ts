export interface CodeFormatter {
    format(code: string): Promise<string>;
}

export type SupportedLanguage = "c" | "cpp" | "java" | "python";

export interface FormatResponse {
    success: boolean;
    formattedCode?: string;
    message?: string;
    error?: string;
}

export interface ExecResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}
