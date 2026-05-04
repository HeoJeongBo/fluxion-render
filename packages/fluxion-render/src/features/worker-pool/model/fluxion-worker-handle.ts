import { WorkerHandle } from "@heojeongbo/fluxion-worker";

import type { HostMsg, InitMsg, PoolDisposeMsg, PoolInitMsg } from "../../../shared/protocol";
import { Op } from "../../../shared/protocol";

export class FluxionWorkerHandle extends WorkerHandle<HostMsg> {
  constructor(
    worker: Worker,
    hostId: string,
    onRelease?: () => void,
  ) {
    super(worker, hostId, onRelease);
  }

  override postMessage(msg: HostMsg, transfer?: Transferable[]): void {
    if (msg.op === Op.INIT) {
      const m = msg as InitMsg;
      const poolMsg: PoolInitMsg = {
        op: Op.POOL_INIT,
        hostId: this.hostId,
        canvas: m.canvas,
        width: m.width,
        height: m.height,
        dpr: m.dpr,
        bgColor: m.bgColor,
      };
      this._worker.postMessage(poolMsg, transfer ?? []);
      return;
    }

    if (msg.op === Op.DISPOSE) {
      const poolMsg: PoolDisposeMsg = { op: Op.POOL_DISPOSE, hostId: this.hostId };
      this._worker.postMessage(poolMsg);
      this.release();
      return;
    }

    super.postMessage(msg, transfer);
  }
}
