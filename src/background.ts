import "reflect-metadata";
import { InjectTokens } from "./di/injections";
import { Background, BackgroundImpl } from "./domain/usecase/background";
import { container } from "tsyringe";
import { BrowserApiImpl } from "./infra/browser/browser-api";
import { ContentImpl } from "./domain/usecase/content";
import { NiconamaApiImpl } from "./infra/api_client/nicoapi";
import { PopupImpl } from "./domain/usecase/popup";

function configureContainer() {
  container.register(InjectTokens.Background, { useClass: BackgroundImpl });
  container.register(InjectTokens.BrowserApi, { useClass: BrowserApiImpl });
  container.register(InjectTokens.Content, { useClass: ContentImpl });
  container.register(InjectTokens.NiconamaApi, { useClass: NiconamaApiImpl });
  container.register(InjectTokens.Popup, { useClass: PopupImpl });
}

function configureChromeNotifications(background: Background) {
  chrome.notifications.onClicked.addListener(async (notificationId) => {
    console.log(`notification clicked: ${notificationId}`);
    await background.openNotification(notificationId);
  });
}

configureContainer();
const background = container.resolve<Background>(InjectTokens.Background);
configureChromeNotifications(background);
await background.run();
