import "reflect-metadata";
import { configureDefaultContainer } from "../di/register";
import { container } from "tsyringe";
import { InjectTokens } from "../di/inject-tokens";
import { Option } from "../domain/usecase/option";
import { BrowserApi } from "../domain/infra-interface/browser-api";
import { SoundType } from "../domain/model/sound-type";
import React from "react";
import DeleteUserRow from "./component/DeleteUserRow";
import { createRoot } from "react-dom/client";

async function renderPage() {
  await renderShowComingCheckbox();
  await renderShowRankingCheckbox();
  await renderShowNotificationCheckbox();
  await renderSoundVolume();
  await renderCustomSound();
  await renderReceivePushNotificationCheckbox();
  await renderAutoOpen();
  setupResetGuidanceButton();
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

async function updateSoundStatus(
  soundType: SoundType,
  statusElement: HTMLSpanElement,
  browserApi: BrowserApi,
): Promise<void> {
  const file = await browserApi.getCustomSoundFile(soundType);
  if (file) {
    statusElement.textContent = file.fileName;
    statusElement.style.color = "#28a745"; // Green
  } else {
    statusElement.textContent = "未設定";
    statusElement.style.color = "#6c757d"; // Gray
  }
}

function setupCustomSoundHandlers(
  soundType: SoundType,
  inputId: string,
  testButtonId: string,
  clearButtonId: string,
  statusElement: HTMLSpanElement,
  browserApi: BrowserApi,
  updateStatus: () => Promise<void>,
): void {
  const input = document.getElementById(inputId) as HTMLInputElement;
  const testButton = document.getElementById(testButtonId) as HTMLButtonElement;
  const clearButton = document.getElementById(clearButtonId) as HTMLButtonElement;

  // File input handler
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (file) {
      // Check file size (3MB limit to ensure it fits in chrome.storage.local after base64 encoding)
      const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3MB
      if (file.size > MAX_FILE_SIZE) {
        const fileSizeMB = (file.size / 1024 / 1024).toFixed(2);
        console.warn(`File size exceeded: ${fileSizeMB}MB (max: 3MB)`);
        statusElement.textContent = `エラー: ファイルサイズ超過 (${fileSizeMB}MB)`;
        statusElement.style.color = "#dc3545"; // Red
        input.value = ""; // Clear the input
        // Reset status after 3 seconds
        setTimeout(async () => {
          await updateStatus();
        }, 3000);
        return;
      }

      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        try {
          await browserApi.setCustomSoundFile(soundType, file.name, dataUrl);
          await updateStatus();
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          console.error("Failed to save custom sound file:", errorMsg);
          statusElement.textContent = `エラー: 保存失敗`;
          statusElement.style.color = "#dc3545"; // Red
          input.value = ""; // Clear the input
          // Reset status after 3 seconds
          setTimeout(async () => {
            await updateStatus();
          }, 3000);
        }
      };
      reader.readAsDataURL(file);
    }
  });

  // Test button handler
  testButton.addEventListener("click", async () => {
    await browserApi.playSound(soundType);
  });

  // Clear button handler
  clearButton.addEventListener("click", async () => {
    await browserApi.clearCustomSoundFile(soundType);
    input.value = "";
    await updateStatus();
  });
}

async function renderCustomSound() {
  const browserApi = container.resolve<BrowserApi>(InjectTokens.BrowserApi);

  const mainStatus = document.getElementById("custom-sound-main-status") as HTMLSpanElement;
  const subStatus = document.getElementById("custom-sound-sub-status") as HTMLSpanElement;

  // Update status displays
  const updateStatus = async () => {
    await updateSoundStatus(SoundType.NEW_LIVE_MAIN, mainStatus, browserApi);
    await updateSoundStatus(SoundType.NEW_LIVE_SUB, subStatus, browserApi);
  };

  await updateStatus();

  // Setup handlers for both sound types
  setupCustomSoundHandlers(
    SoundType.NEW_LIVE_MAIN,
    "custom-sound-main-input",
    "play-test-main-sound-button",
    "clear-custom-sound-main-button",
    mainStatus,
    browserApi,
    updateStatus,
  );

  setupCustomSoundHandlers(
    SoundType.NEW_LIVE_SUB,
    "custom-sound-sub-input",
    "play-test-sub-sound-button",
    "clear-custom-sound-sub-button",
    subStatus,
    browserApi,
    updateStatus,
  );
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

async function resetAllGuidance(): Promise<void> {
  const option = container.resolve<Option>(InjectTokens.Option);
  await option.resetAllGuidanceDismissed();
}

async function handleResetGuidance(): Promise<void> {
  const button = document.getElementById("reset-guidance-button") as HTMLButtonElement;
  if (!button) return;

  const originalText = button.textContent || "";

  // Disable button
  button.disabled = true;

  try {
    // Reset all guidance dismissed flags
    await resetAllGuidance();

    // Show success state
    button.textContent = "リセット完了";
    button.classList.add("success");

    // Restore after 2 seconds
    setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove("success");
      button.disabled = false;
    }, 2000);
  } catch (error) {
    console.error("Failed to reset guidance flags:", error);
    button.textContent = originalText;
    button.disabled = false;
  }
}

function setupResetGuidanceButton(): void {
  const button = document.getElementById("reset-guidance-button");
  if (button) {
    button.onclick = async () => {
      await handleResetGuidance();
    };
  }
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
