import type { Request, Response } from "express";
import path from "path";
import { asyncHandler } from "@/shared/http/async-handler";

export function healthCheck(_req: Request, res: Response): Response {
  return res.status(200).json({
    status: "UP",
    timestamp: new Date().toISOString(),
  });
}

export function rootCheck(_req: Request, res: Response): Response {
  return res.status(200).json({ status: "UP" });
}

export const downloadSebConfig = asyncHandler(
  async (_req: Request, res: Response) => {
    const filePath = path.join(process.cwd(), "assets", "SEB_File.seb");

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="SEB_File.seb"',
    );

    res.sendFile(filePath, (error) => {
      if (error && !res.headersSent) {
        res
          .status(404)
          .json({
            success: false,
            message: "SEB configuration not found",
            error: {
              code: "NOT_FOUND",
              message: "SEB configuration not found",
            },
          });
      }
    });
  },
);
