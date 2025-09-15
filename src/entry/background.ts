import "reflect-metadata";
import { InjectTokens } from "../di/inject-tokens";
import { Background } from "../domain/usecase/background";
import { container } from "tsyringe";
import { configureDefaultContainer } from "../di/register";
import { PushManager } from "../domain/infra-interface/push-manager";
import { BrowserApi } from "../domain/infra-interface/browser-api";

// Receives keep-alive message from offscreen window just to wake up the background script.
// https://stackoverflow.com/a/66618269
function configureKeepAliveListener() {
  self.onmessage = (event) => {
    console.log(new Date(), "onmessage", event);
  };
}

function configureNotificationsListener(background: Background) {
  chrome.notifications.onClicked.addListener(async (notificationId) => {
    // console.log(`notification clicked: ${notificationId}`);
    await background.openNotification(notificationId);
  });
}

function configureRuntimeListener(background: Background) {
  chrome.runtime.onInstalled.addListener(async (details) => {
    console.log("onInstalled", details);
    await background.run();
  });
  chrome.runtime.onStartup.addListener(async () => {
    console.log("onStartup");
    await background.run();
  });
  console.log("configureRuntimeListener: done");
}

function configureStorageListener(background: Background) {
  chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName === "local") {
      // Monitor push notification setting changes
      if (changes.receivePushNotification) {
        const newValue = changes.receivePushNotification.newValue;
        const oldValue = changes.receivePushNotification.oldValue;
        console.log(`Push notification setting changed from ${oldValue} to ${newValue}`);

        // Notify Background of setting changes
        await background.handlePushNotificationSettingChange(newValue);
      }
    }
  });
  console.log("Storage listener configured");
}

function configureMessageListener() {
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.type === "GET_PUSH_STATUS") {
      // Get PushManager status
      const pushManager = container.resolve<PushManager>(InjectTokens.PushManager);
      const browserApi = container.resolve<BrowserApi>(InjectTokens.BrowserApi);

      // Use Promise for async processing
      (async () => {
        const enabled = await browserApi.getReceivePushNotification();
        const lastProgram = pushManager.getLastReceivedProgram();
        const connectRateLimitStatus = pushManager.getConnectRateLimitStatus();
        const status = {
          enabled: enabled,
          connected: pushManager.isConnected(),
          connectionState: pushManager.getConnectionState(),
          lastReceivedProgram: lastProgram
            ? {
                program: lastProgram.program,
                receivedAt: lastProgram.receivedAt.toISOString(),
              }
            : undefined,
          channelId: pushManager.getChannelId(),
          uaid: pushManager.getUaid(),
          connectRateLimitStatus: connectRateLimitStatus
            ? {
                currentAttempts: connectRateLimitStatus.currentAttempts,
                maxAttempts: connectRateLimitStatus.maxAttempts,
                lastAttemptTime: connectRateLimitStatus.lastAttemptTime?.toISOString(),
              }
            : undefined,
        };
        sendResponse(status);
      })();

      return true; // Indicates async response
    } else if (request.type === "START_PUSH") {
      // Start push notifications
      const pushManager = container.resolve<PushManager>(InjectTokens.PushManager);

      (async () => {
        try {
          await pushManager.start();
          sendResponse({ success: true });
        } catch (error) {
          console.error("Failed to start push notification:", error);
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      })();

      return true; // Indicates async response
    } else if (request.type === "STOP_PUSH") {
      // Stop push notifications
      const pushManager = container.resolve<PushManager>(InjectTokens.PushManager);

      (async () => {
        try {
          await pushManager.stop();
          sendResponse({ success: true });
        } catch (error) {
          console.error("Failed to stop push notification:", error);
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      })();

      return true; // Indicates async response
    }
  });
  console.log("Message listener configured");
}

function configureListener(background: Background) {
  configureKeepAliveListener();
  configureNotificationsListener(background);
  configureRuntimeListener(background);
  configureStorageListener(background);
  configureMessageListener();
}

configureDefaultContainer();
const background = container.resolve<Background>(InjectTokens.Background);
configureListener(background);
console.log("Background script configured.");
await background.run();
console.log("Background script started.");
