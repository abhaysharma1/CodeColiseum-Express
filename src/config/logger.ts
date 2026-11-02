import winston from "winston";
import { env, isProduction } from "@/config/env";
import { redact } from "@/shared/utils/redact";

const UNSAFE_TO_REDACT = new Set([
  "level",
  "message",
  "timestamp",
  "service",
  "requestId",
  "stack",
]);

const redactFormat = winston.format((info) => {
  if (info.meta !== undefined) {
    info.meta = redact(info.meta);
  }

  if (typeof info.message === "object" && info.message !== null) {
    info.message = redact(info.message);
  }

  for (const key of Object.keys(info)) {
    if (UNSAFE_TO_REDACT.has(key) || key === "meta") {
      continue;
    }

    info[key] = redact(info[key]);
  }

  return info;
});

const developmentFormat = winston.format.combine(
  winston.format.timestamp(),
  redactFormat(),
  winston.format.colorize(),
  winston.format.printf(({ level, message, timestamp, requestId, ...meta }) => {
    const context = requestId ? ` [${String(requestId)}]` : "";
    const extra =
      Object.keys(meta).filter((key) => key !== "splat").length > 0
        ? ` ${JSON.stringify(redact(meta))}`
        : "";
    return `${String(timestamp)} ${level}${context}: ${String(message)}${extra}`;
  }),
);

const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  redactFormat(),
  winston.format.json(),
);

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  defaultMeta: { service: "codecoliseum-api" },
  format: isProduction ? productionFormat : developmentFormat,
  transports: [new winston.transports.Console()],
  exitOnError: false,
});

export type Logger = winston.Logger;
