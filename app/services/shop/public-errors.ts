import { ShopNotFoundError } from "../../repositories/shop-repository";
import { UnknownPilotPackError, InvalidPilotPackError } from "../pilot-seed/packs";
import { PilotSeedNotConfirmedError } from "../pilot-seed/import";
import { ShopNotProcessableError } from "./lifecycle";
import { safeLog } from "../../observability/safe-log";

export type PublicActionError = {
  code: string;
  message: string;
};

export function toPublicSettingsError(
  error: unknown,
  logEvent = "Settings action failed",
): PublicActionError {
  if (error instanceof PilotSeedNotConfirmedError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof ShopNotProcessableError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof UnknownPilotPackError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof InvalidPilotPackError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof ShopNotFoundError) {
    return { code: error.code, message: error.message };
  }

  const prismaCode =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : undefined;

  safeLog(logEvent, {
    status: prismaCode && prismaCode.startsWith("P") ? prismaCode : "UNEXPECTED_ERROR",
  });

  return {
    code: "UNEXPECTED_ERROR",
    message: "Something went wrong. Try again.",
  };
}
