/**
 * Test suite for PushDiagnosticsImpl (persistent push diagnostics log)
 */

import {
  DiagnosticsStorage,
  PushDiagnosticsImpl,
  PUSH_DIAGNOSTICS_ENABLED_KEY,
} from "../src/infra/push-diagnostics";
import { PushDiagnosticsEvent } from "../src/domain/infra-interface/push-diagnostics";

const STORAGE_KEY = "pushDiagnosticsLog";

class InMemoryStorage implements DiagnosticsStorage {
  private items: Record<string, unknown> = {};

  async get(key: string): Promise<Record<string, unknown>> {
    return key in this.items ? { [key]: this.items[key] } : {};
  }

  async set(items: Record<string, unknown>): Promise<void> {
    this.items = { ...this.items, ...items };
  }

  seed(events: PushDiagnosticsEvent[]): void {
    this.items[STORAGE_KEY] = events;
  }

  setValue(key: string, value: unknown): void {
    this.items[key] = value;
  }
}

function isoAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

describe("PushDiagnosticsImpl", () => {
  let storage: InMemoryStorage;
  let diagnostics: PushDiagnosticsImpl;

  beforeEach(() => {
    storage = new InMemoryStorage();
    storage.setValue(PUSH_DIAGNOSTICS_ENABLED_KEY, true);
    diagnostics = new PushDiagnosticsImpl(storage);
  });

  describe("record", () => {
    test("appends events with timestamp and type", async () => {
      diagnostics.record("ws_open");
      diagnostics.record("socket_received", { channelId: "ch-1", version: 42 });
      await diagnostics.flush();

      const events = await diagnostics.getEvents();
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe("ws_open");
      expect(Date.parse(events[0].ts)).not.toBeNaN();
      expect(events[1].type).toBe("socket_received");
      expect(events[1].channelId).toBe("ch-1");
      expect(events[1].version).toBe(42);
    });

    test("preserves order of concurrent records", async () => {
      for (let i = 0; i < 10; i++) {
        diagnostics.record("conn_snapshot", { seq: i });
      }
      await diagnostics.flush();

      const events = await diagnostics.getEvents();
      expect(events.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    test("caps events at maxEvents (drops oldest)", async () => {
      diagnostics = new PushDiagnosticsImpl(storage, { maxEvents: 3 });
      for (let i = 0; i < 5; i++) {
        diagnostics.record("conn_snapshot", { seq: i });
      }
      await diagnostics.flush();

      const events = await diagnostics.getEvents();
      expect(events.map((e) => e.seq)).toEqual([2, 3, 4]);
    });

    test("prunes events older than retention on write", async () => {
      storage.seed([
        { ts: isoAgo(10 * 60 * 1000), type: "ws_open", seq: 0 },
        { ts: isoAgo(1 * 60 * 1000), type: "ws_close", seq: 1 },
      ]);
      diagnostics = new PushDiagnosticsImpl(storage, { retentionMs: 5 * 60 * 1000 });

      diagnostics.record("ws_open", { seq: 2 });
      await diagnostics.flush();

      const events = await diagnostics.getEvents();
      expect(events.map((e) => e.seq)).toEqual([1, 2]);
    });

    test("does not record when the enabled flag is absent", async () => {
      storage = new InMemoryStorage();
      diagnostics = new PushDiagnosticsImpl(storage);

      diagnostics.record("ws_open");
      await diagnostics.flush();

      await expect(diagnostics.getEvents()).resolves.toHaveLength(0);
    });

    test("does not record when diagnostics are disabled", async () => {
      storage = new InMemoryStorage();
      storage.setValue(PUSH_DIAGNOSTICS_ENABLED_KEY, false);
      diagnostics = new PushDiagnosticsImpl(storage);

      diagnostics.record("ws_open");
      diagnostics.recordConnectionSnapshot({
        enabled: true,
        connected: true,
        connectionState: "CONNECTED",
      });
      await diagnostics.flush();

      await expect(diagnostics.getEvents()).resolves.toHaveLength(0);
    });

    test("does not reject the queue when storage fails", async () => {
      const failingStorage: DiagnosticsStorage = {
        get: async () => {
          throw new Error("storage broken");
        },
        set: async () => {
          throw new Error("storage broken");
        },
      };
      diagnostics = new PushDiagnosticsImpl(failingStorage);

      diagnostics.record("ws_open");
      await expect(diagnostics.flush()).resolves.toBeUndefined();
    });
  });

  describe("clearEvents", () => {
    test("removes all recorded events", async () => {
      diagnostics.record("ws_open");
      diagnostics.record("ws_close");
      await diagnostics.flush();
      await expect(diagnostics.getEvents()).resolves.toHaveLength(2);

      await diagnostics.clearEvents();

      await expect(diagnostics.getEvents()).resolves.toHaveLength(0);
    });

    test("clears even when recording is disabled", async () => {
      storage.seed([{ ts: isoAgo(1000), type: "ws_open" }]);
      storage.setValue(PUSH_DIAGNOSTICS_ENABLED_KEY, false);
      diagnostics = new PushDiagnosticsImpl(storage);

      await diagnostics.clearEvents();

      await expect(diagnostics.getEvents()).resolves.toHaveLength(0);
    });

    test("resets snapshot dedup so the next snapshot is recorded", async () => {
      const snapshot = { enabled: true, connected: true, connectionState: "CONNECTED" };
      diagnostics.recordConnectionSnapshot(snapshot);
      await diagnostics.flush();

      await diagnostics.clearEvents();
      diagnostics.recordConnectionSnapshot(snapshot);
      await diagnostics.flush();

      const events = await diagnostics.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("conn_snapshot");
    });
  });

  describe("recordConnectionSnapshot", () => {
    test("writes first snapshot and deduplicates unchanged ones", async () => {
      const snapshot = { enabled: true, connected: true, connectionState: "CONNECTED" };
      diagnostics.recordConnectionSnapshot(snapshot);
      diagnostics.recordConnectionSnapshot(snapshot);
      diagnostics.recordConnectionSnapshot(snapshot);
      await diagnostics.flush();

      const events = await diagnostics.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("conn_snapshot");
      expect(events[0].connected).toBe(true);
    });

    test("writes when the snapshot changes", async () => {
      diagnostics.recordConnectionSnapshot({
        enabled: true,
        connected: true,
        connectionState: "CONNECTED",
      });
      diagnostics.recordConnectionSnapshot({
        enabled: true,
        connected: false,
        connectionState: "DISCONNECTED",
      });
      await diagnostics.flush();

      const events = await diagnostics.getEvents();
      expect(events).toHaveLength(2);
      expect(events[1].connected).toBe(false);
    });

    test("writes unchanged snapshot again after heartbeat interval when enabled", async () => {
      diagnostics = new PushDiagnosticsImpl(storage, { snapshotHeartbeatMs: 0 });
      const snapshot = { enabled: true, connected: true, connectionState: "CONNECTED" };
      diagnostics.recordConnectionSnapshot(snapshot);
      diagnostics.recordConnectionSnapshot(snapshot);
      await diagnostics.flush();

      const events = await diagnostics.getEvents();
      expect(events).toHaveLength(2);
    });

    test("snapshots seen while disabled do not suppress the first snapshot after enabling", async () => {
      storage = new InMemoryStorage(); // Flag absent: diagnostics disabled
      diagnostics = new PushDiagnosticsImpl(storage);
      const snapshot = { enabled: true, connected: true, connectionState: "CONNECTED" };

      // Cold start: snapshot observed while disabled must not be persisted
      // and must not advance the dedup state
      diagnostics.recordConnectionSnapshot(snapshot);
      await diagnostics.flush();
      await expect(diagnostics.getEvents()).resolves.toHaveLength(0);

      // User enables diagnostics (storage write + onChanged notification)
      storage.setValue(PUSH_DIAGNOSTICS_ENABLED_KEY, true);
      diagnostics.applyEnabledFlag(true);

      diagnostics.recordConnectionSnapshot(snapshot);
      await diagnostics.flush();

      const events = await diagnostics.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("conn_snapshot");
    });

    test("suppresses heartbeat while disabled", async () => {
      diagnostics = new PushDiagnosticsImpl(storage, { snapshotHeartbeatMs: 0 });
      const snapshot = { enabled: false, connected: false, connectionState: "NOT_INITIALIZED" };
      diagnostics.recordConnectionSnapshot(snapshot);
      diagnostics.recordConnectionSnapshot(snapshot);
      await diagnostics.flush();

      const events = await diagnostics.getEvents();
      expect(events).toHaveLength(1);
    });
  });

  describe("hasRecentProgramPushEvent", () => {
    test("finds a recent event referencing the program", async () => {
      diagnostics.record("push_program", { programId: "lv123" });
      await diagnostics.flush();

      await expect(diagnostics.hasRecentProgramPushEvent("lv123", 60 * 1000)).resolves.toBe(true);
    });

    test("sees events still sitting in the write queue", async () => {
      diagnostics.record("push_program", { programId: "lv123" });
      // No flush: the check itself must wait for pending writes
      await expect(diagnostics.hasRecentProgramPushEvent("lv123", 60 * 1000)).resolves.toBe(true);
    });

    test("returns false when no event references the program", async () => {
      diagnostics.record("push_program", { programId: "lv999" });
      await diagnostics.flush();

      await expect(diagnostics.hasRecentProgramPushEvent("lv123", 60 * 1000)).resolves.toBe(false);
    });

    test("ignores events older than the window", async () => {
      storage.seed([{ ts: isoAgo(10 * 60 * 1000), type: "push_program", programId: "lv123" }]);

      await expect(diagnostics.hasRecentProgramPushEvent("lv123", 60 * 1000)).resolves.toBe(false);
      await expect(diagnostics.hasRecentProgramPushEvent("lv123", 20 * 60 * 1000)).resolves.toBe(
        true,
      );
    });

    test("returns false for empty programId", async () => {
      diagnostics.record("push_discard", { programId: "" });
      await diagnostics.flush();

      await expect(diagnostics.hasRecentProgramPushEvent("", 60 * 1000)).resolves.toBe(false);
    });

    test("matches discard events too", async () => {
      diagnostics.record("push_discard", { reason: "stale", programId: "lv123" });
      await diagnostics.flush();

      await expect(diagnostics.hasRecentProgramPushEvent("lv123", 60 * 1000)).resolves.toBe(true);
    });
  });
});
