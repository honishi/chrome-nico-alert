/**
 * WebPushManager canary probe lifecycle tests (single-flight, session
 * generation binding, reconciliation), driven by a fake AutoPushClient
 * and an in-memory chrome.storage.local.
 */

import "reflect-metadata";
import { WebPushManager } from "../src/infra/web-push-manager";

class FakeAutoPushClient {
  open = true;
  registered: string[] = [];
  unregistered: string[] = [];
  configured: Array<{ channelId: string; endpoint: string }> = [];
  restarts = 0;
  registerGate?: Promise<void>;

  isConnectionOpen(): boolean {
    return this.open;
  }

  async registerChannel(channelId: string): Promise<{ pushEndpoint?: string }> {
    this.registered.push(channelId);
    if (this.registerGate) {
      await this.registerGate;
    }
    return { pushEndpoint: `https://updates.example.test/wpush/v1/${channelId}` };
  }

  async unregisterChannel(channelId: string): Promise<void> {
    this.unregistered.push(channelId);
  }

  configureCanaryProbe(channelId: string, endpoint: string): void {
    this.configured.push({ channelId, endpoint });
  }

  restartSession(): void {
    this.restarts++;
  }
}

type ManagerInternals = {
  autoPush?: FakeAutoPushClient;
  ensureCanaryProbe(): Promise<void>;
};

function internals(manager: WebPushManager): ManagerInternals {
  return manager as unknown as ManagerInternals;
}

let store: Record<string, unknown>;
let failNextSet: boolean;

beforeEach(() => {
  store = {};
  failNextSet = false;
  (globalThis as { chrome?: unknown }).chrome = {
    storage: {
      local: {
        get: async (keys: string[]) => {
          const result: Record<string, unknown> = {};
          for (const key of keys) {
            if (key in store) {
              result[key] = store[key];
            }
          }
          return result;
        },
        set: async (items: Record<string, unknown>) => {
          if (failNextSet) {
            failNextSet = false;
            throw new Error("quota exceeded");
          }
          Object.assign(store, items);
        },
        remove: async (keys: string[]) => {
          for (const key of keys) {
            delete store[key];
          }
        },
      },
    },
  };
});

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome;
});

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("WebPushManager canary probe setup", () => {
  test("concurrent setups register exactly one canary channel", async () => {
    const manager = new WebPushManager();
    const client = new FakeAutoPushClient();
    internals(manager).autoPush = client;

    await Promise.all([
      internals(manager).ensureCanaryProbe(),
      internals(manager).ensureCanaryProbe(),
    ]);

    expect(client.registered).toHaveLength(1);
    expect(client.configured).toHaveLength(1);
    expect(store.pushCanaryChannelId).toBe(client.registered[0]);
    expect(store.pushCanaryEndpoint).toContain(client.registered[0]);
  });

  test("a saved pair is reused without registering", async () => {
    store.pushCanaryChannelId = "saved-canary";
    store.pushCanaryEndpoint = "https://updates.example.test/wpush/v1/saved-canary";
    const manager = new WebPushManager();
    const client = new FakeAutoPushClient();
    internals(manager).autoPush = client;

    await internals(manager).ensureCanaryProbe();

    expect(client.registered).toHaveLength(0);
    expect(client.configured).toEqual([
      {
        channelId: "saved-canary",
        endpoint: "https://updates.example.test/wpush/v1/saved-canary",
      },
    ]);
  });

  test("a partial saved pair is reconciled before registering anew", async () => {
    store.pushCanaryChannelId = "orphan-canary"; // endpoint never got saved
    const manager = new WebPushManager();
    const client = new FakeAutoPushClient();
    internals(manager).autoPush = client;

    await internals(manager).ensureCanaryProbe();

    expect(client.unregistered).toContain("orphan-canary");
    expect(client.registered).toHaveLength(1);
    expect(store.pushCanaryChannelId).toBe(client.registered[0]);
    expect(store.pushCanaryEndpoint).toBeDefined();
  });

  test("a session replaced during registration is rolled back, not configured", async () => {
    const manager = new WebPushManager();
    const client = new FakeAutoPushClient();
    internals(manager).autoPush = client;
    let releaseRegister!: () => void;
    client.registerGate = new Promise((resolve) => {
      releaseRegister = resolve;
    });

    const setup = internals(manager).ensureCanaryProbe();
    for (let i = 0; i < 50 && client.registered.length === 0; i++) {
      await flush();
    }
    expect(client.registered).toHaveLength(1);
    internals(manager).autoPush = undefined; // stop()/reset() replaced the session
    releaseRegister();
    await setup;

    expect(client.configured).toHaveLength(0);
    expect(client.unregistered).toEqual(client.registered);
    expect(store.pushCanaryChannelId).toBeUndefined();
    expect(store.pushCanaryEndpoint).toBeUndefined();
  });

  test("a failed save rolls back and restarts the session", async () => {
    const manager = new WebPushManager();
    const client = new FakeAutoPushClient();
    internals(manager).autoPush = client;
    failNextSet = true;

    await internals(manager).ensureCanaryProbe();

    expect(client.unregistered).toEqual(client.registered);
    expect(client.restarts).toBe(1);
    expect(client.configured).toHaveLength(0);
    expect(store.pushCanaryChannelId).toBeUndefined();
  });
});
