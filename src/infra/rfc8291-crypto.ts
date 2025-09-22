/**
 * RFC8291 - Message Encryption for Web Push
 * Implementation of encryption/decryption processing
 */

// ========== Base64 Encoding/Decoding ==========
/**
 * Base64 encode (URL-safe)
 */
export function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Base64 decode (URL-safe)
 */
export function base64UrlDecode(str: string): Uint8Array {
  // Add padding
  const padding = (4 - (str.length % 4)) % 4;
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padding);

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Standard Base64 encode (with padding)
 */
export function base64Encode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ========== Key Generation ==========
/**
 * Generate ECDH key pair
 */
export async function generateKeyPair(): Promise<{
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicKeyBytes: Uint8Array;
  privateKeyBytes: Uint8Array;
}> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true,
    ["deriveBits"],
  );

  // Export public key
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const publicKeyBytes = new Uint8Array([
    0x04, // Uncompressed point format
    ...base64UrlDecode(publicKeyJwk.x!),
    ...base64UrlDecode(publicKeyJwk.y!),
  ]);

  // Export private key
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const privateKeyBytes = base64UrlDecode(privateKeyJwk.d!);

  return {
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    publicKeyBytes,
    privateKeyBytes,
  };
}

/**
 * Generate authentication secret (16 bytes)
 */
export function generateAuthSecret(): Uint8Array {
  const authSecret = new Uint8Array(16);
  crypto.getRandomValues(authSecret);
  return authSecret;
}

/**
 * Generate salt (16 bytes)
 */
export function generateSalt(): Uint8Array {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return salt;
}

// ========== Key Import/Export ==========
/**
 * Convert key information to storage format
 */
export function exportKeys(keys: {
  authSecret: Uint8Array;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}): {
  authSecret: string;
  publicKey: string;
  privateKey: string;
} {
  return {
    authSecret: base64UrlEncode(keys.authSecret),
    publicKey: base64UrlEncode(keys.publicKey),
    privateKey: base64UrlEncode(keys.privateKey),
  };
}

/**
 * Restore saved key information
 */
export async function importKeys(keys: {
  authSecret: string;
  publicKey: string;
  privateKey: string;
}): Promise<{
  authSecret: Uint8Array;
  publicKey: Uint8Array;
  privateKey: CryptoKey;
}> {
  const authSecret = base64UrlDecode(keys.authSecret);
  const publicKeyBytes = base64UrlDecode(keys.publicKey);
  const privateKeyBytes = base64UrlDecode(keys.privateKey);

  // Import private key as CryptoKey
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: base64UrlEncode(privateKeyBytes),
      x: base64UrlEncode(publicKeyBytes.slice(1, 33)),
      y: base64UrlEncode(publicKeyBytes.slice(33, 65)),
      ext: true,
    },
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    false,
    ["deriveBits"],
  );

  return {
    authSecret,
    publicKey: publicKeyBytes,
    privateKey,
  };
}

// ========== Payload Parsing ==========
/**
 * Parse AutoPush notification payload
 */
export function parseAutoPushPayload(data: string): {
  ciphertext: Uint8Array;
  salt: Uint8Array;
  publicKey: Uint8Array;
  recordSize: number;
} {
  // Base64 decode
  const decoded = base64UrlDecode(data);

  // Payload structure (aes128gcm):
  // - salt: 16 bytes
  // - record size: 4 bytes (big-endian)
  // - public key length: 1 byte
  // - public key: 65 bytes (uncompressed P-256)
  // - ciphertext: remainder

  const salt = decoded.slice(0, 16);
  const recordSize = (decoded[16] << 24) | (decoded[17] << 16) | (decoded[18] << 8) | decoded[19];
  const publicKeyLength = decoded[20];
  const publicKey = decoded.slice(21, 21 + publicKeyLength);
  const ciphertext = decoded.slice(21 + publicKeyLength);

  return {
    salt: new Uint8Array(salt),
    publicKey: new Uint8Array(publicKey),
    ciphertext: new Uint8Array(ciphertext),
    recordSize,
  };
}

// ========== Cryptographic Primitives (Private) ==========
/**
 * Implementation of HKDF (HMAC-based Key Derivation Function)
 */
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  // Extract: PRK = HMAC-Hash(salt, IKM)
  // RFC5869: If salt is 0 length, fill with 0x00 of Hash length
  const actualSalt = salt.length === 0 ? new Uint8Array(32) : salt;

  const saltKey = await crypto.subtle.importKey(
    "raw",
    actualSalt.buffer instanceof ArrayBuffer
      ? (actualSalt.buffer.slice(
          actualSalt.byteOffset,
          actualSalt.byteOffset + actualSalt.byteLength,
        ) as ArrayBuffer)
      : (actualSalt as unknown as ArrayBuffer),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const prkBytes = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      saltKey,
      ikm.buffer instanceof ArrayBuffer
        ? (ikm.buffer.slice(ikm.byteOffset, ikm.byteOffset + ikm.byteLength) as ArrayBuffer)
        : (ikm as unknown as ArrayBuffer),
    ),
  );

  // Expand: OKM = T(1) | T(2) | ... | T(N)
  const prkKey = await crypto.subtle.importKey(
    "raw",
    prkBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const output = new Uint8Array(length);
  let t = new Uint8Array(0);
  let offset = 0;

  for (let i = 1; offset < length; i++) {
    const input = new Uint8Array(t.length + info.length + 1);
    input.set(t);
    input.set(info, t.length);
    input[t.length + info.length] = i;

    t = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, input));

    const copyLength = Math.min(t.length, length - offset);
    output.set(t.subarray(0, copyLength), offset);
    offset += copyLength;
  }

  return output;
}

