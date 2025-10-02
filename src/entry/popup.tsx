import "reflect-metadata";
import { container } from "tsyringe";
import { InjectTokens } from "../di/inject-tokens";
import { Popup } from "../domain/usecase/popup";
import { configureDefaultContainer } from "../di/register";
import { createRoot } from "react-dom/client";
import React from "react";
import ComingPrograms from "./component/ComingPrograms";
import FollowingPrograms from "./component/FollowingPrograms";
import RankingPrograms from "./component/RankingPrograms";
import { getPushStatus } from "./utils/push-status";

const SUSPEND_BUTTON_ID = "suspend-button";

async function updatePushGuidanceDisplay() {
  const popup = container.resolve<Popup>(InjectTokens.Popup);
  const guidanceContainer = document.querySelector(".push-guidance-container") as HTMLElement;
  if (!guidanceContainer) return;

  try {
    const status = await getPushStatus();
    const dismissed = await popup.getPushGuidanceDismissed();

    // Show guidance if push is disabled and user hasn't dismissed it
    const shouldShow = !status.enabled && !dismissed;
    guidanceContainer.style.display = shouldShow ? "block" : "none";
  } catch (error) {
    console.error("Failed to update guidance display:", error);
    guidanceContainer.style.display = "none";
  }
}

async function handlePushGuidanceDismiss() {
  const popup = container.resolve<Popup>(InjectTokens.Popup);
  await popup.setPushGuidanceDismissed(true);

  const guidanceContainer = document.querySelector(".push-guidance-container") as HTMLElement;
  if (guidanceContainer) {
    guidanceContainer.style.display = "none";
  }
}

async function renderPage() {
  const popup = container.resolve<Popup>(InjectTokens.Popup);

  const suspendButton = document.getElementById(SUSPEND_BUTTON_ID) as HTMLButtonElement;
  suspendButton.onclick = async () => {
    await toggleSuspended();
    await updateSuspendButton();
  };
  await updateSuspendButton();

  const openOptionsButton = document.getElementById("open-options-button") as HTMLButtonElement;
  openOptionsButton.onclick = () => {
    popup.openOptionsPage();
  };

  // Display and setup push guidance
  await updatePushGuidanceDisplay();
  const pushGuidanceDismissButton = document.getElementById("push-guidance-button");
  if (pushGuidanceDismissButton) {
    pushGuidanceDismissButton.onclick = async () => {
      await handlePushGuidanceDismiss();
    };
  }
  const guidanceOpenOptionLink = document.getElementById("push-guidance-link");
  if (guidanceOpenOptionLink) {
    guidanceOpenOptionLink.onclick = () => {
      popup.openOptionsPage();
    };
  }

  // Check if push status should be displayed
  const status = await getPushStatus();

  const [followingPrograms, comingPrograms, rankingPrograms] = await popup.getPrograms();
  const showComing = await popup.showComing();

  // Hide loading and show main content
  const loadingContainer = document.getElementById("loading-container");
  const mainContent = document.getElementById("main-content");
  if (loadingContainer) loadingContainer.style.display = "none";
  if (mainContent) mainContent.style.display = "block";

  const followingContainer = document.getElementById("following-section");
  const comingContainer = document.getElementById("coming-section");
  const rankingContainer = document.getElementById("ranking-section");
  if (followingContainer === null || comingContainer === null || rankingContainer === null) {
    return;
  }

  createRoot(followingContainer).render(
    <FollowingPrograms
      programs={followingPrograms}
      popup={popup}
      rankingPrograms={rankingPrograms}
      showPushStatus={status.enabled}
    />,
  );

  createRoot(comingContainer).render(
    <ComingPrograms
      programs={comingPrograms}
      popup={popup}
      showComponent={showComing}
      useShowMoreButton={rankingPrograms.length > 0}
    />,
  );

  const showRanking = rankingPrograms.length > 0;
  createRoot(rankingContainer).render(
    <RankingPrograms programs={rankingPrograms} popup={popup} showComponent={showRanking} />,
  );

  await popup.setBadgeNumber(followingPrograms.length);
}

async function toggleSuspended() {
  const popup = container.resolve<Popup>(InjectTokens.Popup);
  const isSuspended = await popup.isSuspended();
  await popup.setSuspended(!isSuspended);
}

async function updateSuspendButton() {
  const popup = container.resolve<Popup>(InjectTokens.Popup);
  const isSuspended = await popup.isSuspended();
  const suspendEmoji = document.getElementById("suspend-emoji") as HTMLSpanElement;
  const suspendButton = document.getElementById(SUSPEND_BUTTON_ID) as HTMLButtonElement;
  suspendEmoji.innerHTML = isSuspended
    ? '<i class="fa-solid fa-play"></i>'
    : '<i class="fa-solid fa-pause"></i>';
  suspendButton.textContent = `自動入場${isSuspended ? "停止" : "動作"}中`;
}

function addEventListeners() {
  document.addEventListener("DOMContentLoaded", async () => {
    await renderPage();
  });
}

configureDefaultContainer();
addEventListeners();
