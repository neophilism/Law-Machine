export const jobCapabilities: readonly string[] = [];
export function requireJob(kind: string): never { throw new Error(`UNSUPPORTED_JOB: ${kind}`); }
