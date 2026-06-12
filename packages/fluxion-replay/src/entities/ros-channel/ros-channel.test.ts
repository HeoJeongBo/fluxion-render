import { describe, expect, it, vi } from "vitest";
import { RosChannel } from "./ros-channel";

interface PoseMsg {
  x: number;
  y: number;
  theta: number;
}

const jsonEncode = (data: PoseMsg): ArrayBuffer =>
  new TextEncoder().encode(JSON.stringify(data)).buffer as ArrayBuffer;

const jsonDecode = (buf: ArrayBuffer): PoseMsg =>
  JSON.parse(new TextDecoder().decode(buf)) as PoseMsg;

describe("RosChannel", () => {
  const channel = new RosChannel<PoseMsg>({
    channelId: "pose",
    encode: jsonEncode,
    decode: jsonDecode,
  });

  it("has correct channelId and kind", () => {
    expect(channel.channelId).toBe("pose");
    expect(channel.kind).toBe("ros");
  });

  it("round-trips a ROS message using provided encode/decode", () => {
    const msg: PoseMsg = { x: 1.5, y: -2.3, theta: 0.78 };
    const decoded = channel.decode(channel.encode(msg));
    expect(decoded).toEqual(msg);
  });

  it("delegates encode to the provided function", () => {
    const encodeFn = vi.fn(jsonEncode);
    const ch = new RosChannel<PoseMsg>({
      channelId: "test",
      encode: encodeFn,
      decode: jsonDecode,
    });
    const msg = { x: 0, y: 0, theta: 0 };
    ch.encode(msg);
    expect(encodeFn).toHaveBeenCalledWith(msg);
  });

  it("delegates decode to the provided function", () => {
    const decodeFn = vi.fn(jsonDecode);
    const ch = new RosChannel<PoseMsg>({
      channelId: "test",
      encode: jsonEncode,
      decode: decodeFn,
    });
    const buf = jsonEncode({ x: 1, y: 2, theta: 3 });
    ch.decode(buf);
    expect(decodeFn).toHaveBeenCalledWith(buf);
  });

  it("validate is undefined when not provided", () => {
    expect(channel.validate).toBeUndefined();
  });

  it("validate is called when provided", () => {
    const validateFn = vi.fn();
    const ch = new RosChannel<PoseMsg>({
      channelId: "test",
      encode: jsonEncode,
      decode: jsonDecode,
      validate: validateFn,
    });
    expect(ch.validate).toBe(validateFn);
  });
});
