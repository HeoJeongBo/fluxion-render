/**
 * Shared, rAF-throttled queue for spreading expensive host creation across frames.
 *
 * Mounting many `FluxionCanvas`es at once — an accordion section expanding, a
 * dashboard grid appearing — runs `new FluxionHost()` (OffscreenCanvas alloc +
 * `transferControlToOffscreen` handshake + `POOL_INIT` + first render) for each
 * in a single frame. That simultaneous burst spikes the main thread / GPU and
 * the page stutters for a beat. `enqueueMount` defers each creation and drains
 * at most `perFrame` per animation frame, fanning the work out over time so no
 * single frame carries the whole spike.
 *
 * Opt in per canvas with `staggerMount`; tune the rate with
 * `configureMountScheduler({ perFrame })`.
 */

type MountTask = () => void;

let perFrame = 4;
const queue: MountTask[] = [];
let scheduled = false;

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  // setTimeout fallback for non-DOM/worker contexts where rAF is absent.
  if (typeof requestAnimationFrame !== "undefined") {
    requestAnimationFrame(drain);
  } else {
    setTimeout(drain, 16);
  }
}

function drain(): void {
  scheduled = false;
  let ran = 0;
  while (queue.length > 0 && ran < perFrame) {
    const task = queue.shift() as MountTask;
    ran++;
    // A throwing task must not stop the drain — isolate and keep going so one
    // bad mount can't strand every later one in the queue.
    try {
      task();
    } catch (err) {
      console.error("[fluxion] mount task error:", err);
    }
  }
  // Still work left this batch couldn't cover → continue next frame.
  if (queue.length > 0) schedule();
}

/**
 * Queue a host-creation callback to run on a later frame (at most `perFrame`
 * run per frame). Returns a cancel function that removes the task if it has not
 * run yet — call it on unmount so a chart that disappears before its turn never
 * creates a host.
 */
export function enqueueMount(task: MountTask): () => void {
  queue.push(task);
  schedule();
  return () => {
    const i = queue.indexOf(task);
    if (i >= 0) queue.splice(i, 1);
  };
}

/**
 * Tune how many queued host creations run per animation frame. Higher = charts
 * appear faster but with a larger per-frame spike; lower = smoother but slower
 * to fill. Default 4. Ignored for non-positive values.
 */
export function configureMountScheduler(opts: { perFrame?: number }): void {
  if (opts.perFrame != null && opts.perFrame > 0) {
    perFrame = Math.floor(opts.perFrame);
  }
}

/** Drop all queued tasks and clear the pending-frame flag. Test-only — keeps
 *  the module-global queue from leaking across tests. */
export function _resetMountScheduler(): void {
  queue.length = 0;
  scheduled = false;
}
