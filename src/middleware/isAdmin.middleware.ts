import { auth } from "@/utils/auth";
import { fromNodeHeaders } from "better-auth/node";
import { NextFunction, Request, Response } from "express";

export async function isAdmin(req: Request, res: Response, next: NextFunction) {
    const user = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers)
    });

    if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    if (user.user.role !== "ADMIN") {
        return res.status(403).json({ error: "Admin access required" });
    }

    req.user = user.user;

    next();
}