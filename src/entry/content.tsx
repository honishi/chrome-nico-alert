import "reflect-metadata";
import { container } from "tsyringe";
import { InjectTokens } from "../di/inject-tokens";
import { Content } from "../domain/usecase/content";
import { configureDefaultContainer } from "../di/register";
import { createRoot } from "react-dom/client";
import AutoOpenToggleButton, {
  autoOpenButtonTag,
  AutoOpenButtonType,
} from "./component/AutoOpenToggleButton";
import React from "react";

const MY_FOLLOW_PAGE_URL = "https://www.nicovideo.jp/my/follow";
const USER_PAGE_URL = "https://www.nicovideo.jp/user";
const CHANNEL_PAGE_URL = "https://ch.nicovideo.jp/";

let fixingFollowPage = false;

function isMyFollowPage(): boolean {
  return window.location.href.startsWith(MY_FOLLOW_PAGE_URL);
}

function isUserPage(): boolean {
  return window.location.href.startsWith(USER_PAGE_URL);
}

function isChannelPage(): boolean {
  return window.location.href.startsWith(CHANNEL_PAGE_URL);
}

async function listenLoadEvent() {
  console.log("listenLoadEvent");
  await fixFollowPage();
  await fixUserPage();
  await fixChannelPage();
}

async function fixFollowPage() {
  if (!isMyFollowPage()) {
    // console.log("not target");
    return;
  }
  const userPageMain = document.getElementsByClassName("UserPage-main")[0];
  if (userPageMain === null || !(userPageMain instanceof Node)) {
    console.log("userPageMain is null");
    return;
  }
  const observer = new MutationObserver(async () => {
    // console.log("MutationObserver", mutations);
    await fixMyFollowPage();
  });
  observer.observe(userPageMain, {
    childList: true,
    subtree: true,
  });
  await fixMyFollowPage();
}

async function fixMyFollowPage() {
  // console.log("fix target", window.location.href);
  if (!isMyFollowPage()) {
    return;
  }
  if (fixingFollowPage) {
    return;
  }
  fixingFollowPage = true;

  const content = container.resolve<Content>(InjectTokens.Content);

  const userItems = document.getElementsByClassName("UserItem");

  for (const userItem of userItems) {
    const existingButtons = userItem.getElementsByTagName("button");
    const _existingButtons = [...existingButtons];
    const isExisting = _existingButtons
      .map((button) => button.dataset.tag)
      .includes(autoOpenButtonTag);
    if (isExisting) {
      continue;
    }
    const userItemLink = userItem.getElementsByClassName("UserItem-link")[0] as HTMLAnchorElement;
    if (userItemLink === undefined) {
      // console.log("userItemLink is undefined");
      continue;
    }
    const userId = content.extractUserIdFromUrl(userItemLink.href);
    const div = document.createElement("div");
    userItem.appendChild(div);
    createRoot(div).render(
      <AutoOpenToggleButton
        userId={userId}
        buttonType={AutoOpenButtonType.FollowPage}
        isOn={await content.isAutoOpenUser(userId)}
        onClick={() => onToggleAutoOpen(userId)}
      />,
    );
  }

  fixingFollowPage = false;
}

async function fixUserPage() {
  if (!isUserPage()) {
    return;
  }
  const content = container.resolve<Content>(InjectTokens.Content);

  const userPageButtonContainer = document.getElementsByClassName("UserDetailsHeader-buttons")[0];
  if (userPageButtonContainer === undefined) {
    // console.log("userPageHeader is undefined");
    return;
  }
  const userId = content.extractUserIdFromUrl(window.location.href);
  const div = document.createElement("div");
  userPageButtonContainer.appendChild(div);
  createRoot(div).render(
    <AutoOpenToggleButton
      userId={userId}
      buttonType={AutoOpenButtonType.UserPage}
      isOn={await content.isAutoOpenUser(userId)}
      onClick={() => onToggleAutoOpen(userId)}
    />,
  );
}

async function onToggleAutoOpen(userId: string): Promise<boolean> {
  const content = container.resolve<Content>(InjectTokens.Content);
  const targetOnOff = !(await content.isAutoOpenUser(userId));
  await content.setAutoOpenUser(userId, targetOnOff);
  return targetOnOff;
}

async function fixChannelPage() {
  if (!isChannelPage()) {
    return;
  }
  const content = container.resolve<Content>(InjectTokens.Content);

  const channelPageHeader = document.getElementsByClassName("join_leave")[0];
  if (channelPageHeader === undefined) {
    // console.log("channelPageHeader is undefined");
    return;
  }
  const channelId = await content.resolveChannelIdFromUrl(window.location.href);
  // console.log("channelId", channelId);
  if (channelId === undefined) {
    // console.log("channelId is undefined");
    return;
  }
  const div = document.createElement("div");
  channelPageHeader.appendChild(div);
  createRoot(div).render(
    <AutoOpenToggleButton
      userId={channelId}
      buttonType={AutoOpenButtonType.UserPage}
      isOn={await content.isAutoOpenUser(channelId)}
      onClick={() => onToggleAutoOpen(channelId)}
    />,
  );
}

/**
 * Register push notification endpoint to Niconico API
 * Called from Background Script
 */
