import InstalledDetails = chrome.runtime.InstalledDetails;
import "reflect-metadata";
import { InjectTokens } from "./di/injections";
import { Background, BackgroundImpl } from "./domain/usecase/background";
import { container } from "tsyringe";
import { BrowserImpl } from "./domain/usecase/browser";
import { BrowserApiImpl } from "./infra/browser/browser-api";
import { NiconamaImpl } from "./domain/usecase/niconama";
import { NicoApiImpl } from "./infra/api_client/nicoapi";

function listenOnInstalled(details: InstalledDetails) {
  console.log(details);
}

function listenOnMessage(message: any, sender: any, sendResponse: any) {
  console.log(message);
}

chrome.runtime.onInstalled.addListener(listenOnInstalled);
chrome.runtime.onMessage.addListener(listenOnMessage);

function configureContainer() {
  container.register(InjectTokens.Background, { useClass: BackgroundImpl });
  container.register(InjectTokens.Browser, { useClass: BrowserImpl });
  container.register(InjectTokens.BrowserApi, { useClass: BrowserApiImpl });
  container.register(InjectTokens.Niconama, { useClass: NiconamaImpl });
  container.register(InjectTokens.NicoApi, { useClass: NicoApiImpl });
}

configureContainer();

const background = container.resolve<Background>(InjectTokens.Background);
await background.run();
