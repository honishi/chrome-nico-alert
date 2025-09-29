import "reflect-metadata";
import { configureDefaultContainer } from "../di/register";
import { container } from "tsyringe";
import { InjectTokens } from "../di/inject-tokens";
import { Option } from "../domain/usecase/option";
import React from "react";
import DeleteUserRow from "./component/DeleteUserRow";
import { createRoot } from "react-dom/client";

async function renderPage() {
  await renderShowComingCheckbox();
  await renderShowRankingCheckbox();
  await renderShowNotificationCheckbox();
  await renderSoundVolume();
  await renderReceivePushNotificationCheckbox();
  await renderShowPushStatusCheckbox();
  await renderAutoOpen();
}

async function renderShowComingCheckbox() {
  const showComingCheckbox = document.getElementById("show-coming-checkbox") as HTMLInputElement;
  showComingCheckbox.checked = await getShowComing();
  showComingCheckbox.addEventListener("change", async () => {
    const checked = showComingCheckbox.checked;
    await setShowComing(checked);
  });
}

async function getShowComing(): Promise<boolean> {
  const option = container.resolve<Option>(InjectTokens.Option);
  return await option.getShowComing();
}

async function setShowComing(value: boolean): Promise<void> {
  const option = container.resolve<Option>(InjectTokens.Option);
  await option.setShowComing(value);
}

async function renderShowRankingCheckbox() {
  const showRankingCheckbox = document.getElementById("show-ranking-checkbox") as HTMLInputElement;
  showRankingCheckbox.checked = await getShowRanking();
  showRankingCheckbox.addEventListener("change", async () => {
    const checked = showRankingCheckbox.checked;
    await setShowRanking(checked);
  });
}

async function getShowRanking(): Promise<boolean> {
  const option = container.resolve<Option>(InjectTokens.Option);
  return await option.getShowRanking();
}

async function setShowRanking(value: boolean): Promise<void> {
  const option = container.resolve<Option>(InjectTokens.Option);
  await option.setShowRanking(value);
}

async function renderShowNotificationCheckbox() {
  const showNotificationCheckbox = document.getElementById(
    "show-notification-checkbox",
  ) as HTMLInputElement;
  showNotificationCheckbox.checked = await getShowNotification();
  showNotificationCheckbox.addEventListener("change", async () => {
    const checked = showNotificationCheckbox.checked;
    await setShowNotification(checked);
  });
}

async function getShowNotification(): Promise<boolean> {
  const option = container.resolve<Option>(InjectTokens.Option);
  return await option.getShowNotification();
}

async function setShowNotification(value: boolean): Promise<void> {
  const option = container.resolve<Option>(InjectTokens.Option);
  await option.setShowNotification(value);
}

async function renderShowPushStatusCheckbox() {
  const showPushStatusCheckbox = document.getElementById(
    "show-push-status-checkbox",
  ) as HTMLInputElement;
  showPushStatusCheckbox.checked = await getShowPushStatus();
  showPushStatusCheckbox.addEventListener("change", async () => {
    const checked = showPushStatusCheckbox.checked;
    await setShowPushStatus(checked);
  });
}

async function getShowPushStatus(): Promise<boolean> {
  const option = container.resolve<Option>(InjectTokens.Option);
  return await option.getShowPushStatus();
}

async function setShowPushStatus(value: boolean): Promise<void> {
  const option = container.resolve<Option>(InjectTokens.Option);
  await option.setShowPushStatus(value);
}

async function renderSoundVolume() {
  const volumeValue = await getSoundVolumeAsPercentInt();

  const volumeSlider = document.getElementById("volume-slider") as HTMLInputElement;
  volumeSlider.value = volumeValue.toString();
  volumeSlider.addEventListener("input", async () => {
    const value = parseInt(volumeSlider.value);
    await setSoundVolumeAsPercentInt(value);
    await updateVolumeValueText();
  });
  volumeSlider.addEventListener("change", playTestSound);

  await updateVolumeValueText();

  const playTestSoundButton = document.getElementById(
    "play-test-sound-button",
  ) as HTMLButtonElement;
  playTestSoundButton.addEventListener("click", playTestSound);
}

async function updateVolumeValueText() {
  const volumeValue = await getSoundVolumeAsPercentInt();
  const volumeValueText = document.getElementById("volume-value-text") as HTMLSpanElement;
  volumeValueText.textContent = volumeValue.toString();
}

