export interface JobRunnerStatus { mode: 'fixture'; durableProcessingAvailable: false }
export const jobRunnerStatus: JobRunnerStatus = { mode: 'fixture', durableProcessingAvailable: false };
// Durable job handling is implemented in LM-046; this entry point has no provider credentials.
