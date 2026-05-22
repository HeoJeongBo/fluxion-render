/**
 * Extracts a union of channel IDs from a readonly channel array.
 *
 * @example
 * const CHANNELS = [new LogChannel("system"), new MetricChannel("cpu")] as const;
 * type MyChannelId = ChannelId<typeof CHANNELS>; // "system" | "cpu"
 */
export type ChannelId<C extends readonly { readonly channelId: string }[]> =
  C[number]["channelId"];
