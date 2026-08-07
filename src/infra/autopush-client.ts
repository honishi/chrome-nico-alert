import { pushDiagnostics, shortVersion } from "./push-diagnostics";

// Type definitions
interface HelloResponse {
  messageType: string;
  status: number;
  uaid: string;
  use_webpush?: boolean;
}

interface RegisterMessage {
  messageType: string;
  channelID: string;
  key?: string;
}

interface RegisterResponse {
  messageType: string;
  status: number;
  channelID: string;
  pushEndpoint?: string;
}

interface NotificationMessage {
  messageType?: string;
  channelID?: string;
  version?: number;
  data?: string;
  headers?: Record<string, unknown>;
}

interface MessageData {
  messageType?: string;
  status?: number;
  uaid?: string;
  use_webpush?: boolean;
  channelID?: string;
  pushEndpoint?: string;
  version?: number;
  data?: string;
  headers?: Record<string, unknown>;
}

/**
 * AutoPush (Mozilla Push Service) client
 * Receives Push notifications via WebSocket
 */
export class AutoPushClient {
  // WebSocket related
  private ws?: WebSocket;
  private readonly endpoint: string;

  // Connection state management
  private isConnected = false;
  private intentionalDisconnect = false;

  // Reconnection management
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 2025; // roughly 1 week of retries (capped at 5 min interval)
  private reconnectDelay = 1000; // ms
  private maxReconnectDelay = 300000; // ms
  private reconnectTimer?: NodeJS.Timeout;
  private stateCheckInterval?: NodeJS.Timeout;

  // Connect rate limiting
  private connectCallTimestamps: number[] = [];
  private readonly maxConnectCallsPerHour = 100;
  private lastConnectedAt?: Date;

  // Liveness watchdog (half-open connection detection)
  private lastActivityAt = Date.now();
  private lastLivenessPingAt = 0;
  private pongTimer?: NodeJS.Timeout;
  private readonly idlePingThresholdMs = 2 * 60 * 1000; // ping after 2 min without inbound traffic
  private readonly pongTimeoutMs = 10 * 1000; // reconnect if no reply within 10 s
  private readonly minLivenessPingIntervalMs = 60 * 1000; // AutoPush forbids pings more often than 1/min

  // Proactive connection cycling (desync mitigation)
  private cycleReconnectTimer?: NodeJS.Timeout;
  private readonly connectionMaxLifetimeMs = 5 * 60 * 1000; // replace the connection every 5 min

  // Test utilities
  private testAutoCloseTimer?: NodeJS.Timeout;
  private testAutoCloseMs?: number;

  // Authentication and channel management
  private uaid?: string;
  private channelIds: string[] = [];
  private pendingChannelIds?: string[];
  private lastHelloSentUaid?: string; // For diagnostics: detect server-side UAID rotation

  // Message handlers
  private messageHandlers: Map<string, (data: unknown) => void> = new Map();

  // Async operation management
  private pendingOperations: Map<
    string,
    { resolve: (value: unknown) => void; reject: (reason: unknown) => void }
  > = new Map();

  constructor(endpoint: string = "wss://push.services.mozilla.com") {
    this.endpoint = endpoint;
  }

  // ==================== Public Methods (Status Check) ====================

