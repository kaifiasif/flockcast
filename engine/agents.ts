/**
 * The agents (the rehearsal crowd and the launch crew) are Python, in agents/flockcast_agents. Node
 * owns accounts, storage, scopes and caps; for each job it starts one short-lived Python process,
 * writes the job to its stdin as JSON and reads progress and the answer back as JSON lines.
 *
 * The child gets a minimal environment: the model settings it needs, never the server's other secrets.
 * It opens no port, and it is killed if it runs past its time limit.
 */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import type { LlmConfig } from './llm.ts';

export type AgentJob = 'rehearse' | 'interview' | 'advise' | 'summarize';

/** A job that failed, with an HTTP-style status the caller can pass on. Messages are written for people. */
export class AgentError extends Error {
  override name = 'AgentError';
  readonly status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

export interface AgentsOptions {
  /** The model the agents call; null runs the labelled offline mode. */
  llm?: LlmConfig | null;
  /** The Python 3.10+ to run. Default: python3. */
  python?: string;
  /** Sent on every outside request; some hosts block the default Python one. */
  userAgent?: string;
  /** For the advisor's "web" source (Tavily's free tier). */
  tavilyKey?: string;
  timeoutMs?: Partial<Record<AgentJob, number>>;
}

export interface Agents {
  readonly llm: LlmConfig | null;
  run<T>(job: AgentJob, payload: unknown, onStage?: (status: string, progress: number) => void): Promise<T>;
}

const AGENTS_DIR = resolve(import.meta.dirname, '../agents');
const MAX_OUTPUT = 20_000_000;
// free tiers rate-limit per minute, and a long rehearsal makes a dozen calls with waits between them
const TIMEOUTS: Record<AgentJob, number> = { rehearse: 15 * 60_000, advise: 15 * 60_000, interview: 3 * 60_000, summarize: 60_000 };
/** Passed through so outbound calls work behind a corporate proxy or a custom CA. */
const PASSTHROUGH = ['PATH', 'HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'NO_PROXY', 'no_proxy', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'SYSTEMROOT'];

export function pythonAgents(opts: AgentsOptions = {}): Agents {
  const llm = opts.llm ?? null;
  const python = opts.python ?? 'python3';
  const env: Record<string, string> = { PYTHONPATH: AGENTS_DIR, PYTHONDONTWRITEBYTECODE: '1', PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' };
  for (const k of PASSTHROUGH) if (process.env[k]) env[k] = process.env[k] as string;
  if (opts.userAgent) env.FLOCKCAST_USER_AGENT = opts.userAgent;
  if (opts.tavilyKey) env.TAVILY_API_KEY = opts.tavilyKey;
  if (llm) Object.assign(env, { FLOCKCAST_LLM_PROVIDER: llm.provider, FLOCKCAST_LLM_MODEL: llm.model, FLOCKCAST_LLM_BASE_URL: llm.baseUrl, FLOCKCAST_LLM_API_KEY: llm.apiKey });

  return {
    llm,
    run<T>(job: AgentJob, payload: unknown, onStage?: (status: string, progress: number) => void): Promise<T> {
      return new Promise<T>((done, fail) => {
        const child = spawn(python, ['-m', 'flockcast_agents', job], { cwd: AGENTS_DIR, env, stdio: ['pipe', 'pipe', 'pipe'] });
        let buffered = '';
        let size = 0;
        let stderr = '';
        let settled = false;
        const finish = (err: AgentError | null, value?: T) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (child.exitCode === null) child.kill('SIGKILL');
          if (err) fail(err);
          else done(value as T);
        };
        const timer = setTimeout(() => finish(new AgentError('The agents took too long and were stopped. Try again with fewer rounds or people.', 504)), opts.timeoutMs?.[job] ?? TIMEOUTS[job]);

        const handle = (line: string) => {
          if (!line.trim()) return;
          let msg: { type?: string; status?: unknown; progress?: unknown; message?: unknown } & Record<string, unknown>;
          try {
            msg = JSON.parse(line);
          } catch {
            return;
          }
          if (msg.type === 'stage' && typeof msg.status === 'string') onStage?.(msg.status, Number(msg.progress) || 0);
          else if (msg.type === 'result') {
            const { type: _, ...rest } = msg;
            finish(null, rest as T);
          } else if (msg.type === 'error') finish(new AgentError(String(msg.message ?? 'The agents failed.').slice(0, 500), Number(msg.status) || 500));
        };
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
          size += chunk.length;
          if (size > MAX_OUTPUT) return finish(new AgentError('The agents sent back too much data.', 502));
          buffered += chunk;
          let nl = buffered.indexOf('\n');
          while (nl >= 0) {
            handle(buffered.slice(0, nl));
            buffered = buffered.slice(nl + 1);
            nl = buffered.indexOf('\n');
          }
        });
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', (chunk: string) => {
          stderr = (stderr + chunk).slice(-2000);
        });
        child.on('error', (e) => finish(new AgentError(`Could not start the Python agents with "${python}" (${(e as NodeJS.ErrnoException).code ?? e.message}). Install Python 3.10 or newer, or set FLOCKCAST_PYTHON.`, 500)));
        child.on('close', (code) => {
          if (buffered) handle(buffered);
          // the detail goes to the server log through onError, never to the person
          finish(Object.assign(new AgentError('The agents stopped without an answer.', 500), { detail: `exit ${code}: ${stderr.trim().slice(-500)}` }));
        });
        child.stdin.on('error', () => {});
        child.stdin.end(JSON.stringify(payload));
      });
    },
  };
}
