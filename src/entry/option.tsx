import "reflect-metadata";
import { configureDefaultContainer } from "../di/register";
import { container } from "tsyringe";
import { InjectTokens } from "../di/inject-tokens";
import { Option } from "../domain/usecase/option";
import React from "react";
import DeleteUserRow from "./component/DeleteUserRow";
import { createRoot } from "react-dom/client";

async function renderPage() {
  await renderShowRankingCheckbox();
  await renderShowNotificationCheckbox();
  await renderSoundVolume();
  await renderAutoOpen();
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
  const showNotificationCheckbox = document.getElementById("show-notification-checkbox") as HTMLInputElement;
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
