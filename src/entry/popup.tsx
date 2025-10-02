import "reflect-metadata";
import { container } from "tsyringe";
import { InjectTokens } from "../di/inject-tokens";
import { Popup } from "../domain/usecase/popup";
import { configureDefaultContainer } from "../di/register";
import ProgramGridItem from "./component/ProgramGridItem";
import { createRoot } from "react-dom/client";
import React from "react";
import ComingPrograms from "./component/ComingPrograms";
import FollowingPrograms from "./component/FollowingPrograms";

const SUSPEND_BUTTON_ID = "suspend-button";

interface PushStatus {
  enabled: boolean;
  connected: boolean;
  connectionState: string;
  lastReceivedProgram?: {
    program: {
      body: string;
      icon: string;
      title: string;
      createdAt?: string;
      onClick?: string;
    };
    receivedAt: string;
  };
  channelId?: string;
  uaid?: string;
  connectionStatus?: {
    currentAttempts: number;
    maxAttempts: number;
    lastAttemptTime?: string;
    lastConnectedTime?: string;
  };
}

async function getPushStatus(): Promise<PushStatus> {
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

  const followingContainer = document.getElementById("following-section");
  const comingContainer = document.getElementById("coming");
  const rankingContainer = document.getElementById("ranking");
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
  if (showRanking) {
    const rankingItems = rankingPrograms.map((p, index) => {
      const elapsed = popup.toElapsedTime(p);
      const rank = index + 1;
      return <ProgramGridItem program={p} elapsedTime={elapsed} rank={rank} key={p.id} />;
    });
    createRoot(rankingContainer).render(rankingItems);
  }
  setElementVisibility("ranking-section", showRanking);

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

function setElementVisibility(id: string, visible: boolean) {
  const element = document.getElementById(id);
  if (element === null) {
    return;
  }
  element.style.display = visible ? "block" : "none";
}

function addEventListeners() {
  document.addEventListener("DOMContentLoaded", async () => {
    await renderPage();
  });
}

configureDefaultContainer();
addEventListeners();
