import { Niconama } from "./domain/usecase/niconama";
import { NicoApiImpl } from "./infra/api_client/nicoapi";
import { BrowserApiImpl } from "./infra/browser/browser-api";
import { Browser } from "./domain/usecase/browser";

function addEventListeners() {
  document.addEventListener("DOMContentLoaded", () => {
    console.log("addEventListener");
  });
}

addEventListeners();

console.log("popup.ts");

const niconama = new Niconama(new NicoApiImpl());
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

      const img = document.createElement("img");
      img.src = program.screenshotThumbnail.liveScreenshotThumbnailUrl;
      link.appendChild(img);

      const titleSpan = document.createElement("span");
      titleSpan.textContent = program.title;

      const userDiv = document.createElement("div");
      userDiv.className = "user-div";
      const userIconImg = document.createElement("img");
      const userNameSpan = document.createElement("span");
      userIconImg.src = program.programProvider.iconSmall;
      userNameSpan.textContent = program.programProvider.name;
      userDiv.appendChild(userIconImg);
      userDiv.appendChild(userNameSpan);

      item.appendChild(link);
      item.appendChild(titleSpan);
      item.appendChild(userDiv);
      return item;
    })
    .forEach((element) => {
      gridContainer.appendChild(element);
    });

  const browser = new Browser(new BrowserApiImpl());
  await browser.setBadgeNumber(programs.length);
}
