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
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // ms
  private reconnectTimer?: NodeJS.Timeout;
  private stateCheckInterval?: NodeJS.Timeout;

  // Test utilities
  private testAutoCloseTimer?: NodeJS.Timeout;
  private testAutoCloseMs?: number;

  // Authentication and channel management
  private uaid?: string;
  private channelIds: string[] = [];
  private pendingChannelIds?: string[];

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
   * Get detailed connection status
   */
  getConnectionStatus(): string {
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

  // ==================== Public Methods (Connection Management) ====================

  /**
   * Connect to Mozilla Push Service
   */
  async connect(): Promise<void> {
    // Skip if already connecting or connected
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)
    ) {
      console.log("WebSocket already connecting or connected");

      // Wait for connection to complete
      if (this.ws.readyState === WebSocket.CONNECTING) {
        await new Promise<void>((resolve) => {
          const checkInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 100);
        });
      }
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        console.log(`Connecting to AutoPush service: ${this.endpoint}`);
        this.ws = new WebSocket(this.endpoint);

        this.ws.onopen = () => {
          console.log("[AutoPush] ✅ WebSocket OPENED");
          console.log("[AutoPush] Connected to:", this.endpoint);
          this.isConnected = true;

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
          }, 30000); // Every 30 seconds

          resolve();
        };

        this.ws.onmessage = (event) => {
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

        this.ws.onerror = (error) => {
          console.error("[AutoPush] ❌ WebSocket ERROR:", error);
          this.isConnected = false;
          reject(error);
        };

        this.ws.onclose = (event) => {
          console.log("[AutoPush] ❌ WebSocket CLOSED");
          console.log("[AutoPush] Close details:", {
            code: event.code,
            reason: event.reason || "(no reason provided)",
            wasClean: event.wasClean,
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
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    if (this.stateCheckInterval) {
      clearInterval(this.stateCheckInterval);
      this.stateCheckInterval = undefined;
    }
    if (this.testAutoCloseTimer) {
      clearTimeout(this.testAutoCloseTimer);
      this.testAutoCloseTimer = undefined;
    }

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

    return new Promise((resolve, reject) => {
      // Set up one-time handler for hello response
      const originalHandler = this.messageHandlers.get("hello");
      this.messageHandlers.set("hello", (response) => {
        // Restore original handler if exists
        if (originalHandler) {
          this.messageHandlers.set("hello", originalHandler);
        } else {
          this.messageHandlers.delete("hello");
        }
        resolve(response as HelloResponse);
      });

      // Send hello message
      this.sendMessage(hello, "HELLO");

      // Timeout after 10 seconds
      setTimeout(() => {
        this.messageHandlers.delete("hello");
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

    // Send initial PING after HELLO completion
    setTimeout(() => {
      if (this.isConnected) {
        console.log("[AutoPush] Sending initial PING to activate connection");
        this.sendPing();
      }
    }, 1000);

    // Consider the connection stable only after successful HELLO
    this.reconnectAttempts = 0;

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
   * Handle disconnection
   */
  private handleDisconnect(): void {
    // Clear existing timers
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    // Don't reconnect for intentional disconnections
    if (this.intentionalDisconnect) {
      console.log("[AutoPush] Intentional disconnect, skipping reconnection");
      this.intentionalDisconnect = false;
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
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

      console.log(
        `[AutoPush] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
      );

      this.reconnectTimer = setTimeout(async () => {
        try {
          await this.connect();

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
              console.error("[AutoPush] Failed to restore session:", helloError);
            }
          }
        } catch (error) {
          console.error("[AutoPush] Reconnection failed:", error);
        }
      }, delay);
    } else {
      console.error("[AutoPush] Max reconnection attempts reached");
    }
  }
}
