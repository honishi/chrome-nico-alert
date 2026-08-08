import { injectable } from "tsyringe";
import { PushManager } from "../domain/infra-interface/push-manager";
import { PushSubscriptionInfo } from "../domain/model/push-subscription";
import { PushProgram } from "../domain/model/push-program";
import { AutoPushClient } from "./autopush-client";
import { pushDiagnostics, shortVersion } from "./push-diagnostics";
import {
  generateKeyPair,
  generateAuthSecret,
  exportKeys,
  importKeys,
  base64UrlEncode,
  base64Encode,
  decryptNotificationWithInfo,
  parseAutoPushPayload,
} from "./web-push-crypto";

/**
 * Implementation class for managing Web Push notifications
 */
@injectable()
export class WebPushManager implements PushManager {
  // ========== Private Properties ==========
  // VAPID & Endpoint
  private vapidKey?: Uint8Array;
  private nicoPushEndpoint?: string;

  // Subscription
  private subscriptionInfo?: PushSubscriptionInfo;

  // AutoPush Client
  private autoPush?: AutoPushClient;

  // Crypto Keys
  private cryptoKeys?: {
    authSecret: Uint8Array;
    publicKey: Uint8Array;
    privateKey: CryptoKey;
  };

  // Status
  private lastReceivedProgram?: { program: PushProgram; receivedAt: Date };

  // Per-session single-flight guard for canary probe setup
  private canarySetup?: { client: AutoPushClient; promise: Promise<void> };

  // Lifecycle serialization: start/stop/reset run exclusively so that a
  // stop or reset can never interleave with an in-flight start (session
  // restore, subscription, canary setup) and corrupt shared state
  private lifecycle: Promise<unknown> = Promise.resolve();

  // ========== Public Properties ==========
  /**
   * Callback when a broadcast is detected via push notification
   */
  onProgramDetected?: (pushProgram: PushProgram) => Promise<void>;

  // ========== Public Methods: Lifecycle ==========
  /**
   * Start push notifications
   * - Restore saved information
   * - Connect to AutoPush
   * - Subscribe if not already subscribed
   */
  async start(): Promise<void> {
    return this.runExclusive(() => this.doStart());
  }

  /**
   * Run a lifecycle operation after every previously queued one finished
   */
  private runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.lifecycle.then(task, task);
    this.lifecycle = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async doStart(): Promise<void> {
    // Early return if already connected
    if (this.autoPush?.isConnectionOpen()) {
      console.log("PushManager already started and connected");
      // The probe setup is idempotent; re-ensure it so a previously
      // failed setup attempt heals on the next start
      await this.ensureCanaryProbe();
      return;
    }

    console.log("Starting PushManager...");

    try {
      // 1. Restore saved information
      await this.restoreData();

      // 2. Check subscription status
      const isSubscribed = await this.isSubscribed();

      if (isSubscribed) {
        // 3. If already subscribed, connect to AutoPush
        console.log("Already subscribed, connecting to AutoPush...");
        const saved = await chrome.storage.local.get([
          "pushUaid",
          "pushChannelId",
          "pushCanaryChannelId",
        ]);
        if (saved.pushUaid) {
          await this.connectAutoPush(saved.pushUaid, this.savedChannelIds(saved));
        }
      } else {
        // 4. If not subscribed, create new subscription
        console.log("Not subscribed yet, subscribing...");
        await this.subscribeAndConnect();
      }

      // 5. Set up the canary self-push probe (desync detection)
      await this.ensureCanaryProbe();

      console.log("PushManager started successfully");
    } catch (error) {
      console.error("Failed to start PushManager:", error);
      throw error;
    }
  }

  /**
   * Stop push notifications
   * - Disconnect from AutoPush
   * - Keep subscription info (for resuming later)
   */
  async stop(): Promise<void> {
    return this.runExclusive(() => this.doStop());
  }

  private async doStop(): Promise<void> {
    console.log("Stopping PushManager...");

    if (this.autoPush) {
      this.autoPush.disconnect();
      this.autoPush = undefined;
      console.log("Disconnected from AutoPush");
    }

    console.log("PushManager stopped");
  }

  /**
   * Completely reset push notifications
   * - Disconnect from AutoPush
   * - Unsubscribe
   * - Delete all saved information
   */
  async reset(): Promise<void> {
    return this.runExclusive(() => this.doReset());
  }

