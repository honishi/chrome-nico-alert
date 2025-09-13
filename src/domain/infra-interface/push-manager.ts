import { PushProgram } from "../model/push-program";

/**
 * Interface for managing Web Push notifications
 */
export interface PushManager {
  /**
   * Start push notifications
   * - Restore saved information
   * - Connect to AutoPush
   * - Subscribe if not already subscribed
   */
  start(): Promise<void>;

  /**
   * Stop push notifications
   * - Disconnect from AutoPush
   * - Keep subscription info (for resuming later)
   */
  stop(): Promise<void>;

  /**
   * Completely reset push notifications
   * - Disconnect from AutoPush
   * - Unsubscribe
   * - Delete all saved information
   */
  reset(): Promise<void>;

  /**
   * Callback when a broadcast is detected via push notification
   */
  onProgramDetected?: (pushProgram: PushProgram) => Promise<void>;

  /**
   * Check connection status
   */
  isConnected(): boolean;

  /**
   * Get detailed connection state
   */
  getConnectionState(): string;

  /**
   * Get the last received program information
   */
  getLastReceivedProgram(): { program: PushProgram; receivedAt: Date } | undefined;

  /**
   * Get current channel ID
   */
  getChannelId(): string | undefined;

  /**
   * Get current UAID
   */
  getUaid(): string | undefined;
}