async function getSoundVolumeAsPercentInt(): Promise<number> {
  const option = container.resolve<Option>(InjectTokens.Option);
  const volumeValue = await option.getSoundVolume();
  return Math.round(volumeValue * 100);
}

async function setSoundVolumeAsPercentInt(value: number): Promise<void> {
  const option = container.resolve<Option>(InjectTokens.Option);
  await option.setSoundVolume(value / 100);
}

async function playTestSound() {
  const option = container.resolve<Option>(InjectTokens.Option);
  await option.playTestSound();
}

async function renderReceivePushNotificationCheckbox() {
  const receivePushNotificationCheckbox = document.getElementById(
    "receive-push-notification-checkbox",
  ) as HTMLInputElement;
  const receivePushNotificationLabel = document.querySelector(
    'label[for="receive-push-notification-checkbox"]',
  ) as HTMLLabelElement;

  receivePushNotificationCheckbox.checked = await getReceivePushNotification();
  receivePushNotificationCheckbox.addEventListener("change", async () => {
    const checked = receivePushNotificationCheckbox.checked;

    // Disable checkbox and update label style immediately
    console.log("[Option] Disabling push notification checkbox...");
    receivePushNotificationCheckbox.disabled = true;
    if (receivePushNotificationLabel) {
      receivePushNotificationLabel.style.opacity = "0.5";
      receivePushNotificationLabel.style.cursor = "not-allowed";
    }

    try {
      // Save the setting (this triggers the background script)
      console.log(`[Option] Setting push notification to: ${checked}`);
      await setReceivePushNotification(checked);

      // Wait for completion message from background script
      const waitForCompletion = new Promise<void>((resolve) => {
        const listener = (message: {
          type?: string;
          success?: boolean;
          enabled?: boolean;
          error?: string;
        }) => {
          if (message.type === "PUSH_NOTIFICATION_SETTING_COMPLETE") {
            console.log("[Option] Received completion message:", message);
            chrome.runtime.onMessage.removeListener(listener);
            resolve();
          }
          // Return false to indicate we're not sending a response
          return false;
        };
        chrome.runtime.onMessage.addListener(listener);

        // Set timeout (30 seconds)
        setTimeout(() => {
          console.log("[Option] Timeout waiting for completion message");
          chrome.runtime.onMessage.removeListener(listener);
          resolve();
        }, 30000);
      });

      console.log("[Option] Waiting for background script to complete...");
      await waitForCompletion;
      console.log("[Option] Push notification setting update completed");
    } catch (error) {
      console.error("[Option] Failed to update push notification setting:", error);
      // Revert checkbox on error
      receivePushNotificationCheckbox.checked = !checked;
    } finally {
      // Always re-enable checkbox and reset label style
      console.log("[Option] Re-enabling push notification checkbox");
      receivePushNotificationCheckbox.disabled = false;
      if (receivePushNotificationLabel) {
        receivePushNotificationLabel.style.opacity = "";
        receivePushNotificationLabel.style.cursor = "";
      }
    }
  });
}

async function getReceivePushNotification(): Promise<boolean> {
  const option = container.resolve<Option>(InjectTokens.Option);
  return await option.getReceivePushNotification();
}

async function setReceivePushNotification(value: boolean): Promise<void> {
  const option = container.resolve<Option>(InjectTokens.Option);
  await option.setReceivePushNotification(value);
}

async function renderAutoOpen() {
  const option = container.resolve<Option>(InjectTokens.Option);

  const autoOpenContainer = document.getElementById("auto-open");
  if (autoOpenContainer === null) {
    return;
  }
  autoOpenContainer.innerHTML = "";

  const userIds = await option.getAutoOpenUserIds();
  const userNameResolver = async (userId: string) =>
    await (userId.startsWith("ch") ? option.getChannelName(userId) : option.getUserName(userId));
  const userIdButtons = userIds.map((userId) => {
    const buttonCallback = async () => {
      await option.disableAutoOpen(userId);
    };
    return (
      <DeleteUserRow
        userId={userId}
        userNameResolver={userNameResolver}
        onClick={buttonCallback}
        key={userId}
      />
    );
  });
  createRoot(autoOpenContainer).render(userIdButtons);
}

function addEventListeners() {
  document.addEventListener("DOMContentLoaded", async () => {
    await renderPage();
  });
}

configureDefaultContainer();
addEventListeners();
