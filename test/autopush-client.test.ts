/**
 * Test suite for the AutoPushClient connection / timer state machine,
 * driven by a fake WebSocket and fake timers.
 */

import { AutoPushClient } from "../src/infra/autopush-client";

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  private pongedCount = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  onclose: ((event: { code: number; reason: string; wasClean: boolean }) => void) | null = null;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  static latest(): MockWebSocket {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1];
  }

  static reset(): void {
    MockWebSocket.instances = [];
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    // A locally initiated close; handlers are typically detached by the
    // client before calling this, so no close event is delivered
    this.readyState = MockWebSocket.CLOSED;
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  serverMessage(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  serverClose(code = 1006): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason: "", wasClean: false });
  }

  fireError(): void {
    this.onerror?.(new Error("socket error"));
  }

  helloCount(): number {
    return this.sent.filter((message) => message.includes('"messageType":"hello"')).length;
  }

  pingCount(): number {
    return this.sent.filter((message) => message === "{}").length;
  }

  respondPendingPings(): void {
    while (this.pongedCount < this.pingCount()) {
      this.pongedCount++;
      this.serverMessage({});
    }
  }
}

type ClientInternals = { reconnectAttempts: number; handleDisconnect: () => void };

function internals(client: AutoPushClient): ClientInternals {
  return client as unknown as ClientInternals;
}

async function establish(client: AutoPushClient, uaid = "uaid-1"): Promise<MockWebSocket> {
  const connectPromise = client.connect();
  const socket = MockWebSocket.latest();
  socket.open();
  await connectPromise;
  const helloPromise = client.sendHello(uaid, ["ch-1"]);
  socket.serverMessage({ messageType: "hello", status: 200, uaid });
  await helloPromise;
  return socket;
}

/**
 * Advance fake time while answering liveness pings, so the connection is
 * treated as alive throughout. Steps of 15s keep pong replies within the
 * 10s pong timeout (liveness checks run on a 30s grid).
 */
async function advanceAnsweringPings(ms: number, step = 15000): Promise<void> {
  let remaining = ms;
  while (remaining > 0) {
    const chunk = Math.min(step, remaining);
    await jest.advanceTimersByTimeAsync(chunk);
    remaining -= chunk;
    for (const socket of MockWebSocket.instances) {
      if (socket.readyState === MockWebSocket.OPEN) {
        socket.respondPendingPings();
      }
    }
  }
}

