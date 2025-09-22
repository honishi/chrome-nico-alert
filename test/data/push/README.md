# RFC8291 Crypto Test Data Setup

This directory contains test data for Web Push (RFC8291) encryption/decryption tests.

## Directory Structure

```
test/data/push/
├── datasets/           # Real test data (gitignored)
│   ├── default/       # Default dataset
│   │   ├── keys.json
│   │   ├── payload.json
│   │   └── expected.json
│   └── case1/         # Additional test cases
│       └── ...
├── examples/          # Example data (committed to repo)
│   └── default/
│       ├── keys.json
│       ├── payload.json
│       └── expected.json
└── README.md
```

## Setup Instructions

### For single dataset (default):

1. **Copy example files to create test dataset:**
   ```bash
   cp -r examples/default datasets/default
   ```

2. **Replace dummy values with real test data**
   - Edit files in `datasets/default/`
   - Get real keys and payload from Chrome extension console logs

3. **Run tests:**
   ```bash
   npm test rfc8291-crypto
   ```

### For multiple datasets:

1. **Create additional dataset directories:**
   ```bash
   mkdir -p datasets/case1
   mkdir -p datasets/case2
   ```

2. **Add test data files to each dataset:**
   - `keys.json` - Encryption keys
   - `payload.json` - Encrypted payload
   - `expected.json` - Expected decrypted output

3. **Tests will automatically run for all datasets**

## Important Security Notes

⚠️ **NEVER commit real test data files to the repository!**

The `datasets/` directory is listed in `.gitignore` to prevent accidental commits of sensitive data.

- `datasets/*/keys.json` - Contains private keys and auth secrets
- `datasets/*/payload.json` - Contains encrypted payload
- `datasets/*/expected.json` - Contains decrypted notification data

## File Format

Each dataset consists of three JSON files:

### keys.json
```json
{
  "authSecret": "Base64 URL-safe encoded auth secret",
  "publicKey": "Base64 URL-safe encoded public key",
  "privateKey": "Base64 URL-safe encoded private key"
}
```

### payload.json
```json
{
  "encryptedPayload": "Base64 URL-safe encoded encrypted payload"
}
```

### expected.json
```json
{
  "decryptedJson": {
    // Expected decrypted JSON structure
  }
}
```

## How to Obtain Real Test Data

1. **Enable logging in the Chrome extension:**
   - Add console.log statements in `web-push-manager.ts`
   - Log keys when generating subscription
   - Log payload when receiving push notification

2. **Capture data from Chrome DevTools:**
   - Open extension background page DevTools
   - Enable push notifications in extension options
   - Check console for logged data
   - Copy values to test data files

3. **Test with captured data:**
   - Verify decryption works with your real data
   - Confirm output matches expected format