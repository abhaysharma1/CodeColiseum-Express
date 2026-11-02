const SENSITIVE_KEY_PATTERN =
  /(password|passwd|token|secret|authorization|cookie|api[_-]?key|credential|private[_-]?key)/i;

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 50;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Recursively masks values whose keys look like credentials. Used by the
 * logger and the error handler so secrets never reach logs or clients.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) {
    return "[Truncated]";
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => redact(item, depth + 1));
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};

    for (const [key, entryValue] of Object.entries(value)) {
      result[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? REDACTED
        : redact(entryValue, depth + 1);
    }

    return result;
  }

  return value;
}

export function redactString(value: string): string {
  return SENSITIVE_KEY_PATTERN.test(value) ? REDACTED : value;
}
