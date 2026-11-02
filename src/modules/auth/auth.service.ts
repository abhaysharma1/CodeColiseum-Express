import { auth } from "@/utils/auth";
import { logger } from "@/config/logger";
import { AppError, ConflictError, NotFoundError } from "@/shared/errors";
import {
  activateUserWithRole,
  findUserIdByEmail,
} from "./auth.repository";
import type {
  PublicSignupInput,
  RequestPasswordResetInput,
} from "./auth.schema";
import type { PublicSignupResult } from "./auth.types";

interface ProviderErrorShape {
  body?: { message?: unknown };
  message?: unknown;
  status?: unknown;
}

function getProviderErrorMessage(error: unknown): string {
  if (typeof error !== "object" || error === null) {
    return "Authentication provider request failed";
  }

  const providerError = error as ProviderErrorShape;
  const bodyMessage = providerError.body?.message;
  const message = providerError.message;

  if (typeof bodyMessage === "string" && bodyMessage.length > 0) {
    return bodyMessage;
  }

  if (typeof message === "string" && message.length > 0) {
    return message;
  }

  return "Authentication provider request failed";
}

function isDuplicateAccountError(message: string): boolean {
  return /already exists|another email/i.test(message);
}

/**
 * Public self-service signup. The Better Auth user is created first and then
 * linked to an organization role; failures are translated into domain errors
 * so the controller stays HTTP-only.
 */
export async function signUpPublicUser(
  input: PublicSignupInput,
): Promise<PublicSignupResult> {
  const normalizedEmail = input.email.toLowerCase();

  try {
    await auth.api.signUpEmail({
      body: {
        email: normalizedEmail,
        password: input.password,
        name: input.name,
        isOnboarded: true,
      },
      headers: new Headers(),
    } as unknown as Parameters<typeof auth.api.signUpEmail>[0]);
  } catch (error) {
    const message = getProviderErrorMessage(error);
    logger.warn("public signup rejected by auth provider", {
      email: normalizedEmail,
      reason: message,
    });

    if (isDuplicateAccountError(message)) {
      throw new ConflictError("User already exists", { providerMessage: message });
    }

    throw new AppError("Failed to create account", 400, {
      code: "VALIDATION_ERROR",
      details: { providerMessage: message },
      cause: error,
    });
  }

  return activateUserWithRole(normalizedEmail, input.roleId);
}

export async function requestPasswordReset(
  input: RequestPasswordResetInput,
): Promise<void> {
  const normalizedEmail = input.email.toLowerCase();
  const user = await findUserIdByEmail(normalizedEmail);

  if (!user) {
    throw new NotFoundError("No account found with this email address");
  }

  try {
    await auth.api.requestPasswordReset({
      body: { email: normalizedEmail },
      headers: new Headers(),
    });
  } catch (error) {
    logger.error("password reset email failed", {
      email: normalizedEmail,
      reason: getProviderErrorMessage(error),
    });

    throw new AppError("Failed to send reset email", 500, {
      code: "INTERNAL_SERVER_ERROR",
      isOperational: false,
      cause: error,
    });
  }
}
