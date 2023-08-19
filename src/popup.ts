import "reflect-metadata";
import { Niconama, NiconamaImpl } from "./domain/usecase/niconama";
import { Browser, BrowserImpl } from "./domain/usecase/browser";
import { container } from "tsyringe";
import { InjectTokens } from "./di/injections";
import { BackgroundImpl } from "./domain/usecase/background";
import { BrowserApiImpl } from "./infra/browser/browser-api";
import { NicoApiImpl } from "./infra/api_client/nicoapi";
import { Program } from "./domain/model/program";

function addEventListeners() {
  document.addEventListener("DOMContentLoaded", () => {
    console.log("addEventListener");
  });
}

addEventListeners();

console.log("popup.ts");

async function renderPage() {
  const niconama = container.resolve<Niconama>(InjectTokens.Niconama);

  const followingPrograms = await niconama.getOnAirPrograms();
  const rankingPrograms = await niconama.getRankingPrograms();
  // console.log(followingPrograms);

  const followingContainer = document.getElementById("following");
  if (followingContainer != null) {
    followingPrograms
      .map((p) => toGridItem(p, rankOf(p, rankingPrograms)))
      .forEach((element) => {
        followingContainer.appendChild(element);
      });
  }

  const rankingContainer = document.getElementById("ranking");
  if (rankingContainer != null) {
    rankingPrograms
      .map((p, index) => toGridItem(p, index + 1))
      .forEach((element) => {
        rankingContainer.appendChild(element);
      });
  }

  const browser = container.resolve<Browser>(InjectTokens.Browser);
  await browser.setBadgeNumber(followingPrograms.length);
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
  userIconImg.src = program.programProvider.iconSmall;
  userNameSpan.textContent = program.programProvider.name;
  userDiv.appendChild(userIconImg);
  userDiv.appendChild(userNameSpan);
  link.appendChild(userDiv);

  if (rank != null) {
    const rankingSpan = document.createElement("span");
    rankingSpan.className = "rank-number";
    rankingSpan.textContent = rank.toString();
    item.appendChild(rankingSpan);
  }

  return item;
}

function configureContainer() {
  container.register(InjectTokens.Background, { useClass: BackgroundImpl });
  container.register(InjectTokens.Browser, { useClass: BrowserImpl });
  container.register(InjectTokens.BrowserApi, { useClass: BrowserApiImpl });
  container.register(InjectTokens.Niconama, { useClass: NiconamaImpl });
  container.register(InjectTokens.NicoApi, { useClass: NicoApiImpl });
}

configureContainer();

await renderPage();
