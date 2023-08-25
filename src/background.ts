import "reflect-metadata";
import { InjectTokens } from "./di/inject-tokens";
import { Background } from "./domain/usecase/background";
import { container } from "tsyringe";
import { configureDefaultContainer } from "./di/register";

function configureChromeNotifications(background: Background) {
  chrome.notifications.onClicked.addListener(async (notificationId) => {
    // console.log(`notification clicked: ${notificationId}`);
    await background.openNotification(notificationId);
  });
}

configureDefaultContainer();
const background = container.resolve<Background>(InjectTokens.Background);
configureChromeNotifications(background);
await background.run();
