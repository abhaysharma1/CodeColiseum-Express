import { Request, Response, NextFunction } from "express";
import { formatCodeService } from "@/services/formatter.service";
import { SupportedLanguage } from "@/formatters/codeFormatter.types";

const MAX_CODE_SIZE = 1 * 1024 * 1024;

const supportedLanguages: SupportedLanguage[] = [
    "c",
    "cpp",
    "java",
    "python",
];

export async function formatCode(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const { language, code } = req.body;

        if (!language || !supportedLanguages.includes(language)) {
            res.status(400).json({
                success: false,
                message: "Validation failed",
                error: `Unsupported language. Supported: ${supportedLanguages.join(", ")}`,
            });
            return;
        }

        if (!code || typeof code !== "string" || code.trim().length === 0) {
            res.status(400).json({
                success: false,
                message: "Validation failed",
                error: "Code must be a non-empty string",
            });
            return;
        }

        if (Buffer.byteLength(code, "utf-8") > MAX_CODE_SIZE) {
            res.status(400).json({
                success: false,
                message: "Validation failed",
                error: "Code exceeds maximum size of 1 MB",
            });
            return;
        }

        const result = await formatCodeService(language, code);

        if (result.success) {
            res.status(200).json(result);
        } else {
            const status = result.error?.includes("timed out") ? 408 : 400;
            res.status(status).json(result);
        }
    } catch (error) {
        next(error);
    }
}
