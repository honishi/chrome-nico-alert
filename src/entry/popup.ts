import "reflect-metadata";
import { container } from "tsyringe";
import { InjectTokens } from "../di/inject-tokens";
import { Program } from "../domain/model/program";
import { Popup } from "../domain/usecase/popup";
import { configureDefaultContainer } from "../di/register";

async function renderPage() {
  const popup = container.resolve<Popup>(InjectTokens.Popup);

  const openOptionsButton = document.getElementById("open-options-button") as HTMLButtonElement;
  openOptionsButton.onclick = () => {
    popup.openOptionsPage();
  };

  const [followingPrograms, rankingPrograms] = await popup.getPrograms();

  const followingContainer = document.getElementById("following");
  if (followingContainer != null) {
    followingPrograms
      .map((p) => toGridItem(p, rankOf(p, rankingPrograms)))
      .forEach((element) => {
        followingContainer.appendChild(element);
      });
    setElementVisibility("following-no-programs", followingPrograms.length === 0);
  }

  const rankingContainer = document.getElementById("ranking");
  if (rankingContainer != null) {
    rankingPrograms
      .map((p, index) => toGridItem(p, index + 1))
      .forEach((element) => {
        rankingContainer.appendChild(element);
      });
  }

  await popup.setBadgeNumber(followingPrograms.length);
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

function toGridItem(program: Program, rank?: number): HTMLElement {
  const item = document.createElement("div");
  item.className = "grid-item";

  const link = document.createElement("a");
  link.href = program.watchPageUrl;
  link.onclick = async function () {
    console.log("onclick");
    await chrome.tabs.create({ active: true, url: program.watchPageUrl });
  };
  item.appendChild(link);

  const img = document.createElement("img");
  img.src =
    program.screenshotThumbnail.liveScreenshotThumbnailUrl ?? program.socialGroup.thumbnailUrl;
  link.appendChild(img);

  const titleSpan = document.createElement("span");
  titleSpan.textContent = [program.isFollowerOnly ? "【限】" : "", program.title].join(" ");
  link.appendChild(titleSpan);

  const userDiv = document.createElement("div");
  userDiv.className = "user-div";
  const userIconImg = document.createElement("img");
  const userNameSpan = document.createElement("span");
  userIconImg.src = program.programProvider?.iconSmall ?? program.socialGroup.thumbnailUrl;
  userNameSpan.textContent = program.programProvider?.name ?? program.socialGroup.name;
  userDiv.appendChild(userIconImg);
  userDiv.appendChild(userNameSpan);
  link.appendChild(userDiv);

  if (rank != null) {
    const topRankClassName = rank > 5 ? null : `top-rank-${rank}`;
    const rankingSpan = document.createElement("span");
    rankingSpan.className = ["rank-number", topRankClassName].join(" ");
    rankingSpan.textContent = rank.toString();
    item.appendChild(rankingSpan);
  }

  return item;
}

function addEventListeners() {
  document.addEventListener("DOMContentLoaded", async () => {
    await renderPage();
  });
}

configureDefaultContainer();
addEventListeners();
