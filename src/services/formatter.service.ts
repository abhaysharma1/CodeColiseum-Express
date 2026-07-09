import { FormatResponse } from "@/formatters/codeFormatter.types";
import { getFormatter } from "@/formatters/formatterFactory";

export async function formatCodeService(
    language: string,
    code: string,
): Promise<FormatResponse> {
    const startTime = Date.now();

    try {
        const formatter = getFormatter(language);
        const formattedCode = await formatter.format(code);

        const elapsed = Date.now() - startTime;
        console.log(
            `[Formatter] language=${language} formatter=${language} duration=${elapsed}ms success=true`,
        );

        return {
            success: true,
            formattedCode,
        };
    } catch (error: any) {
        const elapsed = Date.now() - startTime;
        const message = error.message || "Formatting failed";
        console.error(
            `[Formatter] language=${language} duration=${elapsed}ms success=false error=${message}`,
        );

        return {
            success: false,
            message: "Formatting failed",
            error: message,
        };
    }
}
