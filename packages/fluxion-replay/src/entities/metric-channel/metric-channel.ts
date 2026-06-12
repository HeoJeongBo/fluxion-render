import type { BaseChannel } from "../../shared/model/base-channel";

export interface MetricSample {
  name: string;
  value: number;
  unit?: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class MetricChannel implements BaseChannel<MetricSample> {
  readonly kind = "metric";

  constructor(readonly channelId: string) {}

  encode(data: MetricSample): ArrayBuffer {
    const nameBytes = encoder.encode(data.name);
    const unitBytes = data.unit ? encoder.encode(data.unit) : new Uint8Array(0);
    // Layout: [f64 value (8)] [u16 nameLen (2)] [u16 unitLen (2)] [name bytes] [unit bytes]
    const buf = new ArrayBuffer(8 + 2 + 2 + nameBytes.byteLength + unitBytes.byteLength);
    const view = new DataView(buf);
    view.setFloat64(0, data.value, true);
    view.setUint16(8, nameBytes.byteLength, true);
    view.setUint16(10, unitBytes.byteLength, true);
    new Uint8Array(buf, 12, nameBytes.byteLength).set(nameBytes);
    if (unitBytes.byteLength > 0) {
      new Uint8Array(buf, 12 + nameBytes.byteLength, unitBytes.byteLength).set(unitBytes);
    }
    return buf;
  }

  decode(buffer: ArrayBuffer): MetricSample {
    const view = new DataView(buffer);
    const value = view.getFloat64(0, true);
    const nameLen = view.getUint16(8, true);
    const unitLen = view.getUint16(10, true);
    const name = decoder.decode(new Uint8Array(buffer, 12, nameLen));
    const unit =
      unitLen > 0
        ? decoder.decode(new Uint8Array(buffer, 12 + nameLen, unitLen))
        : undefined;
    return unit !== undefined ? { name, value, unit } : { name, value };
  }
}
