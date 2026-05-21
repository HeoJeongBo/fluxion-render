import type { BaseChannel } from "../../shared/model/base-channel";

export interface VideoFrameInfo {
  opfsPath: string;
  isKeyframe: boolean;
  durationUs: number;
  byteLength: number;
}

export class VideoChannel implements BaseChannel<VideoFrameInfo> {
  readonly kind = "video";

  constructor(readonly channelId: string) {}

  encode(data: VideoFrameInfo): ArrayBuffer {
    return new TextEncoder().encode(JSON.stringify(data)).buffer as ArrayBuffer;
  }

  decode(buffer: ArrayBuffer): VideoFrameInfo {
    return JSON.parse(new TextDecoder().decode(buffer)) as VideoFrameInfo;
  }
}
