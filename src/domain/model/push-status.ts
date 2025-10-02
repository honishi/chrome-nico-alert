/**
 * Push notification status information
 */
export interface PushStatus {
  /** Whether push notification is enabled */
  enabled: boolean;

  /** Whether push notification is connected */
  connected: boolean;

  /** Connection state description */
  connectionState: string;

  /** Last received program information */
  lastReceivedProgram?: {
    program: {
      body: string;
      icon: string;
      title: string;
      createdAt?: string;
      onClick?: string;
    };
    receivedAt: string;
  };

  /** Channel ID for push subscription */
  channelId?: string;

  /** User Agent ID */
  uaid?: string;

  /** Connection status details */
  connectionStatus?: {
    currentAttempts: number;
    maxAttempts: number;
    lastAttemptTime?: string;
    lastConnectedTime?: string;
  };
}
