import "reflect-metadata";
import { configureDefaultContainer } from "../di/register";
import { container } from "tsyringe";
import { InjectTokens } from "../di/inject-tokens";
import { Option } from "../domain/usecase/option";
import React from "react";
import AutoOpenUser from "./component/AutoOpenUser";
import { createRoot } from "react-dom/client";

async function renderPage() {
  await renderSoundVolume();
  await renderAutoOpen();
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
      <AutoOpenUser
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