async function registerPushEndpoint(
  endpoint: string,
  keys: { p256dh: string; auth: string },
): Promise<{ success: boolean; status?: number; error?: string }> {
  try {
    console.log("[Content Script] Registering push endpoint to Niconico API");
    console.log("[Content Script] Endpoint:", endpoint);

    // Keys are already sent in standard Base64 format
    // p256dh is 65 bytes uncompressed format (with 0x04 prefix)
    const p256dhBase64 = keys.p256dh;
    const authBase64 = keys.auth;

    console.log("[Content Script] Keys (Standard Base64):", {
      p256dh: p256dhBase64.substring(0, 20) + "...",
      auth: authBase64.substring(0, 20) + "...",
      p256dhLength: p256dhBase64.length,
      authLength: authBase64.length,
    });

    // Format according to Niconico API expectations
    const requestBody = {
      destApp: "nico_account_webpush", // Required field
      endpoint: {
        endpoint: endpoint,
        auth: authBase64, // Standard Base64
        p256dh: p256dhBase64, // Standard Base64 (uncompressed format 65 bytes)
      },
    };

    console.log("[Content Script] Request body:", JSON.stringify(requestBody, null, 2));

    // Debug: Check current page origin
    console.log("[Content Script] Current origin:", window.location.origin);
    console.log("[Content Script] Current URL:", window.location.href);
    console.log(
      "[Content Script] Document cookies:",
      document.cookie ? "Available (but httpOnly cookies not visible)" : "No cookies",
    );

    // Log request headers
    // Match Niconico's actual Service Worker implementation
    const headers = {
      "Content-Type": "application/json",
      "X-Request-With": window.location.href, // Niconico implementation uses location.href
      Accept: "application/json",
      "X-Frontend-Id": "8",
      Origin: "https://account.nicovideo.jp", // Explicitly add Origin header
    };
    console.log("[Content Script] Request headers:", headers);

    const response = await fetch(
      "https://api.push.nicovideo.jp/v1/nicopush/webpush/endpoints.json",
      {
        method: "POST",
        credentials: "include", // Automatically send cookies
        mode: "cors", // Explicitly specify CORS mode
        headers: headers,
        body: JSON.stringify(requestBody),
      },
    );

    if (response.ok) {
      console.log("[Content Script] Push endpoint registered successfully");
      return { success: true, status: response.status };
    } else {
      const errorText = await response.text();
      console.error("[Content Script] Failed to register:", response.status, errorText);
      return { success: false, status: response.status, error: errorText };
    }
  } catch (error) {
    console.error("[Content Script] Registration error:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function unregisterPushEndpoint(
  endpoint: string,
): Promise<{ success: boolean; status?: number; error?: string }> {
  try {
    console.log("[Content Script] Unregistering push endpoint from Niconico API");
    console.log("[Content Script] Endpoint:", endpoint);

    // Format request body according to Niconico API expectations
    const requestBody = {
      destApp: "nico_account_webpush", // Required field
      endpoint: {
        endpoint: endpoint,
      },
    };

    console.log("[Content Script] Request body:", JSON.stringify(requestBody, null, 2));

    // Debug: Check current page origin
    console.log("[Content Script] Current origin:", window.location.origin);
    console.log("[Content Script] Current URL:", window.location.href);

    // Match Niconico's actual implementation
    const headers = {
      "Content-Type": "application/json",
      "X-Request-With": window.location.href,
      Accept: "application/json",
      "X-Frontend-Id": "8",
      Origin: "https://account.nicovideo.jp",
    };
    console.log("[Content Script] Request headers:", headers);

    const response = await fetch(
      "https://api.push.nicovideo.jp/v1/nicopush/webpush/endpoints.json",
      {
        method: "DELETE",
        credentials: "include", // Automatically send cookies
        mode: "cors", // Explicitly specify CORS mode
        headers: headers,
        body: JSON.stringify(requestBody),
      },
    );

    if (response.ok) {
      console.log("[Content Script] Push endpoint unregistered successfully");
      return { success: true, status: response.status };
    } else {
      const errorText = await response.text();
      console.error("[Content Script] Failed to unregister:", response.status, errorText);
      return { success: false, status: response.status, error: errorText };
    }
  } catch (error) {
    console.error("[Content Script] Unregistration error:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Process messages from Background Script
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log("[Content Script] Received message:", message.type);

  // Respond to PING message (for Content Script existence check)
  if (message.type === "PING") {
    sendResponse({ success: true });
    return;
  }

  if (message.type === "REGISTER_PUSH_ENDPOINT") {
    // Return true to keep sendResponse for async processing
    registerPushEndpoint(message.endpoint, message.keys)
      .then((result) => {
        console.log("[Content Script] Sending response:", result);
        sendResponse(result);
      })
      .catch((error) => {
        console.error("[Content Script] Error:", error);
        sendResponse({ success: false, error: String(error) });
      });
    return true; // Required for async response
  }

  if (message.type === "UNREGISTER_PUSH_ENDPOINT") {
    // Return true to keep sendResponse for async processing
    unregisterPushEndpoint(message.endpoint)
      .then((result) => {
        console.log("[Content Script] Sending unregister response:", result);
        sendResponse(result);
      })
      .catch((error) => {
        console.error("[Content Script] Unregister error:", error);
        sendResponse({ success: false, error: String(error) });
      });
    return true; // Required for async response
  }
});

configureDefaultContainer();
window.addEventListener("load", listenLoadEvent);
