import "reflect-metadata";
import { container } from "tsyringe";
import { InjectTokens } from "../di/inject-tokens";
import { Program } from "../domain/model/program";
import { Popup } from "../domain/usecase/popup";
import { configureDefaultContainer } from "../di/register";
import ProgramGridItem from "./component/ProgramGridItem";
import { createRoot } from "react-dom/client";
import React from "react";
import ComingPrograms from "./component/ComingPrograms";

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

async function updatePushStatusDisplay() {
  const statusContainer = document.querySelector(".push-status-container") as HTMLElement;
  const statusElement = document.getElementById("push-status");
  if (!statusElement || !statusContainer) return;

  try {
    const status = await getPushStatus();

    let statusText = "プッシュ通知: 無効";
    let statusClass = "push-status-disabled";

    if (status.enabled && status.connected) {
      statusText = "プッシュ通知: 接続済み";
      statusClass = "push-status-connected";
    } else if (status.enabled && !status.connected) {
      statusText = "プッシュ通知: 未接続";
      statusClass = "push-status-disconnected";
    }

    // Clear and rebuild status content
    statusElement.innerHTML = "";

    // Create status text span
    const statusSpan = document.createElement("span");
    statusSpan.className = statusClass;

    // Create icon element
    const iconElement = document.createElement("i");
    iconElement.className = "fa-solid fa-circle push-status-icon";
    statusSpan.appendChild(iconElement);

    // Add status text
    const textNode = document.createTextNode(` ${statusText}`);
    statusSpan.appendChild(textNode);

    statusElement.appendChild(statusSpan);

    // Set detailed information as tooltip
    const details = [];
    if (status.connectionState) {
      details.push(`Status: ${status.connectionState}`);
    }
    if (status.uaid) {
      details.push(`UAID: ${status.uaid}`);
    }
    if (status.channelId) {
      details.push(`Channel ID: ${status.channelId}`);
    }
    if (status.connectionStatus) {
      details.push(
        `Connect Rate Limit: ${status.connectionStatus.currentAttempts}/${status.connectionStatus.maxAttempts}`,
      );
      if (status.connectionStatus.lastAttemptTime) {
        const lastAttempt = new Date(status.connectionStatus.lastAttemptTime);
        details.push(`Last Attempt: ${lastAttempt.toLocaleString("ja-JP")}`);
      }
      if (status.connectionStatus.lastConnectedTime) {
        const lastConnection = new Date(status.connectionStatus.lastConnectedTime);
        details.push(`Last Connection: ${lastConnection.toLocaleString("ja-JP")}`);
      }
    }

    // Add last received program info to tooltip
    if (status.lastReceivedProgram) {
      const lastReceived = new Date(status.lastReceivedProgram.receivedAt);
      const now = new Date();
      const diffMs = now.getTime() - lastReceived.getTime();
      const diffMinutes = Math.floor(diffMs / 60000);

      let timeText = "";
      if (diffMinutes < 60) {
        timeText = `${diffMinutes}m ago`;
      } else {
        const diffHours = Math.floor(diffMinutes / 60);
        timeText = `${diffHours}h ago`;
      }

      // Extract broadcaster name from title (format: "XXXさんが生放送を開始")
      const titleMatch = status.lastReceivedProgram.program.title.match(/(.+)さんが生放送を開始/);
      const displayTitle = titleMatch ? titleMatch[1] : status.lastReceivedProgram.program.title;

      // Format full date/time
      const year = lastReceived.getFullYear();
      const month = String(lastReceived.getMonth() + 1).padStart(2, "0");
      const day = String(lastReceived.getDate()).padStart(2, "0");
      const hours = String(lastReceived.getHours()).padStart(2, "0");
      const minutes = String(lastReceived.getMinutes()).padStart(2, "0");
      const seconds = String(lastReceived.getSeconds()).padStart(2, "0");
      const fullDateTime = `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;

      details.push(
        `Latest Program: [${displayTitle}] ${status.lastReceivedProgram.program.body} (${timeText})`,
      );
      details.push(`Program Detected Time: ${fullDateTime}`);
    } else {
      details.push(`Latest Program: None`);
    }

    if (details.length > 0) {
      statusSpan.title = details.join("\n");
    }
  } catch (error) {
    console.error("Failed to get push status:", error);
    statusElement.innerHTML = '<span class="push-status-error">⚠️ プッシュ通知: エラー</span>';
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
  const showPushStatus = await popup.getShowPushStatus();
  const pushStatusContainer = document.querySelector(".push-status-container") as HTMLElement;
  if (pushStatusContainer) {
    pushStatusContainer.style.display = showPushStatus ? "block" : "none";
  }

  // Display push notification status
  if (showPushStatus) {
    await updatePushStatusDisplay();

    // Update status every 5 seconds
    setInterval(updatePushStatusDisplay, 5000);
  }

  const [followingPrograms, comingPrograms, rankingPrograms] = await popup.getPrograms();
  const showComing = await popup.showComing();

  const followingContainer = document.getElementById("following");
  const comingContainer = document.getElementById("coming");
  const rankingContainer = document.getElementById("ranking");
  if (followingContainer === null || comingContainer === null || rankingContainer === null) {
    return;
  }

  const followingItems = followingPrograms.map((p) => {
    const elapsed = popup.toElapsedTime(p);
    const rank = rankOf(p, rankingPrograms);
    return <ProgramGridItem program={p} elapsedTime={elapsed} rank={rank} key={p.id} />;
  });
  createRoot(followingContainer).render(followingItems);
  setElementVisibility("following-no-programs", followingPrograms.length === 0);

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

function rankOf(program: Program, rankingPrograms: Program[]): number | undefined {
  const rankingProgramIds = rankingPrograms.map((p) => p.id);
  const index = rankingProgramIds.indexOf(program.id);
  if (index === -1) {
    return undefined;
  }
  return index + 1;
}

function addEventListeners() {
  document.addEventListener("DOMContentLoaded", async () => {
    await renderPage();
  });
}

configureDefaultContainer();
addEventListeners();
