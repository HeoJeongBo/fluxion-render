import { useCallback, useEffect, useRef, useState } from "react";

export interface UseDisplayMediaResult {
  /** The active MediaStream, or null when not capturing. */
  stream: MediaStream | null;
  /** Request screen capture. Resolves with the stream or throws on denial. */
  start: (constraints?: DisplayMediaStreamOptions) => Promise<MediaStream>;
  /** Stop all tracks and clear the stream. */
  stop: () => void;
}

/**
 * Manages a `getDisplayMedia` screen-capture stream.
 * Automatically stops when the component unmounts.
 *
 * @example
 * const { stream, start, stop } = useDisplayMedia();
 * // Attach to a <video> element:
 * useEffect(() => {
 *   if (videoRef.current && stream) videoRef.current.srcObject = stream;
 * }, [stream]);
 */
export function useDisplayMedia(): UseDisplayMediaResult {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  const start = useCallback(
    async (constraints?: DisplayMediaStreamOptions): Promise<MediaStream> => {
      stop(); // clear any existing stream first
      const s = await navigator.mediaDevices.getDisplayMedia(
        constraints ?? {
          video: { frameRate: 30 } as MediaTrackConstraints,
          audio: false,
        },
      );
      streamRef.current = s;
      setStream(s);
      // Auto-stop when the user ends sharing via browser UI
      s.getVideoTracks()[0]?.addEventListener("ended", stop, { once: true });
      return s;
    },
    [stop],
  );

  // Cleanup on unmount
  useEffect(
    () => () => {
      stop();
    },
    [stop],
  );

  return { stream, start, stop };
}