  private async doReset(): Promise<void> {
    console.log("Resetting PushManager...");

    // 1. Unregister from Niconico Push API first
    if (this.subscriptionInfo?.endpoint) {
      console.log("Unregistering from Niconico Push API...");
      await this.unregisterFromNiconico(this.subscriptionInfo.endpoint);
    }

    // 2. Unregister the canary probe channel
    if (this.autoPush) {
      try {
        const savedCanary = await chrome.storage.local.get(["pushCanaryChannelId"]);
        if (savedCanary.pushCanaryChannelId) {
          await this.autoPush.unregisterChannel(savedCanary.pushCanaryChannelId);
        }
      } catch (error) {
        console.error("Failed to unregister canary channel:", error);
      }
    }

    // 3. Disconnect from AutoPush and unsubscribe
    if (this.autoPush && this.subscriptionInfo) {
      try {
        const channelIdMatch = this.subscriptionInfo.endpoint.match(/([a-f0-9-]{36})$/);
        if (channelIdMatch) {
          await this.autoPush.unregisterChannel(channelIdMatch[1]);
        }
      } catch (error) {
        console.error("Failed to unregister from AutoPush:", error);
      }

      this.autoPush.disconnect();
      this.autoPush = undefined;
    }

    // 4. Clear data from memory
    this.subscriptionInfo = undefined;
    this.cryptoKeys = undefined;
    this.vapidKey = undefined;

    // 5. Delete saved data
    await chrome.storage.local.remove([
      "pushSubscription",
      "pushKeys",
      "pushUaid",
      "pushChannelId",
      "pushCanaryChannelId",
      "pushCanaryEndpoint",
    ]);

    console.log("PushManager reset completed");
  }

  // ========== Public Methods: Status ==========
  /**
   * Check connection status
   */
  isConnected(): boolean {
    return this.autoPush?.isConnectionOpen() ?? false;
  }

  /**
   * Get detailed connection status
   */
  getConnectionState(): string {
    if (!this.autoPush) return "NOT_INITIALIZED";
    if (this.autoPush.isConnectionOpen()) return "CONNECTED";
    return "DISCONNECTED";
  }

  /**
   * Get the last received program information
   */
  getLastReceivedProgram(): { program: PushProgram; receivedAt: Date } | undefined {
    return this.lastReceivedProgram;
  }

  /**
   * Get current channel ID
   */
  getChannelId(): string | undefined {
    return this.autoPush?.getChannelIds()[0];
  }

  /**
   * Get current UAID
   */
  getUaid(): string | undefined {
    return this.autoPush?.getUaid();
  }

  /**
   * Get connect rate limit status from AutoPush client
   */
  getConnectionStatus():
    | {
        currentAttempts: number;
        maxAttempts: number;
        lastAttemptTime?: Date;
        lastConnectedTime?: Date;
      }
    | undefined {
    return this.autoPush?.getConnectionStatus();
  }

  // ========== Private Methods: Initialization ==========
  /**
   * Restore saved subscription information (internal use)
   */
  private async restoreData(): Promise<void> {
    // Restore saved subscription information from Chrome Storage API
    const saved = await chrome.storage.local.get([
      "pushSubscription",
      "pushKeys",
      "pushUaid",
      "pushChannelId",
      "pushCanaryChannelId",
    ]);

    if (saved.pushSubscription) {
      this.subscriptionInfo = saved.pushSubscription;
      console.log("Previous subscription found:", this.subscriptionInfo);
    }

    if (saved.pushKeys) {
      try {
        this.cryptoKeys = await importKeys(saved.pushKeys);
        console.log("Crypto keys restored");
      } catch (error) {
        console.error("Failed to restore crypto keys:", error);
      }
    }

    // Initialize AutoPush client (only if saved subscription info exists)
    if (this.subscriptionInfo && this.cryptoKeys && saved.pushUaid) {
      try {
        // Use saved channel ID
        const channelIds = this.savedChannelIds(saved);
        console.log("[WebPushManager] Restoring AutoPush connection:");
        console.log("  Saved UAID:", saved.pushUaid);
        console.log("  Saved Channel ID:", saved.pushChannelId);
        console.log("  Channel IDs array:", channelIds);
        await this.connectAutoPush(saved.pushUaid, channelIds);
        console.log("[WebPushManager] AutoPush client initialized:", !!this.autoPush);
      } catch (error) {
        console.error("Failed to restore AutoPush connection:", error);
        // Continue initialization even if error occurs
      }
    }
  }

  /**
   * Check if subscription is valid (internal use)
   */
  private async isSubscribed(): Promise<boolean> {
    return this.subscriptionInfo !== undefined && this.subscriptionInfo.niconicoRegistered;
  }

