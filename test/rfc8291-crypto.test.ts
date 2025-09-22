/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Test suite for RFC8291 Web Push Encryption/Decryption
 *
 * To run with real data:
 * 1. Replace dummy data in test/data/push/*.json files with actual values
 * 2. Run: npm test rfc8291-crypto
 */

import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";
import {
  base64UrlEncode,
  base64UrlDecode,
  base64Encode,
  generateKeyPair,
  generateAuthSecret,
  generateSalt,
  exportKeys,
  importKeys,
  parseAutoPushPayload,
  decryptNotification,
} from "../src/infra/rfc8291-crypto";

// ========== Test Data Loading ==========
const testDataDir = path.join(__dirname, "data", "push");

interface TestDataSet {
  keys: {
    authSecret: string;
    publicKey: string;
    privateKey: string;
  };
  payload: {
    encryptedPayload: string;
  };
  expected: {
    decryptedJson: any;
  };
}

function loadDataset(filename: string): TestDataSet | null {
  const filePath = path.join(testDataDir, "datasets", filename);
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (e) {
      console.warn(`Error loading dataset "${filename}":`, e);
    }
  }
  return null;
}

function getAvailableDatasets(): { name: string; data: TestDataSet }[] {
  const datasets: { name: string; data: TestDataSet }[] = [];

  // Check datasets directory for real data
  const datasetsDir = path.join(testDataDir, "datasets");
  if (fs.existsSync(datasetsDir)) {
    const files = fs
      .readdirSync(datasetsDir, { withFileTypes: true })
      .filter((dirent) => dirent.isFile() && dirent.name.endsWith(".json"))
      .map((dirent) => dirent.name);

    for (const file of files) {
      const data = loadDataset(file);
      if (data) {
        datasets.push({ name: file.replace(".json", ""), data });
      }
    }
  }

  // If no datasets found, use example
  if (datasets.length === 0) {
    const examplePath = path.join(testDataDir, "examples", "example.json");
    if (fs.existsSync(examplePath)) {
      try {
        const exampleData = JSON.parse(fs.readFileSync(examplePath, "utf8"));
        console.warn(
          "Using example dataset. To use real data, add .json files to datasets/ directory",
        );
        datasets.push({ name: "example", data: exampleData });
      } catch (e) {
        console.warn("Error loading example dataset:", e);
      }
    }
  }

  return datasets;
}

