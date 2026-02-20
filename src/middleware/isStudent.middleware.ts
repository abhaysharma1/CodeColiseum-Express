import { auth } from "@/utils/auth";
import { fromNodeHeaders } from "better-auth/node";
import { NextFunction, Request, Response } from "express";

export default async function isStudent(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const user = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  if (!user) {
    return res.status(401);
  }

  if (user.user.role != "STUDENT") {
    return res.status(403);
  }

  req.user = user.user;

  next();
}
