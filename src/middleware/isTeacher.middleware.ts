import { auth } from "@/utils/auth";
import { fromNodeHeaders } from "better-auth/node";
import { NextFunction, Request, Response } from "express";

export async function isTeacher(req:Request, res: Response, next: NextFunction) {

    const user = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers)
    })

    if(!user){
        return res.status(401)
    }

    if(user.user.role != "TEACHER"){
        return res.status(403)
    }

    req.user = user.user;

    next()
}