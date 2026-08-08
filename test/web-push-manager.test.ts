/**
 * WebPushManager canary probe lifecycle tests (single-flight, session
 * generation binding, reconciliation), driven by a fake AutoPushClient
 * and an in-memory chrome.storage.local.
 */

import "reflect-metadata";
import { WebPushManager } from "../src/infra/web-push-manager";

class FakeAutoPushClient {
  open = true;
  disconnected = false;
  registered: string[] = [];
  unregistered: string[] = [];
  configured: Array<{ channelId: string; endpoint: string }> = [];
  restarts = 0;
  registerGate?: Promise<void>;

  isConnectionOpen(): boolean {
    return this.open;
  }

  disconnect(): void {
    this.disconnected = true;
    this.open = false;
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
  subscriptionInfo?: { niconicoRegistered: boolean };
  ensureCanaryProbe(): Promise<void>;
  runExclusive<T>(task: () => Promise<T>): Promise<T>;
  registerToNiconico: (subscription: unknown) => Promise<boolean>;
  subscribeAndConnect: () => Promise<void>;
  getVapidPublicKey: () => Promise<Uint8Array>;
  connectAutoPush: (...args: unknown[]) => Promise<string>;
  executeViaContentScript: (operation: string, payload: unknown) => Promise<unknown>;
};

function internals(manager: WebPushManager): ManagerInternals {
  return manager as unknown as ManagerInternals;
}

let store: Record<string, unknown>;
let failNextSet: boolean;
let gateSet: Promise<void> | undefined;
let onSetStarted: (() => void) | undefined;

beforeEach(() => {
  store = {};
  failNextSet = false;
  gateSet = undefined;
  onSetStarted = undefined;
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
          if ("pushCanaryChannelId" in items) {
            onSetStarted?.();
            if (gateSet) {
              await gateSet;
            }
          }
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

function subscriptionFixture(): { niconicoRegistered: boolean } {
  return {
    endpoint: "https://updates.example.test/wpush/v2/main-channel",
    expirationTime: null,
    keys: { p256dh: "cDI1NmRoLWtleQ==", auth: "YXV0aC1rZXk=" },
    createdAt: new Date(),
    updatedAt: new Date(),
    niconicoRegistered: false,
  } as unknown as { niconicoRegistered: boolean };
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

  test("a setup superseded mid-flight hands off to the new session's client", async () => {
    const manager = new WebPushManager();
    const clientA = new FakeAutoPushClient();
    internals(manager).autoPush = clientA;
    let releaseRegister!: () => void;
    clientA.registerGate = new Promise((resolve) => {
      releaseRegister = resolve;
    });

    const setupA = internals(manager).ensureCanaryProbe();
    for (let i = 0; i < 50 && clientA.registered.length === 0; i++) {
      await flush();
    }
    expect(clientA.registered).toHaveLength(1);

    // The session is replaced while A's setup is still in flight; the new
    // session's ensure call must yield its own setup, not join A's
    const clientB = new FakeAutoPushClient();
    internals(manager).autoPush = clientB;
    const setupB = internals(manager).ensureCanaryProbe();
    releaseRegister();
    await Promise.all([setupA, setupB]);

    expect(clientA.configured).toHaveLength(0);
    expect(clientA.unregistered).toEqual(clientA.registered);
    expect(clientB.registered).toHaveLength(1);
    expect(clientB.configured).toHaveLength(1);
    expect(store.pushCanaryChannelId).toBe(clientB.registered[0]);
  });

  test("registerToNiconico reports failure instead of faking success", async () => {
    const manager = new WebPushManager();
    const subscription = subscriptionFixture();

    internals(manager).executeViaContentScript = async () => ({ success: false, status: 403 });
    await expect(internals(manager).registerToNiconico(subscription)).resolves.toBe(false);
    expect(subscription.niconicoRegistered).toBe(false);

    internals(manager).executeViaContentScript = async () => {
      throw new Error("tab could not be prepared");
    };
    await expect(internals(manager).registerToNiconico(subscription)).resolves.toBe(false);
    expect(subscription.niconicoRegistered).toBe(false);

    internals(manager).executeViaContentScript = async () => ({ success: true });
    await expect(internals(manager).registerToNiconico(subscription)).resolves.toBe(true);
    expect(subscription.niconicoRegistered).toBe(true);
  });

  test("subscription fails when Niconico registration fails, and a retry can succeed", async () => {
    const manager = new WebPushManager();
    internals(manager).getVapidPublicKey = async () => new Uint8Array(65);
    internals(manager).connectAutoPush = async () => {
      internals(manager).autoPush = new FakeAutoPushClient();
      return "uaid-test";
    };
    let niconicoAccepts = false;
    internals(manager).registerToNiconico = async (subscription) => {
      (subscription as { niconicoRegistered: boolean }).niconicoRegistered = niconicoAccepts;
      return niconicoAccepts;
    };

    await expect(internals(manager).subscribeAndConnect()).rejects.toThrow(/Niconico/);
    // State is saved so the retry can run without losing the AutoPush side
    expect(store.pushUaid).toBe("uaid-test");

    niconicoAccepts = true;
    await expect(internals(manager).subscribeAndConnect()).resolves.toBeUndefined();
  });

  test("start does not fast-path past a failed Niconico registration", async () => {
    const manager = new WebPushManager();
    const client = new FakeAutoPushClient();
    internals(manager).autoPush = client;
    internals(manager).subscriptionInfo = { niconicoRegistered: false };
    const subscribe = jest.fn(async () => {});
    internals(manager).subscribeAndConnect = subscribe;

    await manager.start();

    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  test("start fast-paths only when the session is fully registered", async () => {
    const manager = new WebPushManager();
    const client = new FakeAutoPushClient();
    internals(manager).autoPush = client;
    internals(manager).subscriptionInfo = { niconicoRegistered: true };
    const subscribe = jest.fn(async () => {});
    internals(manager).subscribeAndConnect = subscribe;

    await manager.start();

    expect(subscribe).not.toHaveBeenCalled();
  });

  test("reset disconnects an incomplete session's client", async () => {
    const manager = new WebPushManager();
    const client = new FakeAutoPushClient();
    internals(manager).autoPush = client; // subscriptionInfo stays undefined
    store.pushUaid = "uaid-test";
    store.pushChannelId = "main-channel";

    await manager.reset();

    expect(client.disconnected).toBe(true);
    expect(internals(manager).autoPush).toBeUndefined();
    expect(store.pushUaid).toBeUndefined();
    expect(store.pushChannelId).toBeUndefined();
  });

  test("lifecycle queue keeps serving after a failed operation", async () => {
    const manager = new WebPushManager();
    const order: string[] = [];

    const failing = internals(manager).runExclusive(async () => {
      order.push("first");
      throw new Error("boom");
    });
    const second = internals(manager).runExclusive(async () => {
      order.push("second");
    });

    await expect(failing).rejects.toThrow("boom");
    await second;
    expect(order).toEqual(["first", "second"]);
  });

  test("lifecycle operations run strictly in order", async () => {
    const manager = new WebPushManager();
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = internals(manager).runExclusive(async () => {
      order.push("first:start");
      await gate;
      order.push("first:end");
    });
    const second = internals(manager).runExclusive(async () => {
      order.push("second");
    });

    await flush();
    expect(order).toEqual(["first:start"]);
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(["first:start", "first:end", "second"]);
  });

  test("a reset during the storage write does not resurrect the old pair", async () => {
    const manager = new WebPushManager();
    const clientA = new FakeAutoPushClient();
    internals(manager).autoPush = clientA;
    let releaseSet!: () => void;
    gateSet = new Promise((resolve) => {
      releaseSet = resolve;
    });
    let setStarted = false;
    onSetStarted = () => {
      setStarted = true;
    };

    const setup = internals(manager).ensureCanaryProbe();
    for (let i = 0; i < 50 && !setStarted; i++) {
      await flush();
    }
    expect(setStarted).toBe(true);

    // reset() tears the session down and clears storage while the canary
    // pair write is still in flight
    internals(manager).autoPush = undefined;
    delete store.pushCanaryChannelId;
    delete store.pushCanaryEndpoint;
    releaseSet();
    await setup;

    expect(store.pushCanaryChannelId).toBeUndefined();
    expect(store.pushCanaryEndpoint).toBeUndefined();
    expect(clientA.unregistered).toEqual(clientA.registered);
    expect(clientA.configured).toHaveLength(0);
  });
});
