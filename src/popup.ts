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

const div = document.getElementById("main");
if (div != null) {
  programs
    .map((program) => {
      const link = document.createElement("a");
      link.href = program.watchPageUrl;
      link.onclick = async function () {
        console.log("onclick");
        await chrome.tabs.create({ active: true, url: program.watchPageUrl });
      };
      const img = document.createElement("img");
      img.src = program.screenshotThumbnail.liveScreenshotThumbnailUrl;
      link.appendChild(img);
      const span = document.createElement("span");
      span.textContent = program.title;
      const br1 = document.createElement("br");
      const br2 = document.createElement("br");
      return [link, br1, span, br2];
    })
    .forEach((elements) => {
      elements.forEach((element) => {
        div.appendChild(element);
      });
    });
}
