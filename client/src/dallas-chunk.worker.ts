import { preparationOptions, prepareDallasChunk, preparedTransfers, type PreparationConfig, type PreparationJob, type PreparationReply } from './dallas-chunk-preparation';
let options: ReturnType<typeof preparationOptions> | undefined;
self.onmessage = (event: MessageEvent<{ config: PreparationConfig } | PreparationJob>) => {
  if ('config' in event.data) { options = preparationOptions(event.data.config); return; }
  const job = event.data;
  try {
    if (!options) throw new Error('Dallas worker not initialized');
    const result = prepareDallasChunk(job, options);
    self.postMessage({ id: job.id, result } satisfies PreparationReply, { transfer: preparedTransfers(result) });
  } catch (error) {
    self.postMessage({ id: job.id, error: String(error) } satisfies PreparationReply);
  }
};
