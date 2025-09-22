/**
 * Jest test setup
 */

// Polyfill for crypto in Node.js environment
import { webcrypto } from "crypto";

// @ts-ignore
global.crypto = webcrypto as Crypto;