/**
 * Calculate shared secret (ECDH)
 */
async function computeSharedSecret(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
): Promise<Uint8Array> {
  const sharedSecret = await crypto.subtle.deriveBits(
    {
      name: "ECDH",
      public: publicKey,
    },
    privateKey,
    256,
  );

  return new Uint8Array(sharedSecret);
}

// ========== Main Decryption Function ==========
/**
 * Decrypt Web Push notification data
 */
export async function decryptNotification(
  payload: {
    ciphertext: Uint8Array;
    salt: Uint8Array;
    publicKey: Uint8Array;
  },
  keys: {
    authSecret: Uint8Array;
    privateKey: CryptoKey;
    publicKey: Uint8Array;
  },
): Promise<string> {
  try {
    // Import application server's public key
    const asPublicKey = await crypto.subtle.importKey(
      "raw",
      payload.publicKey.buffer.slice(
        payload.publicKey.byteOffset,
        payload.publicKey.byteOffset + payload.publicKey.byteLength,
      ) as ArrayBuffer,
      {
        name: "ECDH",
        namedCurve: "P-256",
      },
      false,
      [],
    );

    // Calculate shared secret
    const sharedSecret = await computeSharedSecret(keys.privateKey, asPublicKey);

    // Use Niconico pattern (WebPush: info)
    // Follow the pattern in push.md
    const authInfo = new TextEncoder().encode("WebPush: info\0");
    const context = new Uint8Array(keys.publicKey.length + payload.publicKey.length);
    context.set(keys.publicKey, 0);
    context.set(payload.publicKey, keys.publicKey.length);

    const prkInfo = new Uint8Array(authInfo.length + context.length);
    prkInfo.set(authInfo);
    prkInfo.set(context, authInfo.length);

    const prk = await hkdf(keys.authSecret, sharedSecret, prkInfo, 32);

    // Derive Nonce and CEK
    const nonceInfo = new TextEncoder().encode("Content-Encoding: nonce\0");
    const cekInfo = new TextEncoder().encode("Content-Encoding: aes128gcm\0");

    const baseNonce = await hkdf(payload.salt, prk, nonceInfo, 12);
    const cek = await hkdf(payload.salt, prk, cekInfo, 16);

    // Generate nonce (chunk index 0)
    const nonce = new Uint8Array(baseNonce);
    // XOR for record index 0 is unnecessary (already 0)

    // Decrypt with AES-GCM
    const cekBuffer =
      cek.buffer instanceof ArrayBuffer
        ? (cek.buffer.slice(cek.byteOffset, cek.byteOffset + cek.byteLength) as ArrayBuffer)
        : (cek as unknown as ArrayBuffer);
    const key = await crypto.subtle.importKey("raw", cekBuffer, { name: "AES-GCM" }, false, [
      "decrypt",
    ]);

    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: nonce,
        tagLength: 128, // 16 bytes = 128 bits
      },
      key,
      payload.ciphertext.buffer instanceof ArrayBuffer
        ? (payload.ciphertext.buffer.slice(
            payload.ciphertext.byteOffset,
            payload.ciphertext.byteOffset + payload.ciphertext.byteLength,
          ) as ArrayBuffer)
        : (payload.ciphertext as unknown as ArrayBuffer),
    );

    // Process decrypted data
    const decryptedBytes = new Uint8Array(decrypted);

    // Check the last byte (possible delimiter)
    let processedBytes = decryptedBytes;
    if (decryptedBytes.length > 0) {
      const lastByte = decryptedBytes[decryptedBytes.length - 1];

      // Remove RFC8188 delimiter (0x02 is the final record delimiter)
      if (lastByte === 0x02) {
        processedBytes = decryptedBytes.slice(0, -1);
      } else if (lastByte === 0x01) {
        processedBytes = decryptedBytes.slice(0, -1);
      }
    }

    // Niconico push notifications may contain JSON directly without padding
    // Check the first byte
    if (processedBytes.length > 0) {
      const firstByte = processedBytes[0];

      // If it starts with JSON start character '{' (0x7b) or '[' (0x5b)
      if (firstByte === 0x7b || firstByte === 0x5b) {
        // No padding, direct JSON data
        const result = new TextDecoder().decode(processedBytes);
        return result;
      }

      // If there is padding
      const paddingLength = firstByte;

      // Check validity of padding length
      if (paddingLength === 0) {
        // If padding length is 0, payload starts from next byte
        const plaintext = processedBytes.slice(1);
        const result = new TextDecoder().decode(plaintext);
        return result;
      } else if (paddingLength + 1 <= processedBytes.length) {
        // Normal padding processing
        const plaintext = processedBytes.slice(paddingLength + 1);
        const result = new TextDecoder().decode(plaintext);
        return result;
      } else {
        // If padding length is invalid, assume no padding
        const result = new TextDecoder().decode(processedBytes);
        return result;
      }
    }

    throw new Error("Decrypted data is empty");
  } catch (error) {
    console.error("[Decrypt] ❌ Decryption failed:", error);
    console.error("[Decrypt] Error name:", (error as Error).name);
    console.error("[Decrypt] Error message:", (error as Error).message);
    throw error;
  }
}
