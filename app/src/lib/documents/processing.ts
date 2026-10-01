import "server-only";

/** Match the two-minute lease enforced by claim_import_processing. */
export function processingCutoff() {
  return new Date(Date.now() - 120000).toISOString();
}

export function processingExpired(startedAt: string) {
  return new Date(startedAt).getTime() < new Date(processingCutoff()).getTime();
}
