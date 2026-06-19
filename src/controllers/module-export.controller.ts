import { NextFunction, Request, Response } from "express";
import { getTeacherModuleOrThrow } from "@/services/lab.service";
import { generateModuleExportExcel } from "@/services/module-export.service";

export async function exportModuleAnalytics(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const user = req.user!;
    const moduleId = req.params.moduleId as string;
    await getTeacherModuleOrThrow(user.id, moduleId);

    const buffer = await generateModuleExportExcel(moduleId);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="module-analytics-${moduleId}.xlsx"`,
    );
    res.send(buffer);
  } catch (error) {
    next(error);
  }
}
