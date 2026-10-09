/** Structured JSON logs, one object per line. Silent under NODE_ENV=test. */

export type LogFields = Record<string, unknown>;
type Level = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
}

/** Field names that must never reach a log line, however they got into the fields. */
const SECRET_KEY = /authorization|cookie|api[_-]?key|token|secret|password/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 3 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SECRET_KEY.test(k) ? '[redacted]' : redact(v, depth + 1)]));
}

export function createLogger(base: LogFields = {}, enabled = process.env.NODE_ENV !== 'test'): Logger {
  const write = (level: Level) => (event: string, fields: LogFields = {}) => {
    if (!enabled) return;
    const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...(redact({ ...base, ...fields }) as LogFields) });
    (level === 'error' ? process.stderr : process.stdout).write(`${line}\n`);
  };
  return {
    debug: write('debug'),
    info: write('info'),
    warn: write('warn'),
    error: write('error'),
    child: (fields) => createLogger({ ...base, ...fields }, enabled),
  };
}

export const errorFields = (error: unknown): LogFields =>
  error instanceof Error ? { error: error.message, error_name: error.name, stack: error.stack } : { error: String(error) };
