import "reflect-metadata";
import { Niconama, NiconamaImpl } from "./domain/usecase/niconama";
import { Browser, BrowserImpl } from "./domain/usecase/browser";
import { container } from "tsyringe";
import { InjectTokens } from "./di/injections";
import { BackgroundImpl } from "./domain/usecase/background";
import { BrowserApiImpl } from "./infra/browser/browser-api";
import { NicoApiImpl } from "./infra/api_client/nicoapi";

function addEventListeners() {
  document.addEventListener("DOMContentLoaded", () => {
    console.log("addEventListener");
  });
}

addEventListeners();

console.log("popup.ts");

async function renderPage() {
  const niconama = container.resolve<Niconama>(InjectTokens.Niconama);
  const programs = await niconama.getOnAirPrograms();
  console.log(programs);

  const gridContainer = document.getElementById("main");
  if (gridContainer != null) {
    programs
      .map((program) => {
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
          program.screenshotThumbnail.liveScreenshotThumbnailUrl ??
          program.socialGroup.thumbnailUrl;
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

        return item;
      })
      .forEach((element) => {
        gridContainer.appendChild(element);
      });

    const browser = container.resolve<Browser>(InjectTokens.Browser);
    await browser.setBadgeNumber(programs.length);
  }
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
