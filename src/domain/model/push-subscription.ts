/**
 * Push subscription information model
 */
export interface PushSubscriptionInfo {
  /** Push notification endpoint URL */
  endpoint: string;

  /** Expiration time (Unix timestamp, null for no expiration) */
  expirationTime: number | null;

  /** Encryption keys */
  keys: {
    /** P256DH public key (Base64 encoded) */
    p256dh: string;

    /** Authentication secret (Base64 encoded) */
    auth: string;
  };

  /** Subscription creation date/time */
  createdAt: Date;

  /** Last update date/time */
  updatedAt: Date;

  /** Registration status with Niconico */
  niconicoRegistered: boolean;
}