  /**
   * Channel IDs for the HELLO handshake, in registration order.
   * The main channel comes first (getChannelId reports index 0); the
   * canary channel must be included so the list matches the server-side
   * record for the UAID.
   */
  private savedChannelIds(saved: {
    pushChannelId?: string;
    pushCanaryChannelId?: string;
  }): string[] {
    const channelIds: string[] = [];
    if (saved.pushChannelId) {
      channelIds.push(saved.pushChannelId);
    }
    if (saved.pushCanaryChannelId) {
      channelIds.push(saved.pushCanaryChannelId);
    }
    return channelIds;
  }

  /**
   * Ensure a canary channel exists and hand it to the AutoPush client for
   * the self-push probe (desync detection). The channel is registered
   * WITHOUT a key so its endpoint accepts unauthenticated TTL:0 POSTs
   * from the extension itself; the probe travels the same per-user
   * delivery path as real pushes. The channel is persisted and reused
   * across restarts. Single-flight: concurrent start() calls share one
   * setup so the canary can never be registered twice.
   */
  private ensureCanaryProbe(): Promise<void> {
    // Bind to the current client instance: stop()/reset()/re-subscription
    // replace this.autoPush, and a setup racing those must not persist or
    // configure a canary for a session it no longer belongs to
    const client = this.autoPush;
    if (!client) {
      return Promise.resolve();
    }
    if (this.canarySetup?.client === client) {
      return this.canarySetup.promise; // Single-flight per session
    }
    // A previous session's setup may still be finishing; run after it so
    // two setups can never interleave on the shared storage keys, and so
    // a replacement session always gets its own setup instead of joining
    // the superseded one
    const prior = this.canarySetup?.promise ?? Promise.resolve();
    const promise = prior.then(() => this.setupCanaryProbe(client));
    const entry = { client, promise };
    this.canarySetup = entry;
    void promise.finally(() => {
      if (this.canarySetup === entry) {
        this.canarySetup = undefined;
      }
    });
    return promise;
  }

  private async setupCanaryProbe(client: AutoPushClient): Promise<void> {
    // May run queued behind a superseded session's setup; re-validate
    if (this.autoPush !== client || !client.isConnectionOpen()) {
      return;
    }

    try {
      const saved = await chrome.storage.local.get(["pushCanaryChannelId", "pushCanaryEndpoint"]);
      if (saved.pushCanaryChannelId && saved.pushCanaryEndpoint) {
        if (this.autoPush !== client) {
          return;
        }
        client.configureCanaryProbe(saved.pushCanaryChannelId, saved.pushCanaryEndpoint);
        return;
      }

      // A partial pair (setup interrupted between register and save) would
      // let the HELLO channel list diverge from the server-side record;
      // clean it up before registering anew
      if (saved.pushCanaryChannelId || saved.pushCanaryEndpoint) {
        console.warn("[WebPushManager] Reconciling partial canary state");
        if (saved.pushCanaryChannelId) {
          await client.unregisterChannel(saved.pushCanaryChannelId);
        }
        await chrome.storage.local.remove(["pushCanaryChannelId", "pushCanaryEndpoint"]);
      }

      const channelId = crypto.randomUUID();
      const registration = await client.registerChannel(channelId);
      if (!registration.pushEndpoint) {
        console.warn("[WebPushManager] Canary registration returned no endpoint, probe disabled");
        return;
      }

      if (this.autoPush !== client) {
        // The session was stopped or replaced while registering; the new
        // owner will run its own setup
        await client.unregisterChannel(channelId);
        return;
      }

      try {
        await chrome.storage.local.set({
          pushCanaryChannelId: channelId,
          pushCanaryEndpoint: registration.pushEndpoint,
        });
      } catch (error) {
        // The unregister send is fire-and-forget, so the server-side set
        // cannot be assumed restored; rebuild the session so the next
        // HELLO realigns the channel record (and surfaces any rotation)
        await client.unregisterChannel(channelId);
        client.restartSession();
        throw error;
      }

      if (this.autoPush !== client) {
        // The session was replaced while persisting: the pair belongs to
        // the old session and may have landed after reset() cleared
        // storage, so undo both the write and the registration
        await chrome.storage.local.remove(["pushCanaryChannelId", "pushCanaryEndpoint"]);
        await client.unregisterChannel(channelId);
        return;
      }
      client.configureCanaryProbe(channelId, registration.pushEndpoint);
      console.log("[WebPushManager] Canary probe channel registered:", channelId);
    } catch (error) {
      // The probe only improves desync detection; the session works without it
      console.warn("[WebPushManager] Failed to set up canary probe:", error);
    }
  }

