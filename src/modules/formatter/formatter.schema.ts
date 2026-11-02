import { z } from "zod";

export const SUPPORTED_FORMATTER_LANGUAGES = ["c", "cpp", "java", "python"] as const;

const MAX_CODE_SIZE_BYTES = 1 * 1024 * 1024;

export const formatCodeSchema = z.object({
  language: z.enum(SUPPORTED_FORMATTER_LANGUAGES),
  code: z
    .string()
    .refine((value) => value.trim().length > 0, {
      message: "Code must be a non-empty string",
    })
    .refine(
      (value) => Buffer.byteLength(value, "utf-8") <= MAX_CODE_SIZE_BYTES,
      { message: "Code exceeds maximum size of 1 MB" },
    ),
});

export type FormatCodeInput = z.infer<typeof formatCodeSchema>;
