import InstalledDetails = chrome.runtime.InstalledDetails;
import { Niconama } from "./domain/usecase/niconama";
import { NicoApiImpl } from "./infra/api_client/nicoapi";
import { Browser } from "./domain/usecase/browser";
import { BrowserApiImpl } from "./infra/browser/browser-api";

function listenOnInstalled(details: InstalledDetails) {
  console.log(details);
}

function listenOnMessage(message: any, sender: any, sendResponse: any) {
  console.log(message);
}

chrome.runtime.onInstalled.addListener(listenOnInstalled);
chrome.runtime.onMessage.addListener(listenOnMessage);

async function updateBadge() {
  const niconama = new Niconama(new NicoApiImpl());
  const programs = await niconama.getOnAirPrograms();

  const browser = new Browser(new BrowserApiImpl());
  await browser.setBadgeNumber(programs.length);
}

await updateBadge();
setInterval(updateBadge, 30 * 1000);
