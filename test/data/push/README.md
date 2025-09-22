# RFC8291 Crypto Test Data Setup

This directory contains test data for Web Push (RFC8291) encryption/decryption tests.

## Setup Instructions

To run tests with real data:

1. **Copy example files to create test data files:**
   ```bash
   cp test-keys.example.json test-keys.json
   cp test-payload.example.json test-payload.json
   cp expected-output.example.json expected-output.json
   ```

2. **Replace dummy values with real test data**
   - Get real keys and payload from Chrome extension console logs
   - See instructions in each example file for details

3. **Run tests:**
   ```bash
   npm test rfc8291-crypto
   ```

## Important Security Notes

⚠️ **NEVER commit real test data files to the repository!**

- `test-keys.json` - Contains private keys and auth secrets
- `test-payload.json` - Contains encrypted payload
- `expected-output.json` - Contains decrypted notification data

These files are listed in `.gitignore` to prevent accidental commits.

## File Descriptions

### Example Files (safe to commit)
- `test-keys.example.json` - Example structure for encryption keys
- `test-payload.example.json` - Example structure for encrypted payload
- `expected-output.example.json` - Example structure for expected decrypted output

### Test Data Files (DO NOT commit)
- `test-keys.json` - Real encryption keys (authSecret, publicKey, privateKey)
- `test-payload.json` - Real encrypted payload from Push notification
- `expected-output.json` - Real decrypted JSON output

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