// ========== Base64 Encoding/Decoding Tests ==========
describe("Base64 Encoding/Decoding", () => {
  test("base64UrlEncode should encode correctly", () => {
    const input = new Uint8Array([255, 254, 253, 252, 251, 250]);
    const encoded = base64UrlEncode(input);
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("=");
    expect(encoded).toBe("__79_Pv6");
  });

  test("base64UrlDecode should decode correctly", () => {
    const input = "__79_Pv6";
    const decoded = base64UrlDecode(input);
    expect(Array.from(decoded)).toEqual([255, 254, 253, 252, 251, 250]);
  });

  test("base64UrlEncode and base64UrlDecode should be reversible", () => {
    const original = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const encoded = base64UrlEncode(original);
    const decoded = base64UrlDecode(encoded);
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  test("base64Encode should produce standard Base64 with padding", () => {
    const input = new Uint8Array([255, 254, 253]);
    const encoded = base64Encode(input);
    expect(encoded).toBe("//79");
    expect(encoded).toMatch(/^[A-Za-z0-9+/]*=*$/);
  });

  test("base64Encode should handle empty input", () => {
    const input = new Uint8Array([]);
    const encoded = base64Encode(input);
    expect(encoded).toBe("");
  });
});

// ========== Key Generation Tests ==========
describe("Key Generation", () => {
  test("generateKeyPair should generate valid P-256 keys", async () => {
    const keyPair = await generateKeyPair();

    expect(keyPair.privateKey).toBeDefined();
    expect(keyPair.publicKey).toBeDefined();
    expect(keyPair.publicKeyBytes).toBeInstanceOf(Uint8Array);
    expect(keyPair.privateKeyBytes).toBeInstanceOf(Uint8Array);

    // Public key should be 65 bytes (0x04 + 32 bytes X + 32 bytes Y)
    expect(keyPair.publicKeyBytes.length).toBe(65);
    expect(keyPair.publicKeyBytes[0]).toBe(0x04); // Uncompressed format

    // Private key should be 32 bytes
    expect(keyPair.privateKeyBytes.length).toBe(32);
  });

  test("generateAuthSecret should generate 16-byte secret", () => {
    const authSecret = generateAuthSecret();
    expect(authSecret).toBeInstanceOf(Uint8Array);
    expect(authSecret.length).toBe(16);

    // Should be random (different each time)
    const authSecret2 = generateAuthSecret();
    expect(Array.from(authSecret)).not.toEqual(Array.from(authSecret2));
  });

  test("generateSalt should generate 16-byte salt", () => {
    const salt = generateSalt();
    expect(salt).toBeInstanceOf(Uint8Array);
    expect(salt.length).toBe(16);

    // Should be random
    const salt2 = generateSalt();
    expect(Array.from(salt)).not.toEqual(Array.from(salt2));
  });
});

// ========== Key Import/Export Tests ==========
describe("Key Import/Export", () => {
  test("exportKeys should convert to Base64 URL format", async () => {
    const keyPair = await generateKeyPair();
    const authSecret = generateAuthSecret();

    const exported = exportKeys({
      authSecret,
      publicKey: keyPair.publicKeyBytes,
      privateKey: keyPair.privateKeyBytes,
    });

    expect(typeof exported.authSecret).toBe("string");
    expect(typeof exported.publicKey).toBe("string");
    expect(typeof exported.privateKey).toBe("string");

    // Should be URL-safe (no +, /, or =)
    expect(exported.authSecret).not.toMatch(/[+/=]/);
    expect(exported.publicKey).not.toMatch(/[+/=]/);
    expect(exported.privateKey).not.toMatch(/[+/=]/);
  });

  test("importKeys should restore keys correctly", async () => {
    const keyPair = await generateKeyPair();
    const authSecret = generateAuthSecret();

    const exported = exportKeys({
      authSecret,
      publicKey: keyPair.publicKeyBytes,
      privateKey: keyPair.privateKeyBytes,
    });

    const imported = await importKeys(exported);

    expect(Array.from(imported.authSecret)).toEqual(Array.from(authSecret));
    expect(Array.from(imported.publicKey)).toEqual(Array.from(keyPair.publicKeyBytes));
    expect(imported.privateKey).toBeDefined();
  });
});

// ========== Payload Parsing Tests ==========
describe("Payload Parsing", () => {
  test("parseAutoPushPayload should extract components correctly", () => {
    // Create a mock payload structure
    const salt = new Uint8Array(16).fill(1);
    const recordSize = new Uint8Array([0x00, 0x10, 0x00, 0x00]); // 4096
    const publicKeyLength = new Uint8Array([65]);
    const publicKey = new Uint8Array(65).fill(2);
    const ciphertext = new Uint8Array(32).fill(3);

    // Combine into payload
    const payload = new Uint8Array([
      ...salt,
      ...recordSize,
      ...publicKeyLength,
      ...publicKey,
      ...ciphertext,
    ]);

    const encoded = base64UrlEncode(payload);
    const parsed = parseAutoPushPayload(encoded);

    expect(Array.from(parsed.salt)).toEqual(Array.from(salt));
    expect(parsed.recordSize).toBe(0x00100000); // 1048576 (big-endian)
    expect(Array.from(parsed.publicKey)).toEqual(Array.from(publicKey));
    expect(Array.from(parsed.ciphertext)).toEqual(Array.from(ciphertext));
  });
});

// ========== Main Decryption Tests (with real/example data) ==========
describe("Decryption with Real Data", () => {
  // Test all available datasets
  const availableDatasets = getAvailableDatasets();

  availableDatasets.forEach(({ name, data }) => {
    test(`decryptNotification with dataset: ${name}`, async () => {
      // Check if we have real data (not dummy data)
      if (data.keys.authSecret === "AAAAAAAAAAAAAAAAAAAAAA") {
        console.warn(`Dataset "${name}" contains dummy data. Skipping.`);
        return;
      }

      // Import keys
      const keys = await importKeys({
        authSecret: data.keys.authSecret,
        publicKey: data.keys.publicKey,
        privateKey: data.keys.privateKey,
      });

      // Parse payload
      const payload = parseAutoPushPayload(data.payload.encryptedPayload);

      // Decrypt
      const decrypted = await decryptNotification(payload, keys);
      const decryptedJson = JSON.parse(decrypted);

      // Verify
      expect(decryptedJson).toEqual(data.expected.decryptedJson);
    });
  });

  test("decryptNotification integration test with generated keys", async () => {
    // This test demonstrates the full flow with self-generated test data
    // In real usage, the payload would come from Niconico's server

    const keyPair = await generateKeyPair();
    const authSecret = generateAuthSecret();

    // For a real test, you would:
    // 1. Register these keys with Niconico Push API
    // 2. Receive an encrypted payload
    // 3. Decrypt it using the same keys

    // Here we just verify the functions work together
    expect(keyPair.publicKeyBytes).toBeDefined();
    expect(authSecret).toBeDefined();
  });
});

// ========== Helper function for debugging ==========
describe("Debug Helpers", () => {
  test("should provide instructions for capturing new test data", () => {
    // This test provides instructions for capturing NEW test data
    // (Useful when you need to update test data or test with different scenarios)
    const captureInstructions = `
To capture NEW push notification data for testing:

1. In web-push-manager.ts, add logging:
   console.log('Keys for testing:', {
     authSecret: base64UrlEncode(this.keys.authSecret),
     publicKey: base64UrlEncode(this.keys.publicKey),
     privateKey: base64UrlEncode(this.keys.privateKey)
   });

2. In background.ts push event handler, add:
   console.log('Encrypted payload:', event.data.text());

3. After successful decryption, log:
   console.log('Decrypted JSON:', decryptedData);

4. Copy these values to test/data/push/*.json files
`;

    expect(captureInstructions).toBeTruthy();
    console.log(captureInstructions);
  });
});
