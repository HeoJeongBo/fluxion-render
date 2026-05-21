export interface ChannelSchema {
  readonly channelId: string;
  readonly kind: string;
}

export interface BaseChannel<T> extends ChannelSchema {
  encode(data: T): ArrayBuffer;
  decode(buffer: ArrayBuffer): T;
  validate?(data: unknown): asserts data is T;
}
