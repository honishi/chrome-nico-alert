import InstalledDetails = chrome.runtime.InstalledDetails;
import { Niconama } from "./domain/usecase/niconama";
import { NicoApiImpl } from "./infra/api_client/nicoapi";
import { BrowserApiImpl } from "./infra/browser/browser-api";
import { Background } from "./domain/usecase/background";
import { Browser } from "./domain/usecase/browser";

function listenOnInstalled(details: InstalledDetails) {
  console.log(details);
}

function listenOnMessage(message: any, sender: any, sendResponse: any) {
  console.log(message);
}

chrome.runtime.onInstalled.addListener(listenOnInstalled);
chrome.runtime.onMessage.addListener(listenOnMessage);

const browser = new Browser(new BrowserApiImpl());

const background = new Background(browser);
await background.run(async () => {
  const niconama = new Niconama(new NicoApiImpl());
  return await niconama.getOnAirPrograms();
});