describe("AutoPushClient", () => {
  const originalWebSocket = (globalThis as { WebSocket?: unknown }).WebSocket;
  const originalFetch = (globalThis as { fetch?: unknown }).fetch;
  const fetchMock = jest.fn();

  beforeAll(() => {
    (globalThis as { WebSocket?: unknown }).WebSocket = MockWebSocket;
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
  });

  afterAll(() => {
    (globalThis as { WebSocket?: unknown }).WebSocket = originalWebSocket;
    (globalThis as { fetch?: unknown }).fetch = originalFetch;
  });

  beforeEach(() => {
    jest.useFakeTimers();
    MockWebSocket.reset();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ status: 201 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("connect resolves on open and HELLO establishes the session", async () => {
    const client = new AutoPushClient();
    const socket = await establish(client);

    expect(client.isConnectionOpen()).toBe(true);
    expect(client.getUaid()).toBe("uaid-1");
    expect(client.getChannelIds()).toEqual(["ch-1"]);
    expect(socket.helloCount()).toBe(1);

    client.disconnect();
  });

  test("a reassigned UAID requires repair and does not restore stale channels", async () => {
    const client = new AutoPushClient();
    const connectPromise = client.connect();
    const socket = MockWebSocket.latest();
    socket.open();
    await connectPromise;

    const helloPromise = client.sendHello("old-uaid", ["main-channel", "canary-channel"]);
    socket.serverMessage({ messageType: "hello", status: 200, uaid: "new-uaid" });
    await helloPromise;

    expect(client.isConnectionOpen()).toBe(true);
    expect(client.isSubscriptionRepairRequired()).toBe(true);
    expect(client.getConnectionStatusLabel()).toBe("REPAIR_REQUIRED");
    expect(client.getUaid()).toBe("new-uaid");
    expect(client.getChannelIds()).toEqual([]);

    client.configureCanaryProbe("canary-channel", "https://updates.example.test/canary");
    await jest.advanceTimersByTimeAsync(60000);
    expect(fetchMock).not.toHaveBeenCalled();

    client.disconnect();
  });

  test("sendHello rejects after 10 seconds without a response", async () => {
    const client = new AutoPushClient();
    const connectPromise = client.connect();
    MockWebSocket.latest().open();
    await connectPromise;

    const helloPromise = client.sendHello("uaid-1", ["ch-1"]);
    const assertion = expect(helloPromise).rejects.toThrow("Hello response timeout");
    await jest.advanceTimersByTimeAsync(10000);
    await assertion;

    client.disconnect();
  });

  test("onerror plus onclose schedules exactly one reconnection attempt", async () => {
    const client = new AutoPushClient();
    const socket = await establish(client);

    socket.fireError();
    socket.serverClose();
    // A duplicate disconnect signal for the same failure must be a no-op
    internals(client).handleDisconnect();

    expect(MockWebSocket.instances).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(1000);

    expect(MockWebSocket.instances).toHaveLength(2);
    expect(internals(client).reconnectAttempts).toBe(1);

    client.disconnect();
  });

  test("a stale pong timeout cannot tear down the next connection", async () => {
    const client = new AutoPushClient();
    const socketA = await establish(client);

    // Answer the initial post-HELLO ping, then idle past the 2-minute
    // liveness threshold so a liveness ping goes out unanswered
    await jest.advanceTimersByTimeAsync(1000);
    socketA.respondPendingPings();
    await jest.advanceTimersByTimeAsync(150000);
    expect(socketA.pingCount()).toBeGreaterThanOrEqual(2);

    // Connection drops while the 10s pong timer is still armed
    socketA.serverClose();
    await jest.advanceTimersByTimeAsync(1000);
    const socketB = MockWebSocket.latest();
    expect(socketB).not.toBe(socketA);
    socketB.open();
    await jest.advanceTimersByTimeAsync(0); // reconnect sends HELLO on socket B

    // Cross the stale pong deadline while socket B is still waiting for
    // its HELLO response (no inbound message has defused the timer yet)
    await jest.advanceTimersByTimeAsync(9000);

    expect(socketB.readyState).toBe(MockWebSocket.OPEN);
    expect(MockWebSocket.instances).toHaveLength(2);

    // The delayed handshake can now complete normally
    socketB.serverMessage({ messageType: "hello", status: 200, uaid: "uaid-1" });
    await jest.advanceTimersByTimeAsync(0);
    expect(client.isConnectionOpen()).toBe(true);

    client.disconnect();
  });

  test("a stale HELLO timeout does not tear down a newer authenticated socket", async () => {
    const client = new AutoPushClient();
    const socketA = await establish(client);

    // A drops; attempt R1 connects socket B and sends HELLO on it
    socketA.serverClose();
    await jest.advanceTimersByTimeAsync(1000);
    const socketB = MockWebSocket.latest();
    socketB.open();
    await jest.advanceTimersByTimeAsync(0);
    expect(socketB.helloCount()).toBe(1);

    // B drops before its HELLO response; attempt R2 (2s backoff) connects
    // socket C, whose HELLO succeeds
    socketB.serverClose();
    await jest.advanceTimersByTimeAsync(2000);
    const socketC = MockWebSocket.latest();
    expect(socketC).not.toBe(socketB);
    socketC.open();
    await jest.advanceTimersByTimeAsync(0);
    socketC.serverMessage({ messageType: "hello", status: 200, uaid: "uaid-1" });
    await jest.advanceTimersByTimeAsync(0);
    expect(client.isConnectionOpen()).toBe(true);

    // Socket B's 10s HELLO timeout now fires inside attempt R1; it must
    // not touch the healthy session that attempt R2 established
    await jest.advanceTimersByTimeAsync(10000);

    expect(socketC.readyState).toBe(MockWebSocket.OPEN);
    expect(client.isConnectionOpen()).toBe(true);
    expect(socketC.helloCount()).toBe(1);
    expect(MockWebSocket.instances).toHaveLength(3);

    client.disconnect();
  });

  test("a stale reconnect attempt does not send a second HELLO", async () => {
    const client = new AutoPushClient();
    const socket = await establish(client);

    // Stray disconnect signal while the session is healthy
    internals(client).handleDisconnect();
    await jest.advanceTimersByTimeAsync(2000);

    expect(socket.helloCount()).toBe(1);
    expect(MockWebSocket.instances).toHaveLength(1);

    client.disconnect();
  });

  test("disconnect stops reconnection", async () => {
    const client = new AutoPushClient();
    await establish(client);

    client.disconnect();
    await advanceAnsweringPings(11 * 60 * 1000);

    expect(MockWebSocket.instances).toHaveLength(1);
  });

  test("connect times out when the socket never opens", async () => {
    const client = new AutoPushClient();
    const connectPromise = client.connect();
    const assertion = expect(connectPromise).rejects.toThrow("WebSocket connect timeout");

    await jest.advanceTimersByTimeAsync(15000);
    await assertion;
    expect(MockWebSocket.latest().readyState).toBe(MockWebSocket.CLOSED);

    // After disconnect no reconnection or stray timer may survive
    client.disconnect();
    await jest.advanceTimersByTimeAsync(60000);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  test("a close while connecting settles the connect promise", async () => {
    const client = new AutoPushClient();
    const connectPromise = client.connect();
    const assertion = expect(connectPromise).rejects.toThrow("WebSocket closed during connect");

    MockWebSocket.latest().serverClose();
    await assertion;

    // The close routed through handleDisconnect and reconnection continues
    await jest.advanceTimersByTimeAsync(1000);
    expect(MockWebSocket.instances).toHaveLength(2);

    client.disconnect();
  });

  describe("canary probe", () => {
    const CANARY = "canary-1";
    const ENDPOINT = "https://updates.push.services.mozilla.com/wpush/v1/canary";

    async function establishWithCanary(client: AutoPushClient): Promise<MockWebSocket> {
      const socket = await establish(client);
      client.configureCanaryProbe(CANARY, ENDPOINT);
      return socket;
    }

    test("an answered probe is acked and kept out of the notification pipeline", async () => {
      const client = new AutoPushClient();
      const socket = await establishWithCanary(client);
      const notificationHandler = jest.fn();
      client.onMessage("notification", notificationHandler);

      await jest.advanceTimersByTimeAsync(60000);
      expect(fetchMock).toHaveBeenCalledWith(
        ENDPOINT,
        expect.objectContaining({ method: "POST", headers: { TTL: "0" } }),
      );

      socket.serverMessage({ messageType: "notification", channelID: CANARY, version: 7 });
      await jest.advanceTimersByTimeAsync(15000);

      expect(notificationHandler).not.toHaveBeenCalled();
      expect(
        socket.sent.some(
          (message) => message.includes('"messageType":"ack"') && message.includes(CANARY),
        ),
      ).toBe(true);
      expect(MockWebSocket.instances).toHaveLength(1);
      expect(client.isConnectionOpen()).toBe(true);

      client.disconnect();
    });

    test("a silent probe retries once and then forces a reconnect", async () => {
      const client = new AutoPushClient();
      const socketA = await establishWithCanary(client);

      await jest.advanceTimersByTimeAsync(60000); // probe 1 sent
      await jest.advanceTimersByTimeAsync(10000); // deadline -> immediate retry
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(10000); // retry deadline -> desync confirmed
      await jest.advanceTimersByTimeAsync(1000); // reconnect backoff

      expect(MockWebSocket.instances).toHaveLength(2);
      const socketB = MockWebSocket.latest();
      expect(socketB).not.toBe(socketA);
      expect(socketA.readyState).toBe(MockWebSocket.CLOSED);

      // The replacement session authenticates normally
      socketB.open();
      await jest.advanceTimersByTimeAsync(0);
      socketB.serverMessage({ messageType: "hello", status: 200, uaid: "uaid-1" });
      await jest.advanceTimersByTimeAsync(0);
      expect(client.isConnectionOpen()).toBe(true);

      client.disconnect();
    });

    test("a rejected probe POST does not trigger reconnection", async () => {
      fetchMock.mockResolvedValue({ status: 404 });
      const client = new AutoPushClient();
      await establishWithCanary(client);

      await advanceAnsweringPings(3 * 60 * 1000);

      expect(fetchMock).toHaveBeenCalled();
      expect(MockWebSocket.instances).toHaveLength(1);

      client.disconnect();
    });

    test("a stale probe deadline cannot tear down the next connection", async () => {
      const client = new AutoPushClient();
      const socketA = await establishWithCanary(client);

      // Probe goes out on socket A, which then drops before the deadline
      await jest.advanceTimersByTimeAsync(60000);
      socketA.serverClose();
      await jest.advanceTimersByTimeAsync(1000);
      const socketB = MockWebSocket.latest();
      expect(socketB).not.toBe(socketA);
      socketB.open();
      await jest.advanceTimersByTimeAsync(0);
      socketB.serverMessage({ messageType: "hello", status: 200, uaid: "uaid-1" });
      await jest.advanceTimersByTimeAsync(0);
      expect(client.isConnectionOpen()).toBe(true);

      // Cross the old probe deadline; the replacement session must survive
      await jest.advanceTimersByTimeAsync(9000);
      expect(client.isConnectionOpen()).toBe(true);
      expect(MockWebSocket.instances).toHaveLength(2);

      client.disconnect();
    });

    test("probing does not start without canary configuration", async () => {
      const client = new AutoPushClient();
      await establish(client);

      await advanceAnsweringPings(3 * 60 * 1000);

      expect(fetchMock).not.toHaveBeenCalled();
      client.disconnect();
    });

    test("a hanging probe POST still hits the deadline and reconnects", async () => {
      fetchMock.mockImplementation(() => new Promise(() => {}));
      const client = new AutoPushClient();
      await establishWithCanary(client);

      await jest.advanceTimersByTimeAsync(60000); // probe 1: POST never settles
      await jest.advanceTimersByTimeAsync(10000); // deadline -> immediate retry
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(10000); // retry deadline -> desync confirmed
      await jest.advanceTimersByTimeAsync(1000); // reconnect backoff

      expect(MockWebSocket.instances).toHaveLength(2);
      const socketB = MockWebSocket.latest();
      socketB.open();
      await jest.advanceTimersByTimeAsync(0);
      socketB.serverMessage({ messageType: "hello", status: 200, uaid: "uaid-1" });
      await jest.advanceTimersByTimeAsync(0);
      expect(client.isConnectionOpen()).toBe(true);

      // The wedged POSTs must not block probing on the replacement session
      await jest.advanceTimersByTimeAsync(60000);
      expect(fetchMock).toHaveBeenCalledTimes(3);

      client.disconnect();
    });

    test("a probe in flight when the connection drops does not wedge later probing", async () => {
      fetchMock.mockImplementation(() => new Promise(() => {}));
      const client = new AutoPushClient();
      const socketA = await establishWithCanary(client);

      await jest.advanceTimersByTimeAsync(60000); // probe 1: POST in flight
      expect(fetchMock).toHaveBeenCalledTimes(1);
      socketA.serverClose(); // connection drops before the probe deadline
      await jest.advanceTimersByTimeAsync(1000);
      const socketB = MockWebSocket.latest();
      expect(socketB).not.toBe(socketA);
      socketB.open();
      await jest.advanceTimersByTimeAsync(0);
      socketB.serverMessage({ messageType: "hello", status: 200, uaid: "uaid-1" });
      await jest.advanceTimersByTimeAsync(0);
      expect(client.isConnectionOpen()).toBe(true);

      // The stale pending probe was cleared with its session; the new
      // session probes on schedule
      await jest.advanceTimersByTimeAsync(60000);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(client.isConnectionOpen()).toBe(true);
      expect(MockWebSocket.instances).toHaveLength(2);

      client.disconnect();
    });

    test("an early canary answer before the POST resolves completes the probe", async () => {
      let resolvePost: ((value: { status: number }) => void) | undefined;
      fetchMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePost = resolve;
          }),
      );
      const client = new AutoPushClient();
      const socket = await establishWithCanary(client);

      await jest.advanceTimersByTimeAsync(60000); // probe 1: POST in flight
      // The notification can outrun the HTTP response
      socket.serverMessage({ messageType: "notification", channelID: CANARY, version: 1 });
      resolvePost?.({ status: 201 });
      await jest.advanceTimersByTimeAsync(20000); // cross the old deadline

      expect(MockWebSocket.instances).toHaveLength(1);
      expect(client.isConnectionOpen()).toBe(true);

      // The early answer fully settled probe 1; the next interval probes again
      await jest.advanceTimersByTimeAsync(40000);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      client.disconnect();
    });

    test("repeated probe misses within the cooldown do not reconnect again", async () => {
      const client = new AutoPushClient();
      await establishWithCanary(client);

      // First full miss cycle: reconnect
      await jest.advanceTimersByTimeAsync(60000);
      await jest.advanceTimersByTimeAsync(10000);
      await jest.advanceTimersByTimeAsync(10000);
      await jest.advanceTimersByTimeAsync(1000);
      expect(MockWebSocket.instances).toHaveLength(2);
      const socketB = MockWebSocket.latest();
      socketB.open();
      await jest.advanceTimersByTimeAsync(0);
      socketB.serverMessage({ messageType: "hello", status: 200, uaid: "uaid-1" });
      await jest.advanceTimersByTimeAsync(0);

      // Second full miss cycle lands within the 5-minute cooldown: no reconnect
      await jest.advanceTimersByTimeAsync(60000);
      await jest.advanceTimersByTimeAsync(10000);
      await jest.advanceTimersByTimeAsync(10000);
      await jest.advanceTimersByTimeAsync(2000);
      expect(MockWebSocket.instances).toHaveLength(2);
      expect(client.isConnectionOpen()).toBe(true);

      client.disconnect();
    });
  });
});
