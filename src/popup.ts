import { Niconama } from "./domain/usecase/niconama";
import { NicoApiImpl } from "./infra/api_client/nicoapi";

function addEventListeners() {
  document.addEventListener("DOMContentLoaded", () => {
    console.log("addEventListener");
  });
}

addEventListeners();

console.log("popup.ts");

const nicoapi = new NicoApiImpl();
const niconama = new Niconama(nicoapi);
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

      const br1 = document.createElement("br");
      const span = document.createElement("span");
      span.textContent = program.title;
      const br2 = document.createElement("br");

      item.appendChild(link);
      item.appendChild(br1);
      item.appendChild(span);
      item.appendChild(br2);
      return item;
    })
    .forEach((element) => {
      gridContainer.appendChild(element);
    });
}
