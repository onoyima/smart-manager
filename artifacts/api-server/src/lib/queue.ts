import { logger } from "./logger";

interface QueueJob {
  id: string;
  fn: () => Promise<void>;
  retries: number;
  maxRetries: number;
}

// Simple in-process FIFO queue with retry + exponential backoff
const RETRY_DELAYS_MS = [30_000, 120_000, 300_000]; // 30s, 2min, 5min

class AsyncJobQueue {
  private queue: QueueJob[] = [];
  private running = false;

  enqueue(id: string, fn: () => Promise<void>, maxRetries = 3): void {
    this.queue.push({ id, fn, retries: 0, maxRetries });
    if (!this.running) {
      void this.drain();
    }
  }

  private async drain(): Promise<void> {
    this.running = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      await this.run(job);
    }

    this.running = false;
  }

  private async run(job: QueueJob): Promise<void> {
    try {
      await job.fn();
      logger.info({ jobId: job.id }, "Queue job completed");
    } catch (err) {
      job.retries++;
      const log = logger.child({ jobId: job.id, attempt: job.retries });

      if (job.retries <= job.maxRetries) {
        const delayMs = RETRY_DELAYS_MS[job.retries - 1] ?? 300_000;
        log.warn({ err, delayMs }, "Queue job failed — retrying after delay");
        await new Promise((r) => setTimeout(r, delayMs));
        // Re-queue at front so it runs next
        this.queue.unshift(job);
      } else {
        log.error({ err }, "Queue job failed after max retries — sending to dead letter");
        // Dead letter: job is dropped; pipeline.ts already updated DB status
      }
    }
  }

  get length(): number {
    return this.queue.length;
  }
}

export const jobQueue = new AsyncJobQueue();
