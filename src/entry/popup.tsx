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
    ? '<i class="fas fa-hand-paper"></i>' 
    : '<i class="fas fa-thumbs-up"></i>';
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
