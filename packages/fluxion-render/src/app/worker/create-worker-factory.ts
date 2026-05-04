export function createFluxionWorkerFactory(): () => Worker {
  return () =>
    new Worker(new URL("./fluxion-worker.js", import.meta.url), {
      type: "module",
    });
}
