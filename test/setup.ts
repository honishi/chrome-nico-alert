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

if (typeof globalThis.crypto === "undefined") {
  // Keep the property read-only to align with runtime behaviour in Node.js 20+
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto as unknown as Crypto,
    configurable: false,
    enumerable: false,
    writable: false,
  });
}
