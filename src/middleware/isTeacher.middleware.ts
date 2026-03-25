import { auth } from "@/utils/auth";
import { fromNodeHeaders } from "better-auth/node";
import { NextFunction, Request, Response } from "express";
import prisma from "@/utils/prisma";
import { GLOBAL_ROLE_IDS } from "@/permissions/role.constants";

export async function isTeacher(req:Request, res: Response, next: NextFunction) {

    const user = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers)
    })

    if(!user){
        return res.status(401)
    }

    const dbUser = await prisma.user.findUnique({
        where: { id: user.user.id },
        select: { globalRoleId: true }
    });

    if(dbUser?.globalRoleId !== GLOBAL_ROLE_IDS.ORG_TEACHER){
        return res.status(403)
    }

    req.user = user.user;

    next()
}