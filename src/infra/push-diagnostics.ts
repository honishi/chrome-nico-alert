import {
  ConnectionSnapshot,
  PushDiagnostics,
  PushDiagnosticsEvent,
  PushDiagnosticsEventDetail,
  PushDiagnosticsEventType,
} from "../domain/infra-interface/push-diagnostics";

const STORAGE_KEY = "pushDiagnosticsLog";
const DEFAULT_MAX_EVENTS = 2000;
const DEFAULT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEFAULT_SNAPSHOT_HEARTBEAT_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Storage abstraction (injectable for tests)
 */
export interface DiagnosticsStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

/**
 * chrome.storage.local backend.
 * No-ops outside the extension runtime (e.g. Node.js unit tests) so that
 * importing modules can call the logger unconditionally.
 */
const chromeStorageBackend: DiagnosticsStorage = {
  async get(key: string): Promise<Record<string, unknown>> {
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      return {};
    }
    return chrome.storage.local.get([key]);
  },
  async set(items: Record<string, unknown>): Promise<void> {
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      return;
    }
    await chrome.storage.local.set(items);
  },
};

export interface PushDiagnosticsOptions {
  maxEvents?: number;
  retentionMs?: number;
  snapshotHeartbeatMs?: number;
}

export class PushDiagnosticsImpl implements PushDiagnostics {
  private readonly storage: DiagnosticsStorage;
  private readonly maxEvents: number;
  private readonly retentionMs: number;
  private readonly snapshotHeartbeatMs: number;

  // Serialize read-modify-write cycles so concurrent records don't lose events
  private writeQueue: Promise<void> = Promise.resolve();

  // Connection snapshot dedup state (in-memory; resets on service worker restart,
  // which conveniently records one snapshot per worker boot)
  private lastSnapshotKey?: string;
  private lastSnapshotAt = 0;

  constructor(
    storage: DiagnosticsStorage = chromeStorageBackend,
    options?: PushDiagnosticsOptions,
  ) {
    this.storage = storage;
    this.maxEvents = options?.maxEvents ?? DEFAULT_MAX_EVENTS;
    this.retentionMs = options?.retentionMs ?? DEFAULT_RETENTION_MS;
    this.snapshotHeartbeatMs = options?.snapshotHeartbeatMs ?? DEFAULT_SNAPSHOT_HEARTBEAT_MS;
  }

  record(type: PushDiagnosticsEventType, detail?: PushDiagnosticsEventDetail): void {
    const event: PushDiagnosticsEvent = {
      ...detail,
      ts: new Date().toISOString(),
      type,
    };
    this.writeQueue = this.writeQueue
      .then(() => this.append(event))
      .catch((e) => {
        console.warn("[PushDiagnostics] Failed to record event:", type, e);
      });
  }

  recordConnectionSnapshot(snapshot: ConnectionSnapshot): void {
    const key = JSON.stringify(snapshot);
    const now = Date.now();
    const unchanged = key === this.lastSnapshotKey;
    const withinHeartbeat = now - this.lastSnapshotAt < this.snapshotHeartbeatMs;
    // Skip when unchanged, unless push is enabled and the heartbeat interval elapsed.
    // While disabled, only state changes are recorded (no heartbeat noise).
    if (unchanged && (withinHeartbeat || !snapshot.enabled)) {
      return;
    }
    this.lastSnapshotKey = key;
    this.lastSnapshotAt = now;
    this.record("conn_snapshot", { ...snapshot });
  }

  async hasRecentProgramPushEvent(programId: string, withinMs: number): Promise<boolean> {
    if (!programId) {
      return false;
    }
    const events = await this.getEvents();
    const cutoff = Date.now() - withinMs;
    // Scan newest first: matches are most likely at the tail
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      const ts = Date.parse(event.ts);
      if (!Number.isNaN(ts) && ts < cutoff) {
        break;
      }
      if (event.programId === programId) {
        return true;
      }
    }
    return false;
  }

  async getEvents(): Promise<PushDiagnosticsEvent[]> {
    try {
      const result = await this.storage.get(STORAGE_KEY);
      const events = result[STORAGE_KEY];
      return Array.isArray(events) ? (events as PushDiagnosticsEvent[]) : [];
    } catch (e) {
      console.warn("[PushDiagnostics] Failed to read events:", e);
      return [];
    }
  }

  /**
   * Wait until all queued writes are flushed (for tests)
   */
  async flush(): Promise<void> {
    await this.writeQueue;
  }

  private async append(event: PushDiagnosticsEvent): Promise<void> {
    const events = await this.getEvents();
    events.push(event);
    const pruned = this.prune(events);
    await this.storage.set({ [STORAGE_KEY]: pruned });
  }

  private prune(events: PushDiagnosticsEvent[]): PushDiagnosticsEvent[] {
    const cutoff = Date.now() - this.retentionMs;
    return events
      .filter((event) => {
        const ts = Date.parse(event.ts);
        return Number.isNaN(ts) || ts >= cutoff;
      })
      .slice(-this.maxEvents);
  }
}

/**
 * Shorten AutoPush version tokens (~200 chars) for the event log.
 * The 32-char prefix contains enough entropy to correlate events per message.
 */
export function shortVersion(version: string | number | undefined): string | undefined {
  if (version === undefined) {
    return undefined;
  }
  return String(version).slice(0, 32);
}

/**
 * Shared singleton.
 * Infra-layer classes (AutoPushClient, WebPushManager) import this directly;
 * domain-layer classes receive the same instance via DI (InjectTokens.PushDiagnostics).
 */
export const pushDiagnostics = new PushDiagnosticsImpl();
