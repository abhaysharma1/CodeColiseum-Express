import { logger } from "@/config/logger";
import { getFormatter } from "@/formatters/formatterFactory";
import type { FormatResponse } from "@/formatters/codeFormatter.types";

export async function formatCodeService(
  language: string,
  code: string,
): Promise<FormatResponse> {
  const startTime = Date.now();

  try {
    const formatter = getFormatter(language);
    const formattedCode = await formatter.format(code);

    logger.info("code formatted", {
      language,
      durationMs: Date.now() - startTime,
      success: true,
    });

    return { success: true, formattedCode };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Formatting failed";

    logger.warn("code formatting failed", {
      language,
      durationMs: Date.now() - startTime,
      success: false,
      reason: message,
    });

    return {
      success: false,
      message: "Formatting failed",
      error: message,
    };
  }
}
