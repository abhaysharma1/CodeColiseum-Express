import type { Request, Response } from "express";
import { asyncHandler } from "@/shared/http/async-handler";
import { getValidatedBody } from "@/middleware/validation";
import {
  requestPasswordReset,
  signUpPublicUser,
} from "./auth.service";
import type {
  PublicSignupInput,
  RequestPasswordResetInput,
} from "./auth.schema";

export const publicSignup = asyncHandler(
  async (req: Request, res: Response) => {
    const input = getValidatedBody<PublicSignupInput>(req);
    const user = await signUpPublicUser(input);

    return res.status(201).json({
      success: true,
      user,
    });
  },
);

export const requestPasswordResetHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const input = getValidatedBody<RequestPasswordResetInput>(req);

    await requestPasswordReset(input);

    return res.status(200).json({
      success: true,
      message: "Password reset email sent",
    });
  },
);
