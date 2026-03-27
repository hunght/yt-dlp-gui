import { z } from "zod";

export const MOBILE_SYNC_PROTOCOL_VERSION = 1;
export const MIN_SUPPORTED_DESKTOP_SYNC_PROTOCOL_VERSION = 1;
export const MIN_SUPPORTED_MOBILE_SYNC_PROTOCOL_VERSION = 1;

export const syncServerInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  videoCount: z.number().int().min(0),
  syncProtocolVersion: z.number().int().positive(),
  minSupportedMobileSyncProtocolVersion: z.number().int().positive(),
});

export type SyncServerInfo = z.infer<typeof syncServerInfoSchema>;
