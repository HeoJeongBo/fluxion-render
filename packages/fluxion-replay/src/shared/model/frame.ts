export interface ReplayFrame<T = unknown> {
  readonly t: number;
  readonly channelId: string;
  readonly payload: T;
}

export interface SerializedFrame {
  readonly t: number;
  readonly channelId: string;
  readonly payload: ArrayBuffer;
}
