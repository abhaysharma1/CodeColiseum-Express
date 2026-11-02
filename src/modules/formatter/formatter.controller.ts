import type { Request, Response } from "express";
import { asyncHandler } from "@/shared/http/async-handler";
import { getValidatedBody } from "@/middleware/validation";
import { formatCodeService } from "./formatter.service";
import type { FormatCodeInput } from "./formatter.schema";

export const formatCode = asyncHandler(
  async (req: Request, res: Response) => {
    const { language, code } = getValidatedBody<FormatCodeInput>(req);

    const result = await formatCodeService(language, code);

    if (result.success) {
      return res.status(200).json(result);
    }

    const status = result.error?.includes("timed out") ? 408 : 400;
    return res.status(status).json(result);
  },
);
