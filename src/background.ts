import "reflect-metadata";
import { InjectTokens } from "./di/inject-tokens";
import { Background } from "./domain/usecase/background";
import { container } from "tsyringe";
import { configureDefaultContainer } from "./di/register";

// Receives keep-alive message from offscreen window just to wake up the background script.
// https://stackoverflow.com/a/66618269
function configureKeepAliveReceiver() {
  self.onmessage = (event) => {
    console.log(new Date(), "onmessage", event);
  };
}

function configureChromeNotifications(background: Background) {
  chrome.notifications.onClicked.addListener(async (notificationId) => {
    // console.log(`notification clicked: ${notificationId}`);
    await background.openNotification(notificationId);
  });
}

configureDefaultContainer();
const background = container.resolve<Background>(InjectTokens.Background);
configureKeepAliveReceiver();
configureChromeNotifications(background);
await background.run();
