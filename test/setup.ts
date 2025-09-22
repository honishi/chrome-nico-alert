/**
 * Jest test setup
 */

// Polyfill for crypto in Node.js environment
import { webcrypto } from "crypto";

// Properly type the global crypto
declare global {
  // eslint-disable-next-line no-var
  var crypto: Crypto;
}

global.crypto = webcrypto as unknown as Crypto;
