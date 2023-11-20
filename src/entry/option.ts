import "reflect-metadata";
import { configureDefaultContainer } from "../di/register";
import { container } from "tsyringe";
import { InjectTokens } from "../di/inject-tokens";
import { Option } from "../domain/usecase/option";

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
  for (const userId of userIds) {
    const userIdDiv = await createUserIdDiv(userId);
    autoOpenContainer.appendChild(userIdDiv);
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(async (entry) => {
      if (!entry.isIntersecting) {
        return;
      }
      const userId = entry.target.getAttribute("user-id");
      if (userId === null) {
        return;
      }
      const text = entry.target.getElementsByClassName("user-name")[0] as HTMLSpanElement;
      const userName = await (userId.startsWith("ch")
        ? option.getChannelName(userId)
        : option.getUserName(userId));
      if (text === null || userName === null) {
        return;
      }
      text.textContent = userName;
      observer.unobserve(entry.target);
    });
  });
  [...autoOpenContainer.children].forEach((userDiv) => observer.observe(userDiv));
}

async function createUserIdDiv(userId: string): Promise<HTMLElement> {
  const option = container.resolve<Option>(InjectTokens.Option);

  const div = document.createElement("div");
  div.className = "auto-open-user-div";
  div.setAttribute("user-id", userId);

  const button = document.createElement("button");
  button.className = "remove-button";
  button.textContent = "[削除]";
  button.addEventListener("click", async () => {
    // console.log("remove", userId);
    await option.disableAutoOpen(userId);
    div.remove();
  });
  div.appendChild(button);

  const text = document.createElement("span");
  text.className = "user-name";
  text.textContent = ".....";
  div.appendChild(text);

  const link = document.createElement("a");
  link.className = "user-link";
  link.text = `(${userId})`;
  link.href = userId.startsWith("ch")
    ? `https://ch.nicovideo.jp/${userId}`
    : `https://www.nicovideo.jp/user/${userId}`;
  link.target = "_blank";
  div.appendChild(link);

  // console.log(div);
  return div;
}

function addEventListeners() {
  document.addEventListener("DOMContentLoaded", async () => {
    await renderPage();
  });
}

configureDefaultContainer();
addEventListeners();
