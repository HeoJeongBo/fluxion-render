import type { BaseChannel } from "../../shared/model/base-channel";

export interface RosChannelOptions<T> {
  channelId: string;
  encode: (data: T) => ArrayBuffer;
  decode: (buffer: ArrayBuffer) => T;
  validate?: (data: unknown) => asserts data is T;
}

export class RosChannel<T> implements BaseChannel<T> {
  readonly kind = "ros";
  readonly channelId: string;
  readonly validate?: (data: unknown) => asserts data is T;
  private readonly _encode: (data: T) => ArrayBuffer;
  private readonly _decode: (buffer: ArrayBuffer) => T;

  constructor(opts: RosChannelOptions<T>) {
    this.channelId = opts.channelId;
    this._encode = opts.encode;
    this._decode = opts.decode;
    this.validate = opts.validate;
  }

  encode(data: T): ArrayBuffer {
    return this._encode(data);
  }

  decode(buffer: ArrayBuffer): T {
    return this._decode(buffer);
  }
}
