/**
 * Diagnostic event types for the push notification pipeline.
 *
 * Connection lifecycle:
 * - sw_start: background service worker (re)started
 * - ws_open / ws_close / ws_error: WebSocket lifecycle
 * - hello_result: HELLO handshake response (uaidChanged flags server-side UAID rotation)
 * - register_result: channel registration response
 * - reconnect_scheduled / reconnect_giveup: reconnection state
 * - conn_snapshot: periodic connection state snapshot (deduplicated)
 *
 * Push pipeline (correlated by channelId+version, then programId):
 * - socket_received: notification frame arrived on the WebSocket
 * - ack_sent: ACK returned to AutoPush
 * - decrypt_ok / pipeline_error: payload decryption / processing result
 * - push_program: push processed to the end (notified/opened outcome)
 * - push_discard: push dropped before completion (reason field)
 *
 * Cross-check:
 * - push_missing: polling found a new following program with no corresponding push event
 */
export type PushDiagnosticsEventType =
  | "sw_start"
  | "ws_open"
  | "ws_close"
  | "ws_error"
  | "hello_result"
  | "register_result"
  | "reconnect_scheduled"
  | "reconnect_giveup"
  | "conn_snapshot"
  | "socket_received"
  | "ack_sent"
  | "decrypt_ok"
  | "pipeline_error"
  | "push_program"
  | "push_discard"
  | "push_missing";

export type PushDiagnosticsEventDetail = Record<string, string | number | boolean | undefined>;

export interface PushDiagnosticsEvent extends PushDiagnosticsEventDetail {
  ts: string; // ISO 8601
  type: PushDiagnosticsEventType;
}

export interface ConnectionSnapshot {
  enabled: boolean;
  connected: boolean;
  connectionState: string;
  uaid?: string;
}

/**
 * Persistent diagnostic log for isolating push notification losses.
 * Recording must never affect the push pipeline behavior (fire-and-forget, non-throwing).
 */
export interface PushDiagnostics {
  /**
   * Append an event to the persistent log (fire-and-forget)
   */
  record(type: PushDiagnosticsEventType, detail?: PushDiagnosticsEventDetail): void;

  /**
   * Record a connection state snapshot.
   * Writes only when the state changed, or as a periodic heartbeat while push is enabled.
   */
  recordConnectionSnapshot(snapshot: ConnectionSnapshot): void;

  /**
   * Check whether any push pipeline event referencing the program was recorded recently.
   * Used to detect pushes that never arrived (cross-check against polling).
   */
  hasRecentProgramPushEvent(programId: string, withinMs: number): Promise<boolean>;

  /**
   * Get all recorded events (oldest first)
   */
  getEvents(): Promise<PushDiagnosticsEvent[]>;
}
