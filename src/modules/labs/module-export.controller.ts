import type { Request, Response } from "express";
import { asyncHandler } from "@/shared/http/async-handler";
import {
  getValidatedParams,
  getValidatedQuery,
} from "@/middleware/validation";
import { UnauthorizedError } from "@/shared/errors";
import * as labService from "./lab.service";
import { generateModuleExportExcel } from "./module-export.service";
import type { ModuleExportQuery } from "./lab.schema";

function requireUserId(req: Request): string {
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError("Unauthorized");
  }

  return userId;
}

export const exportModuleAnalytics = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { moduleId } = getValidatedParams<{ moduleId: string }>(req);
    const query = getValidatedQuery<ModuleExportQuery>(req);

    await labService.getTeacherModuleOrThrow(userId, moduleId);

    const buffer = await generateModuleExportExcel(moduleId, query.groupId);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="module-analytics-${moduleId}.xlsx"`,
    );
    res.send(buffer);
  },
);
