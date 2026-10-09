import { errorFields, type Logger } from './logger.ts';

/**
 * In-process background jobs (transcription, claim extraction, drafting, agents).
 *
 * Each job owns its failure handling: it records the failure on its own row (status = 'failed').
 * This runner only guarantees that a job that crashes anyway is logged, never silently lost,
 * and lets tests and shutdown wait until everything in flight has finished.
 */
export interface JobRunner {
  enqueue(name: string, job: () => Promise<unknown>): void;
  idle(): Promise<void>;
  readonly pending: number;
}

export function createJobRunner(log: Logger): JobRunner {
  const inFlight = new Set<Promise<unknown>>();

  return {
    enqueue(name, job) {
      const started = Date.now();
      const promise = Promise.resolve()
        .then(job)
        .catch((error: unknown) => log.error('job_crashed', { job: name, ms: Date.now() - started, ...errorFields(error) }));
      inFlight.add(promise);
      void promise.finally(() => inFlight.delete(promise));
    },
    async idle() {
      while (inFlight.size) await Promise.all([...inFlight]);
    },
    get pending() {
      return inFlight.size;
    },
  };
}