  // ========== Private Methods: Subscription ==========
  /**
   * Create new push notification subscription and connect to AutoPush (internal use)
   */
  private async subscribeAndConnect(): Promise<void> {
    console.log("Starting push subscription (AutoPush)...");

    try {
      // 1. Get VAPID key
      if (!this.vapidKey) {
        this.vapidKey = await this.getVapidPublicKey();
      }

      // 2. Generate encryption keys
      if (!this.cryptoKeys) {
        const keyPair = await generateKeyPair();
        const authSecret = generateAuthSecret();

        this.cryptoKeys = {
          authSecret,
          publicKey: keyPair.publicKeyBytes,
          privateKey: keyPair.privateKey,
        };

        // Save keys
        const exportedKeys = exportKeys({
          authSecret,
          publicKey: keyPair.publicKeyBytes,
          privateKey: keyPair.privateKeyBytes,
        });
        await chrome.storage.local.set({ pushKeys: exportedKeys });
      }

      // 3. Connect to AutoPush (force reconnect for new registration)
      // If there's an existing connection, disconnect first and clear the reference
      if (this.autoPush) {
        console.log("Clearing existing AutoPush connection before new subscription");
        this.autoPush.disconnect();
        this.autoPush = undefined;
      }
      const uaid = await this.connectAutoPush(undefined, undefined, true);
      console.log("[WebPushManager] After connectAutoPush, autoPush exists:", !!this.autoPush);

      // 4. Register channel and get endpoint
      const channelId = crypto.randomUUID();
      const vapidKeyBase64 = base64UrlEncode(this.vapidKey);
      console.log("[DEBUG] Registering channel with AutoPush:");
      console.log("  Channel ID:", channelId);
      console.log("  VAPID Key (Base64URL):", vapidKeyBase64.substring(0, 20) + "...");

      const registration = await this.autoPush!.registerChannel(channelId, vapidKeyBase64);
      console.log("[DEBUG] AutoPush registration response:");
      console.log("  Endpoint:", registration.pushEndpoint);
      console.log("  Channel ID:", registration.channelID);

      // 5. Create subscription info
      // Save both formats as Niconico API expects standard Base64
      const publicKeyBase64 = base64Encode(this.cryptoKeys.publicKey); // Standard Base64 (with padding)
      const authBase64 = base64Encode(this.cryptoKeys.authSecret); // Standard Base64 (with padding)

      console.log("[DEBUG] Creating subscription info:");
      console.log("  Public key length (bytes):", this.cryptoKeys.publicKey.byteLength);
      console.log(
        "  Public key first byte:",
        new Uint8Array(this.cryptoKeys.publicKey)[0]?.toString(16),
      );
      console.log("  Auth secret length (bytes):", this.cryptoKeys.authSecret.byteLength);
      console.log("  Keys format: Standard Base64 (with padding)");

      this.subscriptionInfo = {
        endpoint: registration.pushEndpoint || "",
        expirationTime: null,
        keys: {
          p256dh: publicKeyBase64, // Standard Base64 format
          auth: authBase64, // Standard Base64 format
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        niconicoRegistered: false,
      };

      // 6. Register to Niconico API
      if (this.subscriptionInfo) {
        await this.registerToNiconico(this.subscriptionInfo);
      }

      // 7. Save subscription info and channel ID
      if (this.subscriptionInfo) {
        await this.saveSubscription(this.subscriptionInfo);
      }
      console.log("[WebPushManager] Saving to storage:");
      console.log("  UAID:", uaid);
      console.log("  Channel ID:", channelId);
      // A saved canary belongs to the previous UAID; probing its endpoint
      // would route to a dead session, so let ensureCanaryProbe register a
      // fresh one on this UAID
      await chrome.storage.local.remove(["pushCanaryChannelId", "pushCanaryEndpoint"]);
      await chrome.storage.local.set({
        pushUaid: uaid,
        pushChannelId: channelId, // Also save channel ID
      });
      console.log("[WebPushManager] Saved successfully");

      console.log("Push subscription completed successfully");
    } catch (error) {
      console.error("Failed to subscribe to push notifications:", error);
      throw error;
    }
  }

  /**
   * Save subscription information to Chrome Storage
   */
  private async saveSubscription(subscription: PushSubscriptionInfo): Promise<void> {
    await chrome.storage.local.set({ pushSubscription: subscription });
  }

  // ========== Private Methods: VAPID ==========
  /**
   * Get VAPID public key (internal use)
   */
  private async getVapidPublicKey(): Promise<Uint8Array> {
    // Return if cached
    if (this.vapidKey) {
      console.log("Using cached VAPID key");
      return this.vapidKey;
    }

    console.log("Fetching VAPID key from Niconico...");

    try {
      // 1. Fetch Service Worker file
      const swUrl = "https://account.nicovideo.jp/sw.js";
      console.log("Fetching service worker from:", swUrl);
      const swResponse = await fetch(swUrl);
      const swContent = await swResponse.text();
      console.log("Service worker fetched, length:", swContent.length);

      // 2. Extract main script URL from importScripts
      const importMatch = swContent.match(/importScripts\(['"](.*?)['"]\)/);
      if (!importMatch) {
        throw new Error("Failed to find importScripts in service worker");
      }
      const mainScriptUrl = importMatch[1];
      console.log("Main script URL found:", mainScriptUrl);

      // 3. Fetch main script
      const mainResponse = await fetch(mainScriptUrl);
      const mainContent = await mainResponse.text();
      console.log("Main script fetched, length:", mainContent.length);

      // 4. Extract VAPID key (find all Uint8Arrays and use the 3rd one)
      // Niconico's SW file contains multiple Uint8Array definitions with different VAPID keys for each environment
      // - 1st: for local environment (localhost)
      // - 2nd: for dev environment (dev.nicovideo.jp)
      // - 3rd: for prod environment (nicovideo.jp) <- use this one

      const uint8ArrayPattern = /(?:new\s+)?Uint8Array\s*\(\s*\[([\d,\s]+)\]\s*\)/g;
      const matches = [];
      let match;

      while ((match = uint8ArrayPattern.exec(mainContent)) !== null) {
        matches.push(match);
      }

      console.log(`Found ${matches.length} Uint8Array definitions in the script`);

      // Use the 3rd Uint8Array (for prod environment)
      let vapidMatch = null;
      if (matches.length >= 3) {
        vapidMatch = matches[2]; // 0-indexed, so index 2 is the 3rd match
        console.log("Using the 3rd Uint8Array (prod environment VAPID key)");
      } else if (matches.length > 0) {
        // If less than 3, use the last one
        vapidMatch = matches[matches.length - 1];
        console.log(`Only ${matches.length} Uint8Array found, using the last one`);
      }

      if (!vapidMatch) {
        console.error("Could not find VAPID key in script content");
        console.log("Script snippet:", mainContent.substring(0, 1000));
        throw new Error("Failed to find VAPID key in main script");
      }

      // 5. Convert string array to numeric array
      const vapidBytes = vapidMatch[1]
        .split(",")
        .map((n) => parseInt(n.trim()))
        .filter((n) => !isNaN(n)); // Exclude NaN

      // 6. Validate byte array
      if (vapidBytes.length !== 65) {
        throw new Error(`Invalid VAPID key length: ${vapidBytes.length}, expected 65`);
      }

      this.vapidKey = new Uint8Array(vapidBytes);

      console.log("VAPID key extracted successfully, length:", this.vapidKey.length);
      console.log("VAPID key first byte (should be 0x04):", this.vapidKey[0]?.toString(16));
      console.log("VAPID key (Base64):", base64Encode(this.vapidKey));

      // Compare extracted key with fixed key (for debugging)
      const expectedBase64 =
        "BC08Fdr2JChSL0kr5imO99L6zZG6Rn0tBAWNTlrZfJtsDoeAvmJSa7CnUOHpNhd5zOk0YnRToEOT47YLet8Dpig=";
      const actualBase64 = base64Encode(this.vapidKey);
      if (actualBase64 !== expectedBase64) {
        console.warn("Extracted VAPID key differs from expected:");
        console.warn("  Expected:", expectedBase64);
        console.warn("  Actual:  ", actualBase64);
      } else {
        console.log("✅ VAPID key matches expected value");
      }

      // 7. Also get endpoint URL (for later use)
      const endpointMatch = mainContent.match(
        /URL\s*:\s*["'](https:\/\/api\.push\.nicovideo\.jp[^"']+)["']/,
      );
      if (endpointMatch) {
        this.nicoPushEndpoint = endpointMatch[1];
        console.log("NicoPush API endpoint found:", this.nicoPushEndpoint);
      } else {
        // Set default value
        this.nicoPushEndpoint = "https://api.push.nicovideo.jp/v1/nicopush/webpush/endpoints.json";
        console.log("Using default NicoPush API endpoint:", this.nicoPushEndpoint);
      }

      return this.vapidKey;
    } catch (error) {
      console.error("Failed to fetch VAPID key:", error);
      throw error;
    }
  }

  // ========== Private Methods: Niconico Registration ==========
  /**
   * Common helper: Create and prepare a tab for Content Script communication
   */
  private async createAndPrepareNiconicoTab(): Promise<chrome.tabs.Tab> {
    const newTabUrl = "https://account.nicovideo.jp/my/account";
    console.log("[DEBUG] Creating new tab with URL:", newTabUrl);

    const targetTab = await chrome.tabs.create({
      url: newTabUrl,
      active: false, // Open in background
    });

    console.log("[DEBUG] New tab created, ID:", targetTab.id, "URL:", targetTab.url);

    // Wait for page to load
    await new Promise((resolve) => {
      const listener = (
        tabId: number,
        changeInfo: chrome.tabs.TabChangeInfo,
        tab: chrome.tabs.Tab,
      ) => {
        console.log("[DEBUG] Tab update:", tabId, changeInfo, tab.url);
        if (tabId === targetTab!.id && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve(undefined);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });

    console.log("Niconico tab created and loaded");

    if (!targetTab.id) {
      throw new Error("No valid tab ID");
    }

    return targetTab;
  }

  /**
   * Common helper: Ensure Content Script is loaded in the tab
   */
  private async ensureContentScriptLoaded(tabId: number): Promise<boolean> {
    console.log("[DEBUG] Checking if Content Script is loaded...");

    // First check if Content Script responds
    try {
      const pingResponse = await chrome.tabs.sendMessage(tabId, { type: "PING" });
      console.log("[DEBUG] PING response:", pingResponse);
      console.log("Content Script is already loaded");
      return true;
    } catch (error) {
      console.log("[DEBUG] PING failed:", error);
      console.log("Content Script not loaded, waiting 2 seconds for it to load...");
    }

    // Wait a bit and retry
    await new Promise((resolve) => setTimeout(resolve, 2000));

    try {
      const retryPing = await chrome.tabs.sendMessage(tabId, { type: "PING" });
      console.log("[DEBUG] Retry PING response:", retryPing);
      console.log("Content Script loaded after waiting");
      return true;
    } catch (retryError) {
      console.log("[DEBUG] Retry PING failed:", retryError);
      console.log("Content Script still not loaded, reloading tab...");
    }

    // Reload tab to load Content Script
    await chrome.tabs.reload(tabId);

    // Wait for reload to complete
    await new Promise((resolve) => {
      const listener = (reloadTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
        console.log("[DEBUG] Tab reload status:", reloadTabId, changeInfo);
        if (reloadTabId === tabId && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve(undefined);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });

    console.log("Tab reloaded, waiting 2 more seconds for Content Script...");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Final check
    try {
      const finalPing = await chrome.tabs.sendMessage(tabId, { type: "PING" });
      console.log("[DEBUG] Final PING response:", finalPing);
      return true;
    } catch (finalError) {
      console.error("[DEBUG] Final PING failed:", finalError);
      console.error("Content Script could not be loaded even after reload");
      return false;
    }
  }

  /**
   * Common helper: Check if user is logged in to Niconico
   */
  private async checkNiconicoLogin(): Promise<boolean> {
    const cookies = await chrome.cookies.getAll({
      domain: ".nicovideo.jp",
      name: "user_session",
    });
    return cookies.length > 0;
  }

  /**
   * Common helper: Execute operation via Content Script
   */
  private async executeViaContentScript<T>(
    operation: "register" | "unregister",
    payload: unknown,
  ): Promise<T> {
    // Check login status
    const isLoggedIn = await this.checkNiconicoLogin();
    if (!isLoggedIn) {
      if (operation === "register") {
        throw new Error("Not logged in to Niconico");
      } else {
        console.log("Not logged in to Niconico, skipping unregistration");
        return { success: true } as T;
      }
    }

    console.log(`User session found, proceeding with Content Script ${operation}...`);

    // Create and prepare tab
    const targetTab = await this.createAndPrepareNiconicoTab();

    try {
      // Ensure Content Script is loaded
      const contentScriptReady = await this.ensureContentScriptLoaded(targetTab.id!);
      if (!contentScriptReady) {
        throw new Error("Content Script could not be loaded");
      }

      // Send message to Content Script
      console.log(`[DEBUG] Sending ${operation} request to Content Script...`);
      console.log("[DEBUG] Target tab ID:", targetTab.id);
      console.log("[DEBUG] Payload:", payload);

      const messageType =
        operation === "register" ? "REGISTER_PUSH_ENDPOINT" : "UNREGISTER_PUSH_ENDPOINT";

      const message = Object.assign({ type: messageType }, payload as Record<string, unknown>);
      const response = await chrome.tabs.sendMessage(targetTab.id!, message);

      console.log(`Content Script ${operation} response:`, response);
      return response as T;
    } finally {
      // Always close the tab
      if (targetTab.id) {
        console.log("Closing temporary tab");
        await chrome.tabs.remove(targetTab.id);
      }
    }
  }

  /**
   * Register subscription info to Niconico Push API (internal use)
   * Register to Niconico API via Content Script (avoiding CORS restrictions)
   */
  private async registerToNiconico(subscription: PushSubscriptionInfo): Promise<void> {
    console.log("Registering to Niconico Push API via Content Script...");

    try {
      const payload = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      };

      console.log("[DEBUG] Registration data:", {
        endpoint: subscription.endpoint.substring(0, 50) + "...",
        keys: {
          p256dh: subscription.keys.p256dh.substring(0, 20) + "...",
          auth: subscription.keys.auth.substring(0, 20) + "...",
        },
      });

      const response = await this.executeViaContentScript<{
        success: boolean;
        status?: number;
        error?: string;
      }>("register", payload);

      if (response.success) {
        console.log("✅ Niconico Push API registration successful!");
        console.log("[DEBUG] Registration details:");
        console.log("  Endpoint:", subscription.endpoint);
        console.log("  Niconico registered:", true);
        console.log("  Time:", new Date().toISOString());
        subscription.niconicoRegistered = true;
        subscription.updatedAt = new Date();
      } else {
        console.error("❌ Niconico registration failed:", response.status, response.error);
        subscription.niconicoRegistered = false;

        // Special handling for 403 error
        if (response.status === 403) {
          console.warn("Still getting 403 error even via Content Script");
        }
      }
    } catch (error) {
      console.error("Failed to register to Niconico via Content Script:", error);
      subscription.niconicoRegistered = false;
    }
  }

  /**
   * Unregister from Niconico Push API via Content Script
   */
  private async unregisterFromNiconico(endpoint: string): Promise<void> {
    console.log("Unregistering from Niconico Push API via Content Script...");

    try {
      const payload = { endpoint: endpoint };
      console.log("[DEBUG] Endpoint to unregister:", endpoint);

      const response = await this.executeViaContentScript<{
        success: boolean;
        status?: number;
        error?: string;
      }>("unregister", payload);

      if (response.success) {
        console.log("✅ Niconico Push API unregistration successful!");
        console.log("[DEBUG] Unregistration details:");
        console.log("  Endpoint:", endpoint);
        console.log("  Niconico unregistered:", true);
        console.log("  Time:", new Date().toISOString());
      } else {
        console.error("❌ Niconico unregistration failed:", response.status, response.error);
      }
    } catch (error) {
      console.error("Failed to unregister from Niconico via Content Script:", error);
      // Don't throw - continue with reset even if unregistration fails
    }
  }

  // ========== Private Methods: AutoPush Connection ==========
  /**
   * Connect to AutoPush
   */
  private async connectAutoPush(
    existingUaid?: string,
    existingChannelIds?: string[],
    forceReconnect: boolean = false,
  ): Promise<string> {
    // If there's an existing connection
    if (this.autoPush) {
      // Disconnect if force reconnect
      if (forceReconnect) {
        console.log("Disconnecting existing AutoPush connection for re-registration");
        this.autoPush.disconnect();
        this.autoPush = undefined;
      } else if (this.autoPush.isConnectionOpen()) {
        console.log("AutoPush already connected, reusing connection");
        return this.autoPush.getUaid() || "";
      } else {
        console.log("Disconnecting stale AutoPush connection");
        this.autoPush.disconnect();
        this.autoPush = undefined;
      }
    }

    // Create new client
    this.autoPush = new AutoPushClient();

    // Set notification handler first
    console.log("[WebPushManager] Setting up notification handler...");
    this.autoPush.onMessage("notification", async (notification: unknown) => {
      console.log("[WebPushManager] 🔔 Notification handler triggered!");
      await this.handleNotification(
        notification as {
          data?: string;
          channelID?: string;
          version?: number;
          headers?: Record<string, unknown>;
        },
      );
    });
    console.log("[WebPushManager] Notification handler set");

    // Connect
    // this.autoPush.enableTestAutoClose(1);
    await this.autoPush.connect();

    // Handshake
    try {
      const hello = await this.autoPush.sendHello(existingUaid, existingChannelIds);
      console.log("AutoPush handshake completed, UAID:", hello.uaid);
      return hello.uaid;
    } catch (error) {
      console.error("[WebPushManager] Failed to complete handshake:", error);

      // An unauthenticated connection receives no pushes. Drop it so a
      // later start() cannot mistake the still-open socket for a working
      // session (isConnectionOpen would report true forever)
      this.autoPush.disconnect();
      this.autoPush = undefined;

      // If UAID is expired, the AutoPushClient will have already disconnected
      // User needs to manually turn push notifications off and on again
      if (
        (error as Error).message?.includes("expired") ||
        (error as Error).message?.includes("409") ||
        (error as Error).message?.includes("410")
      ) {
        console.error(
          "[WebPushManager] UAID expired. Please turn push notifications off and on again to re-initialize.",
        );
      }

      throw error;
    }
  }

  // ========== Private Methods: Notification Handling ==========
  /**
   * Process AutoPush notification
   */
  private async handleNotification(notification: {
    data?: string;
    channelID?: string;
    version?: number;
    headers?: Record<string, unknown>;
  }): Promise<void> {
    console.log("[WebPushManager] 📬 Push notification received:", notification);
    console.log("[WebPushManager] Notification structure:");
    console.log("  Has data:", !!notification.data);
    console.log("  Channel ID:", notification.channelID);
    console.log("  Version:", notification.version);
    console.log("  Headers:", notification.headers);
    console.log("  Timestamp:", new Date().toISOString());

    // Track the pipeline stage so failures can be classified in diagnostics
    let stage = "parse";
    try {
      if (!this.cryptoKeys) {
        console.error("[WebPushManager] ❌ Crypto keys not available!");
        pushDiagnostics.record("pipeline_error", {
          stage: "keys",
          channelId: notification.channelID,
          version: shortVersion(notification.version),
        });
        return;
      }

      // Decrypt payload
      if (notification.data) {
        console.log("[WebPushManager] Attempting to decrypt payload...");
        console.log("[WebPushManager] Raw data length:", notification.data.length);

        const payload = parseAutoPushPayload(notification.data);
        console.log("[WebPushManager] Parsed payload:");
        console.log("  Salt length:", payload.salt.length);
        console.log("  Public key length:", payload.publicKey.length);
        console.log("  Ciphertext length:", payload.ciphertext.length);

        stage = "decrypt";
        const decryption = await decryptNotificationWithInfo(payload, this.cryptoKeys);
        const decrypted = decryption.plaintext;
        console.log("[WebPushManager] Decrypted text:", decrypted);
        pushDiagnostics.record("decrypt_ok", {
          channelId: notification.channelID,
          version: shortVersion(notification.version),
          sharedSecretFallback: decryption.usedSharedSecretFallback,
        });

        stage = "json";
        const data = JSON.parse(decrypted);
        console.log("[WebPushManager] 🎉 Decrypted notification data:", data);

        // Notify existing processing system
        stage = "process";
        await this.processNotificationData(data);
      } else {
        console.log("[WebPushManager] ⚠️ No data in notification");
        pushDiagnostics.record("push_discard", {
          reason: "no_data",
          channelId: notification.channelID,
          version: shortVersion(notification.version),
        });
      }
    } catch (error) {
      console.error("[WebPushManager] ❌ Failed to process notification:", error);
      console.error("[WebPushManager] Error details:", {
        message: (error as Error).message,
        stack: (error as Error).stack,
      });
      pushDiagnostics.record("pipeline_error", {
        stage,
        channelId: notification.channelID,
        version: shortVersion(notification.version),
        error: (error as Error).message,
      });
    }
  }

  /**
   * Process notification data
   */
  private async processNotificationData(data: {
    title?: string;
    body?: string;
    icon?: string;
    data?: {
      onClick?: string;
      on_click?: string; // Niconico's actual field name
      created_at?: string;
      [key: string]: unknown;
    };
  }): Promise<void> {
    console.log("📨 Processing push notification data:", data);

    // Create PushProgram object
    const pushProgram: PushProgram = {
      body: data.body || "",
      icon: data.icon || "",
      title: data.title || "",
      createdAt: data.data?.created_at,
      onClick: data.data?.on_click || data.data?.onClick,
    };

    // Update last received program
    this.lastReceivedProgram = {
      program: pushProgram,
      receivedAt: new Date(),
    };

    // Call callback if set
    if (this.onProgramDetected) {
      console.log("🔔 Notifying background about new program:", pushProgram);
      try {
        await this.onProgramDetected(pushProgram);
      } catch (error) {
        console.error("Failed to notify about new program:", error);
      }
    } else {
      console.log("⚠️ No onProgramDetected callback set");
    }
  }
}
