import { auth } from "@/utils/auth";
import { fromNodeHeaders } from "better-auth/node";
import { NextFunction, Request, Response } from "express";

export async function isLoggedIn(req: Request, res: Response, next: NextFunction) {
    const user = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers)
    });

    if (!user?.user) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    req.user = user.user;

    next();
}