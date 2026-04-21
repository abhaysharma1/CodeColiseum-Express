import { GLOBAL_ROLE_IDS } from "@/permissions/role.constants";
import { auth } from "@/utils/auth";
import prisma from "@/utils/prisma";
import { NextFunction, Request, Response } from "express";
import { z } from "zod";

const publicSignupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128),
  roleId: z
    .enum([GLOBAL_ROLE_IDS.ORG_STUDENT, GLOBAL_ROLE_IDS.ORG_TEACHER])
    .optional()
    .default(GLOBAL_ROLE_IDS.ORG_STUDENT),
});

export const publicSignup = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const validation = publicSignupSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        error: "Validation Error",
        details: validation.error.flatten(),
      });
    }

    const { name, email, password, roleId } = validation.data;
    const normalizedEmail = email.toLowerCase();

    try {
      await auth.api.signUpEmail({
        body: {
          email: normalizedEmail,
          password,
          name,
          isOnboarded: true,
        } as any,
        headers: new Headers(),
      });
    } catch (error: any) {
      console.log(error);
      const message =
        error?.body?.message ?? error?.message ?? "Failed to create account";

      if (/already exists|another email/i.test(String(message))) {
        return res.status(409).json({
          error: "User already exists",
          message,
        });
      }

      return res.status(400).json({
        error: "Failed to create account",
        message,
      });
    }

    const createdUser = await prisma.user.update({
      where: { email: normalizedEmail },
      data: {
        isOnboarded: true,
        globalRoleId: roleId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        globalRoleId: true,
      },
    });

    return res.status(201).json({
      success: true,
      user: createdUser,
    });
  } catch (error) {
    next(error);
  }
};
