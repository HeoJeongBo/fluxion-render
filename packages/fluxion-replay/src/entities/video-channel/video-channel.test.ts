import { describe, expect, it } from "vitest";
import { VideoChannel } from "./video-channel";

describe("VideoChannel", () => {
  const channel = new VideoChannel("front-camera");

  it("has correct channelId and kind", () => {
    expect(channel.channelId).toBe("front-camera");
    expect(channel.kind).toBe("video");
  });

  it("round-trips a keyframe info", () => {
    const info = {
      opfsPath: "video/front-camera/1000.chunk",
      isKeyframe: true,
      durationUs: 33333,
      byteLength: 4096,
      codedWidth: 1280,
      codedHeight: 720,
    };
    expect(channel.decode(channel.encode(info))).toEqual(info);
  });

  it("round-trips a delta frame info", () => {
    const info = {
      opfsPath: "video/front-camera/1033.chunk",
      isKeyframe: false,
      durationUs: 33333,
      byteLength: 512,
      codedWidth: 1280,
      codedHeight: 720,
    };
    expect(channel.decode(channel.encode(info))).toEqual(info);
  });
});