  /**
   * Check connection status
   */
  isConnectionOpen(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Return WebSocket connection state
   */
  get connectionState(): string {
    if (!this.ws) return "NO_SOCKET";
    const states = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    return states[this.ws.readyState];
  }

  /**
   * Enable test auto-close after given minutes (default: 1)
   * Call before connect(). For testing only.
   */
  enableTestAutoClose(minutes = 1): void {
    this.testAutoCloseMs = minutes * 60 * 1000;
  }

  /**
   * Get WebSocket connection status label
   */
  getConnectionStatusLabel(): string {
    if (!this.ws) return "NO_SOCKET";
    if (this.ws.readyState === WebSocket.OPEN && this.uaid) return "AUTHENTICATED";
    if (this.ws.readyState === WebSocket.OPEN) return "CONNECTED";
    if (this.ws.readyState === WebSocket.CONNECTING) return "CONNECTING";
    if (this.ws.readyState === WebSocket.CLOSING) return "CLOSING";
    return "CLOSED";
  }

  /**
   * Get UAID
   */
  getUaid(): string | undefined {
    return this.uaid;
  }

  /**
   * Get list of registered channel IDs
   */
  getChannelIds(): string[] {
    return [...this.channelIds];
  }

  /**
   * Get connection metrics including rate limit info
   */
  getConnectionStatus(): {
    currentAttempts: number;
    maxAttempts: number;
    lastAttemptTime?: Date;
    lastConnectedTime?: Date;
  } {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    // Filter for attempts within the last hour
    const recentAttempts = this.connectCallTimestamps.filter((ts) => ts > oneHourAgo);

    // Get the most recent attempt time
    const lastAttemptTime =
      this.connectCallTimestamps.length > 0
        ? new Date(Math.max(...this.connectCallTimestamps))
        : undefined;

    return {
      currentAttempts: recentAttempts.length,
      maxAttempts: this.maxConnectCallsPerHour,
      lastAttemptTime,
      lastConnectedTime: this.lastConnectedAt,
    };
  }

  // ==================== Public Methods (Connection Management) ====================

  /**
   * Connect to Mozilla Push Service
   */
  async connect(): Promise<void> {
    // Check connect rate limit before proceeding
    this.checkAndEnforceConnectRateLimit();

    // Skip if already connecting or connected
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)
    ) {
      console.log("WebSocket already connecting or connected");

      // Wait for connection to complete. Must settle in every case: the
      // socket can also go CLOSING/CLOSED here, and an unsettled promise
      // would leave the caller (and its reconnection chain) hanging forever
      if (this.ws.readyState === WebSocket.CONNECTING) {
        const CONNECT_WAIT_TIMEOUT_MS = 15000;
        await new Promise<void>((resolve, reject) => {
          const startedAt = Date.now();
          const checkInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              clearInterval(checkInterval);
              resolve();
            } else if (!this.ws || this.ws.readyState !== WebSocket.CONNECTING) {
              clearInterval(checkInterval);
              reject(new Error("WebSocket closed while waiting for connection"));
            } else if (Date.now() - startedAt > CONNECT_WAIT_TIMEOUT_MS) {
              clearInterval(checkInterval);
              reject(new Error("Timed out waiting for WebSocket connection"));
            }
          }, 100);
        });
      }
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        console.log(`Connecting to AutoPush service: ${this.endpoint}`);
        // Capture the socket so every handler can verify it still owns the
        // shared state; a handler firing late on a replaced (stale) socket
        // must not mutate the current connection or trigger reconnection
        const socket = new WebSocket(this.endpoint);
        this.ws = socket;

        socket.onopen = () => {
          if (this.ws !== socket) {
            // Superseded while connecting; abandon this socket
            try {
              socket.close();
            } catch (e) {
              console.error("[AutoPush] Failed to close superseded socket:", e);
            }
            reject(new Error("WebSocket superseded during connect"));
            return;
          }
          console.log("[AutoPush] ✅ WebSocket OPENED");
          console.log("[AutoPush] Connected to:", this.endpoint);
          pushDiagnostics.record("ws_open");
          this.isConnected = true;
          this.lastConnectedAt = new Date();
          this.lastActivityAt = Date.now();

          // Clear and reset state check timer
          if (this.stateCheckInterval) {
            clearInterval(this.stateCheckInterval);
          }
          this.stateCheckInterval = setInterval(() => {
            if (this.ws) {
              const state = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"][this.ws.readyState];
              console.log(
                `[AutoPush] WebSocket state check: ${state} (${new Date().toISOString()})`,
              );
            }
            this.checkLiveness();
          }, 30000); // Every 30 seconds

          resolve();
        };

        socket.onmessage = (event) => {
          if (this.ws !== socket) {
            return;
          }
          // Any inbound traffic proves the connection is alive
          this.lastActivityAt = Date.now();
          clearTimeout(this.pongTimer);
          this.pongTimer = undefined;
          try {
            const message = JSON.parse(event.data);
            console.log(
              "[AutoPush] ← Received",
              message.messageType ? message.messageType.toUpperCase() : "UNKNOWN",
              ":",
              message,
            );
            this.handleMessage(message);
          } catch (error) {
            console.error("[AutoPush] Failed to parse message:", error);
          }
        };

        socket.onerror = (error) => {
          console.error("[AutoPush] ❌ WebSocket ERROR:", error);
          pushDiagnostics.record("ws_error");
          if (this.ws === socket) {
            this.isConnected = false;
          }
          // Always settle this connect attempt's promise
          reject(error);
        };

        socket.onclose = (event) => {
          if (this.ws !== socket) {
            return;
          }
          console.log("[AutoPush] ❌ WebSocket CLOSED");
          console.log("[AutoPush] Close details:", {
            code: event.code,
            reason: event.reason || "(no reason provided)",
            wasClean: event.wasClean,
          });
          pushDiagnostics.record("ws_close", {
            code: event.code,
            reason: event.reason || undefined,
            wasClean: event.wasClean,
            intentional: this.intentionalDisconnect,
          });
          this.isConnected = false;
          this.handleDisconnect();
        };
      } catch (error) {
        console.error("[AutoPush] Failed to create WebSocket:", error);
        reject(error);
      }
    });
  }

  /**
   * Disconnect connection
   */
  disconnect(): void {
    // Clear existing timers
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    clearInterval(this.stateCheckInterval);
    this.stateCheckInterval = undefined;
    clearTimeout(this.testAutoCloseTimer);
    this.testAutoCloseTimer = undefined;
    this.clearSessionTimers();

    if (this.ws) {
      console.log("[AutoPush] Disconnecting WebSocket...");
      this.intentionalDisconnect = true; // Set intentional disconnect flag
      this.reconnectAttempts = this.maxReconnectAttempts; // Additional protection

      // Remove event listeners before disconnecting
      this.ws.close();
      this.ws = undefined;
    }

    // Reset state
    this.isConnected = false;
    this.uaid = undefined;
    this.channelIds = [];
    this.pendingOperations.clear();
  }

  // ==================== Public Methods (Message Sending) ====================

  /**
   * Send HANDSHAKE
   */
  async sendHello(uaid?: string, channelIds?: string[]): Promise<HelloResponse> {
    const hello = {
      messageType: "hello",
      uaid: uaid || "",
      channelIDs: channelIds || [],
      use_webpush: true,
    };

    console.log("[AutoPush] → Sending HELLO:", JSON.stringify(hello));

    // Save channelIds for use in handleHello
    this.pendingChannelIds = channelIds || [];
    this.lastHelloSentUaid = uaid || undefined;

    return new Promise((resolve, reject) => {
      // Set up one-time handler for hello response
      const originalHandler = this.messageHandlers.get("hello");
      let timeoutTimer: NodeJS.Timeout | undefined;

      // Remove our wrapper only if it is still the registered handler;
      // a newer sendHello may have replaced it in the meantime
      const restoreHandler = () => {
        if (this.messageHandlers.get("hello") !== helloHandler) {
          return;
        }
        if (originalHandler) {
          this.messageHandlers.set("hello", originalHandler);
        } else {
          this.messageHandlers.delete("hello");
        }
      };

      const helloHandler = (response: unknown) => {
        clearTimeout(timeoutTimer);
        timeoutTimer = undefined;
        restoreHandler();
        resolve(response as HelloResponse);
      };
      this.messageHandlers.set("hello", helloHandler);

      // Send hello message
      this.sendMessage(hello, "HELLO");

      // Timeout after 10 seconds
      timeoutTimer = setTimeout(() => {
        restoreHandler();
        reject(new Error("Hello response timeout"));
      }, 10000);
    });
  }

  /**
   * Register channel
   */
  async registerChannel(channelId: string, publicKey?: string): Promise<RegisterResponse> {
    const register: RegisterMessage = {
      messageType: "register",
      channelID: channelId,
    };

    // Add public key for WebPush
    if (publicKey) {
      register.key = publicKey;
    }

    console.log("[AutoPush] → Sending REGISTER:", JSON.stringify(register));

    return new Promise((resolve, reject) => {
      // Store the resolver for this channel registration
      this.pendingOperations.set(`register_${channelId}`, {
        resolve: resolve as (value: unknown) => void,
        reject: reject as (reason: unknown) => void,
      });

      // Send register message
      this.sendMessage(register, "REGISTER");

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pendingOperations.has(`register_${channelId}`)) {
          this.pendingOperations.delete(`register_${channelId}`);
          reject(new Error("Register response timeout"));
        }
      }, 10000);
    });
  }

  /**
   * Unregister channel
   */
  async unregisterChannel(channelId: string): Promise<void> {
    const unregister = {
      messageType: "unregister",
      channelID: channelId,
    };

    console.log("[AutoPush] → Sending UNREGISTER:", JSON.stringify(unregister));
    this.sendMessage(unregister, "UNREGISTER");

    // Remove from local list
    this.channelIds = this.channelIds.filter((id) => id !== channelId);
  }

  /**
   * Manually send PING (for debugging)
   */
  sendPing(): void {
    if (this.isConnected && this.ws) {
      // Check if authenticated
      if (!this.uaid) {
        console.log("[AutoPush] Cannot send PING: not authenticated (no UAID)");
        return;
      }
      console.log("[AutoPush] Manually sending PING");
      this.sendMessage({}, "PING");
    } else {
      console.log("[AutoPush] Cannot send PING: not connected");
    }
  }

  // ==================== Public Methods (Event Registration) ====================

  /**
   * Register message handler
   */
  onMessage(type: string, handler: (data: unknown) => void): void {
    this.messageHandlers.set(type, handler);
  }

  // ==================== Private Methods (Sending) ====================

  /**
   * Send message
   */
  private sendMessage(message: unknown, type: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const payload = JSON.stringify(message);
      console.log(`[AutoPush] → Sending ${type}:`, payload);
      this.ws.send(payload);
    } else {
      console.error(`[AutoPush] Cannot send ${type}: WebSocket not open`);
    }
  }

  // ==================== Private Methods (Receiving) ====================

  /**
   * Process received message
   */
  private handleMessage(message: MessageData): void {
    const messageType =
      message.messageType || (Object.keys(message).length === 0 ? "pong" : "ping");

    console.log("[AutoPush] Processing message type:", messageType);
    console.log("[AutoPush] Message keys:", Object.keys(message));

    // Internal processing
    switch (messageType) {
      case "hello":
        this.handleHello(message as HelloResponse);
        break;
      case "register":
        this.handleRegister(message as RegisterResponse);
        break;
      case "notification":
        this.handleNotification(message);
        break;
      case "ping":
        this.handlePing();
        break;
      case "pong":
        this.handlePong();
        break;
    }

    // Execute custom handler if exists
    const handler = this.messageHandlers.get(messageType);
    if (handler) {
      handler(message);
    }
  }

  // ==================== Private Methods (Various Handlers) ====================

  /**
   * Process Hello response
   */
  private handleHello(message: HelloResponse): void {
    pushDiagnostics.record("hello_result", {
      status: message.status,
      uaid: message.uaid,
      sentUaid: this.lastHelloSentUaid,
      uaidChanged: !!(
        this.lastHelloSentUaid &&
        message.uaid &&
        this.lastHelloSentUaid !== message.uaid
      ),
      channelCount: this.pendingChannelIds?.length ?? 0,
    });

    // If UAID is expired (409 Conflict or 410 Gone)
    if (message.status === 409 || message.status === 410) {
      console.warn(
        "[AutoPush] UAID expired (status:",
        message.status,
        "), disconnecting. Please turn push notifications off and on again",
      );

      // Pass error message to handler before disconnecting
      const handler = this.messageHandlers.get("hello");
      if (handler) {
        // Return with error status
        handler(message);
      }

      // Explicitly disconnect to prevent further connection attempts
      this.disconnect();
      return;
    }

    if (message.status !== 200) {
      console.warn("[AutoPush] Hello failed:", message);
      this.pendingChannelIds = undefined;
      return;
    }

    // Process handshake response
    this.uaid = message.uaid;

    // Restore channelIds sent in sendHello
    if (this.pendingChannelIds && this.pendingChannelIds.length > 0) {
      this.channelIds = [...this.pendingChannelIds];
      console.log("[AutoPush] Restored channel IDs from HELLO:", this.channelIds);
    }
    // Cleanup
    this.pendingChannelIds = undefined;

    // Send initial PING after HELLO completion (bound to this socket so a
    // stale timer cannot ping a replacement connection)
    const helloSocket = this.ws;
    setTimeout(() => {
      if (this.isConnected && this.ws === helloSocket) {
        console.log("[AutoPush] Sending initial PING to activate connection");
        this.sendPing();
      }
    }, 1000);

    // Consider the connection stable only after successful HELLO
    this.reconnectAttempts = 0;

    // The session is registered server-side; start its lifetime clock
    this.startCycleReconnectTimer();

    // Test: auto-close WebSocket after configured delay
    if (this.testAutoCloseMs) {
      if (this.testAutoCloseTimer) {
        clearTimeout(this.testAutoCloseTimer);
        this.testAutoCloseTimer = undefined;
      }
      this.testAutoCloseTimer = setTimeout(() => {
        console.log(
          `
[AutoPush][TEST] Auto-closing WebSocket after ${this.testAutoCloseMs}ms (post-HELLO)`,
        );
        try {
          this.ws?.close(1000, "Test auto-close");
        } catch (e) {
          console.error("[AutoPush][TEST] Failed to auto-close WebSocket:", e);
        }
      }, this.testAutoCloseMs);
    }

    console.log("[AutoPush] Hello successful");
    console.log("  UAID:", this.uaid);
    console.log("  use_webpush:", message.use_webpush);
  }

  /**
   * Process Register response
   */
  private handleRegister(message: RegisterResponse): void {
    console.log("[AutoPush] Register response received:");
    console.log("  Status:", message.status);
    console.log("  Channel ID:", message.channelID);
    console.log("  Push Endpoint:", message.pushEndpoint);
    console.log("  Full response:", JSON.stringify(message));

    const channelId = message.channelID;
    const operationKey = `register_${channelId}`;

    pushDiagnostics.record("register_result", {
      status: message.status,
      channelId,
      hasEndpoint: !!message.pushEndpoint,
    });

    if (message.status === 200 && message.pushEndpoint) {
      // Add to local channel list
      if (!this.channelIds.includes(channelId)) {
        this.channelIds.push(channelId);
      }
      console.log("[AutoPush] Registration successful");
      console.log("[AutoPush] Current channel IDs:", this.channelIds);

      // Resolve the pending promise
      const operation = this.pendingOperations.get(operationKey);
      if (operation) {
        operation.resolve(message);
        this.pendingOperations.delete(operationKey);
      }
    } else {
      console.error("[AutoPush] Registration failed:", message);
      // Reject the pending promise
      const operation = this.pendingOperations.get(operationKey);
      if (operation) {
        operation.reject(new Error(`Registration failed: ${message.status}`));
        this.pendingOperations.delete(operationKey);
      }
    }
  }

  /**
   * Process notification message
   */
  private handleNotification(message: NotificationMessage): void {
    pushDiagnostics.record("socket_received", {
      channelId: message.channelID,
      version: shortVersion(message.version),
      dataLength: message.data?.length ?? 0,
    });

    console.log("[AutoPush] 📬 Notification received:");
    console.log("  Channel ID:", message.channelID);
    console.log("  Version:", message.version);
    console.log("  Data:", message.data);
    console.log("  Headers:", message.headers);
    console.log("  Full message:", JSON.stringify(message));
    console.log("  Timestamp:", new Date().toISOString());

    // If there's encrypted data
    if (message.data) {
      console.log("[AutoPush] Encrypted data present, length:", message.data.length);
      console.log("[AutoPush] Data (base64):", message.data);
      // TODO: Data decryption processing
    }

    // Log header information in detail
    if (message.headers) {
      console.log("[AutoPush] Headers detail:");
      Object.keys(message.headers).forEach((key) => {
        console.log(`  ${key}: ${message.headers![key]}`);
      });
    }

    // Send ACK
    if (this.isConnected) {
      const ack = {
        messageType: "ack",
        updates: [
          {
            channelID: message.channelID,
            version: message.version,
          },
        ],
      };
      console.log("[AutoPush] Sending ACK for notification");
      this.sendMessage(ack, "ACK");
      pushDiagnostics.record("ack_sent", {
        channelId: message.channelID,
        version: shortVersion(message.version),
      });
    }
  }

  /**
   * Process Ping message
   */
  private handlePing(): void {
    console.log("[AutoPush] 🏓 PING received at", new Date().toISOString());
    if (this.isConnected) {
      // Send Pong message (empty JSON object)
      this.sendMessage({}, "PONG");
    }
  }

  /**
   * Process Pong message (response to PING)
   */
  private handlePong(): void {
    console.log("[AutoPush] 🏓 PONG received at", new Date().toISOString());
    console.log("[AutoPush] Connection is alive and responsive");
  }

  // ==================== Private Methods (Connection Management) ====================

  /**
   * Check and enforce connect rate limiting
   * @throws Error if connect rate limit is exceeded
   */
  private checkAndEnforceConnectRateLimit(): void {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    // Remove timestamps older than 1 hour
    const oldCount = this.connectCallTimestamps.length;
    this.connectCallTimestamps = this.connectCallTimestamps.filter((ts) => ts > oneHourAgo);
    const removedCount = oldCount - this.connectCallTimestamps.length;

    // Add current timestamp
    this.connectCallTimestamps.push(now);

    // Debug logging
    console.log(
      `[AutoPush] Connect rate limit check: ${this.connectCallTimestamps.length}/${this.maxConnectCallsPerHour} connect attempts in the last hour`,
    );
    if (removedCount > 0) {
      console.log(
        `[AutoPush] Cleaned up ${removedCount} old timestamp(s) from connect rate limit tracker`,
      );
    }

    // Check if exceeding connect rate limit
    if (this.connectCallTimestamps.length > this.maxConnectCallsPerHour) {
      const errorMessage = `[AutoPush] Connect rate limit exceeded: More than ${this.maxConnectCallsPerHour} connect attempts in 1 hour`;
      console.error(errorMessage);
      pushDiagnostics.record("reconnect_giveup", {
        reason: "rate_limit",
        attemptsInLastHour: this.connectCallTimestamps.length,
      });
      throw new Error(errorMessage);
    }
  }

  /**
   * Detect half-open (zombie) connections.
   * readyState can stay OPEN long after the peer is gone; field data showed
   * such connections silently dropping every push for up to 20 minutes.
   * After idlePingThresholdMs without inbound traffic, send an
   * application-level PING; without any reply within pongTimeoutMs, drop the
   * socket and reconnect.
   */
  private checkLiveness(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.uaid) {
      return;
    }
    if (this.pongTimer) {
      return; // Ping already in flight
    }
    const idleMs = Date.now() - this.lastActivityAt;
    if (idleMs < this.idlePingThresholdMs) {
      return;
    }
    if (Date.now() - this.lastLivenessPingAt < this.minLivenessPingIntervalMs) {
      return;
    }

    this.lastLivenessPingAt = Date.now();
    console.log(`[AutoPush] Liveness ping after ${Math.round(idleMs / 1000)}s of silence`);
    pushDiagnostics.record("liveness_ping", { idleSeconds: Math.round(idleMs / 1000) });
    this.sendMessage({}, "PING");

    this.pongTimer = setTimeout(() => {
      this.pongTimer = undefined;
      console.error("[AutoPush] Liveness ping timed out, dropping zombie connection");
      pushDiagnostics.record("liveness_reconnect", {
        idleSeconds: Math.round((Date.now() - this.lastActivityAt) / 1000),
      });
      this.forceReconnect();
    }, this.pongTimeoutMs);
  }

  /**
   * Proactively replace the connection after connectionMaxLifetimeMs.
   * Field data showed ~20% of AutoPush sessions silently stop delivering
   * pushes (server-side routing desync) while still answering pings, so
   * neither close events nor the liveness watchdog can detect them.
   * Cycling the connection bounds any desync window to the cycle length,
   * which is well within the observed ~8-10 min redelivery TTL, so pushes
   * missed during a desync are recovered on the next connection. The
   * reference implementation (nicoLiveCheckTool PushReceiverCurl) uses
   * the same 5-minute cycling strategy.
   */
  private startCycleReconnectTimer(): void {
    clearTimeout(this.cycleReconnectTimer);
    this.cycleReconnectTimer = setTimeout(() => {
      this.cycleReconnectTimer = undefined;
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return; // A reconnection is already in progress elsewhere
      }
      console.log(
        `[AutoPush] Cycling connection after ${this.connectionMaxLifetimeMs / 1000}s lifetime`,
      );
      pushDiagnostics.record("cycle_reconnect", {
        lifetimeSeconds: this.connectionMaxLifetimeMs / 1000,
      });
      this.forceReconnect();
    }, this.connectionMaxLifetimeMs);
  }

  /**
   * Clear the timers scoped to the current connection session
   */
  private clearSessionTimers(): void {
    clearTimeout(this.pongTimer);
    this.pongTimer = undefined;
    clearTimeout(this.cycleReconnectTimer);
    this.cycleReconnectTimer = undefined;
  }

  /**
   * Drop the current socket immediately (without waiting for its close
   * event, which can take many minutes on a half-open connection) and
   * reconnect. Session timer cleanup happens in handleDisconnect, which
   * runs synchronously below.
   */
  private forceReconnect(): void {
    const staleWs = this.ws;
    if (staleWs) {
      // Detach handlers so a late close event on the dead socket cannot
      // trigger a second reconnection path
      staleWs.onopen = null;
      staleWs.onmessage = null;
      staleWs.onerror = null;
      staleWs.onclose = null;
      try {
        staleWs.close();
      } catch (e) {
        console.error("[AutoPush] Failed to close stale WebSocket:", e);
      }
    }
    this.ws = undefined;
    this.isConnected = false;
    this.handleDisconnect();
  }

  /**
   * Handle disconnection
   */
  private handleDisconnect(): void {
    // Session-scoped timers belong to the connection that just ended; a
    // stale pong timeout or cycle timer firing later must never be able to
    // tear down the next connection
    this.clearSessionTimers();

    // Don't reconnect for intentional disconnections
    if (this.intentionalDisconnect) {
      console.log("[AutoPush] Intentional disconnect, skipping reconnection");
      this.intentionalDisconnect = false;
      return;
    }

    // Idempotent: a connect failure can reach here twice for the same
    // socket (the onerror-driven reject path and the close event); the
    // first caller wins and later ones must not add attempts or timers
    if (this.reconnectTimer) {
      console.log("[AutoPush] Reconnection already scheduled, skipping");
      return;
    }

    // Save current state before reconnection (for restoration after reconnection)
    const savedUaid = this.uaid;
    const savedChannelIds = [...this.channelIds];
    console.log("[AutoPush] Saving state for reconnection:", {
      uaid: savedUaid,
      channelIds: savedChannelIds,
    });

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const rawDelay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      const delay = Math.min(rawDelay, this.maxReconnectDelay);

      console.log(
        `[AutoPush] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
      );
      pushDiagnostics.record("reconnect_scheduled", {
        attempt: this.reconnectAttempts,
        delayMs: delay,
      });
      if (rawDelay !== delay) {
        console.log(
          `[AutoPush] Raw backoff ${rawDelay}ms exceeded cap, using maxReconnectDelay ${this.maxReconnectDelay}ms`,
        );
      }

      this.reconnectTimer = setTimeout(async () => {
        // Mark this attempt as running so a failure can schedule the next one
        this.reconnectTimer = undefined;
        try {
          // If another path already restored an authenticated session,
          // leave it alone: a second HELLO on the same connection is a
          // protocol error and would get the socket closed
          if (this.isConnectionOpen() && this.uaid) {
            console.log("[AutoPush] Session already restored, skipping reconnect attempt");
            return;
          }

          await this.connect();
          // The socket this attempt established; if it goes away, a newer
          // attempt owns the session and this attempt must not touch it
          const attemptSocket = this.ws;

          // After successful reconnection, send HELLO with saved state
          if (this.isConnected && (savedUaid || savedChannelIds.length > 0)) {
            console.log("[AutoPush] Reconnected, restoring session with HELLO");
            try {
              const helloResponse = await this.sendHello(savedUaid, savedChannelIds);
              console.log("[AutoPush] Session restored:", helloResponse);

              // Check if channel ID has been restored
              if (this.channelIds.length === 0 && savedChannelIds.length > 0) {
                console.log("[AutoPush] Channel IDs not restored, manually restoring");
                this.channelIds = savedChannelIds;
              }
            } catch (helloError) {
              // Unauthenticated connections receive no pushes; drop the
              // socket and retry instead of waiting for a server close.
              // Only if this attempt still owns the current socket: its
              // HELLO timeout can fire long after the socket closed and a
              // newer attempt authenticated a replacement, which must not
              // be torn down (review finding)
              console.error("[AutoPush] Failed to restore session:", helloError);
              if (this.ws === attemptSocket) {
                this.forceReconnect();
              }
              return;
            }
          }
        } catch (error) {
          // Keep the reconnection chain alive. Failures thrown before a
          // socket exists (e.g. the connect rate limit) produce no close
          // event, so without rescheduling here the chain would end
          // permanently. Double-scheduling is prevented by handleDisconnect
          // skipping while a reconnect is pending (this callback cleared
          // its own timer handle on entry).
          console.error("[AutoPush] Reconnection failed:", error);
          this.handleDisconnect();
        }
      }, delay);
    } else {
      console.error("[AutoPush] Max reconnection attempts reached");
      pushDiagnostics.record("reconnect_giveup", {
        reason: "max_attempts",
        attempt: this.reconnectAttempts,
      });
      // No further reconnection will happen; stop the state check loop
      if (this.stateCheckInterval) {
        clearInterval(this.stateCheckInterval);
        this.stateCheckInterval = undefined;
      }
    }
  }
}
