let counter = 0;

/** A short, unique-enough idempotency key for one user intent. */
export function newRequestId(): string {
  counter += 1;
  return [
    Date.now().toString(36),
    counter.toString(36),
    Math.random().toString(36).slice(2, 10),
  ].join("-");
}
