type ConsoleMethod = "log" | "info" | "warn" | "error" | "debug";
type ConsoleMethodFn = (...data: unknown[]) => void;

type SupportConsoleLogEntry = {
  method: ConsoleMethod;
  timestamp: string;
  message: string;
};

const CONSOLE_METHODS: ConsoleMethod[] = [
  "log",
  "info",
  "warn",
  "error",
  "debug",
];
const MAX_LOG_ENTRIES = 160;
const MAX_ARGUMENT_LENGTH = 2_500;
const MAX_ATTACHMENT_LENGTH = 48_000;
const REDACTED = "[REDACTED]";

const logEntries: SupportConsoleLogEntry[] = [];
let isInstalled = false;

export function installSupportConsoleLogBuffer() {
  if (isInstalled) return;
  isInstalled = true;

  CONSOLE_METHODS.forEach((method) => {
    const original = console[method].bind(console) as ConsoleMethodFn;

    console[method] = (...args: unknown[]) => {
      recordConsoleLog(method, args);
      original(...args);
    };
  });
}

export function createSupportConsoleLogFile(sourceUrl: string): File {
  const capturedAt = new Date();
  const content = buildConsoleLogFileContent(capturedAt, sourceUrl);
  const filenameTimestamp = capturedAt.toISOString().replace(/[:.]/g, "-");

  return new File([content], `alloro-console-log-${filenameTimestamp}.txt`, {
    type: "text/plain",
  });
}

function recordConsoleLog(method: ConsoleMethod, args: unknown[]) {
  const message = redactSensitiveText(
    args.map((arg) => formatConsoleArgument(arg)).join(" "),
  );

  logEntries.push({
    method,
    timestamp: new Date().toISOString(),
    message: truncateText(message, MAX_ARGUMENT_LENGTH),
  });

  if (logEntries.length > MAX_LOG_ENTRIES) {
    logEntries.splice(0, logEntries.length - MAX_LOG_ENTRIES);
  }
}

function buildConsoleLogFileContent(
  capturedAt: Date,
  sourceUrl: string,
): string {
  const lines = [
    `Captured at: ${capturedAt.toISOString()}`,
    `Source URL: ${sourceUrl}`,
    `User agent: ${navigator.userAgent}`,
    `Entries retained: ${logEntries.length}`,
    "",
    "Console logs:",
  ];

  if (logEntries.length === 0) {
    lines.push("(No console entries captured in this browser session.)");
  } else {
    logEntries.forEach((entry) => {
      lines.push(
        `[${entry.timestamp}] ${entry.method.toUpperCase()}: ${entry.message}`,
      );
    });
  }

  return truncateText(lines.join("\n"), MAX_ATTACHMENT_LENGTH);
}

function formatConsoleArgument(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) {
    return [value.name, value.message, value.stack].filter(Boolean).join(": ");
  }

  if (typeof value === "object" && value !== null) {
    return safeStringify(value);
  }

  return String(value);
}

function safeStringify(value: object): string {
  const seen = new WeakSet<object>();

  try {
    return JSON.stringify(value, (_key, nestedValue: unknown) => {
      if (typeof nestedValue === "object" && nestedValue !== null) {
        if (seen.has(nestedValue)) return "[Circular]";
        seen.add(nestedValue);
      }

      if (typeof nestedValue === "function") return "[Function]";
      return nestedValue;
    });
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function redactSensitiveText(value: string): string {
  return value
    .replace(
      /(\bauthorization\b\s*[:=]\s*)(bearer\s+)?[^\s,;"')]+/gi,
      `$1${REDACTED}`,
    )
    .replace(
      /(\b(?:access|auth|refresh|id)?_?token\b\s*[:=]\s*)[^\s,;"')]+/gi,
      `$1${REDACTED}`,
    )
    .replace(
      /("?(?:access|auth|refresh|id)?_?token"?\s*:\s*")([^"]+)(")/gi,
      `$1${REDACTED}$3`,
    )
    .replace(/(\bpassword\b\s*[:=]\s*)[^\s,;"')]+/gi, `$1${REDACTED}`)
    .replace(/("password"\s*:\s*")([^"]+)(")/gi, `$1${REDACTED}$3`);
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n[truncated]`;
}
