import "reflect-metadata";
import { container } from "tsyringe";
import { InjectTokens } from "../di/inject-tokens";
import { Program } from "../domain/model/program";
import { Popup } from "../domain/usecase/popup";
import { configureDefaultContainer } from "../di/register";
import GridItem from "./component/GridItem";
import { createRoot } from "react-dom/client";
import React from "react";

const SUSPEND_BUTTON_ID = "suspend-button";

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

  const [followingPrograms, rankingPrograms] = await popup.getPrograms();

  const followingContainer = document.getElementById("following");
  if (followingContainer != null) {
    const items = followingPrograms.map((p) => {
      const rank = rankOf(p, rankingPrograms);
      return <GridItem program={p} elapsedTime={popup.toElapsedTime(p)} rank={rank} key={p.id} />;
    });
    createRoot(followingContainer).render(items);
    setElementVisibility("following-no-programs", followingPrograms.length === 0);
  }

  const rankingContainer = document.getElementById("ranking");
  if (rankingContainer != null) {
    const items = rankingPrograms.map((p, index) => {
      const rank = index + 1;
      return <GridItem program={p} elapsedTime={popup.toElapsedTime(p)} rank={rank} key={p.id} />;
    });
    createRoot(rankingContainer).render(items);
  }

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
  suspendEmoji.textContent = isSuspended ? "✋" : "👍";
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
