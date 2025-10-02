import { PushStatus } from "../../domain/model/push-status";

/**
 * Get push notification status from background script
 */
export async function getPushStatus(): Promise<PushStatus> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_PUSH_STATUS" }, (response) => {
      // Check for chrome.runtime.lastError
      if (chrome.runtime.lastError) {
        console.warn("Failed to get push status:", chrome.runtime.lastError.message);
        // Return safe default
        resolve({
          enabled: false,
          connected: false,
          connectionState: "error",
        });
        return;
      }

      // Check if response is valid
      if (!response) {
        console.warn("Push status response is undefined");
        resolve({
          enabled: false,
          connected: false,
          connectionState: "error",
        });
        return;
      }

      resolve(response);
    });
  });
}
