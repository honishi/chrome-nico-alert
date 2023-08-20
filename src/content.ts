import "reflect-metadata";
import { container } from "tsyringe";
import { InjectTokens } from "./di/injections";
import { BrowserImpl } from "./domain/usecase/browser";
import { BrowserApiImpl } from "./infra/browser/browser-api";
import { Content, ContentImpl } from "./domain/usecase/content";
import { BackgroundImpl } from "./domain/usecase/background";
import { NiconamaImpl } from "./domain/usecase/niconama";
import { NicoApiImpl } from "./infra/api_client/nicoapi";

async function listenLoadEvent() {
  // console.log("load");
  await fixMyFollowPage();
}

let fixing = false;

async function fixMyFollowPage() {
  console.log("fix target", window.location.href);
  if (!window.location.toString().startsWith("https://www.nicovideo.jp/my/follow")) {
    console.log("not target");
    return;
  }
  if (fixing) {
    return;
  }
  fixing = true;

  const content = container.resolve<Content>(InjectTokens.Content);

  const buttonTag = "auto-open";
  const userItems = document.getElementsByClassName("UserItem");

  for (const userItem of userItems) {
    const existingButtons = userItem.getElementsByTagName("button");
    const _existingButtons = [...existingButtons];
    const isExisting = _existingButtons.map((button) => button.dataset.tag).includes(buttonTag);
    if (isExisting) {
      continue;
    }

    const userItemLink = userItem.getElementsByClassName("UserItem-link")[0] as HTMLAnchorElement;
    if (userItemLink === undefined) {
      // console.log("userItemLink is undefined");
      continue;
    }
    const userId = extractUserIdFromUrl(userItemLink.href);

    const button = document.createElement("button");
    const isOn = await content.isAutoOpenUser(userId);
    const onOff = isOn ? "🔵On" : "⚪️Off";
    button.innerHTML = `Auto Open ${onOff} (${userId})`;
    button.style.marginBottom = "10px";
    button.dataset.tag = buttonTag;
    button.onclick = async () => {
      const isOn = await content.isAutoOpenUser(userId);
      const target = !isOn;
      await content.setAutoOpenUser(userId, target);
      const onOff = target ? "🔵On" : "⚪️Off";
      button.innerHTML = `Auto Open ${onOff} (${userId})`;
    };

    userItem.appendChild(button);
  }

  fixing = false;
}

function extractUserIdFromUrl(url: string): string {
  // https://www.nicovideo.jp/user/116137793?ref=pc_mypage_follow_following
  const match = url.match(/.*\/user\/(\d+).*/);
  if (match === null) {
    return "";
  }
  return match[1];
}

function configureContainer() {
  container.register(InjectTokens.Content, { useClass: ContentImpl });
  container.register(InjectTokens.Background, { useClass: BackgroundImpl });
  container.register(InjectTokens.Browser, { useClass: BrowserImpl });
  container.register(InjectTokens.BrowserApi, { useClass: BrowserApiImpl });
  container.register(InjectTokens.Niconama, { useClass: NiconamaImpl });
  container.register(InjectTokens.NicoApi, { useClass: NicoApiImpl });
}

configureContainer();

window.addEventListener("load", listenLoadEvent);
window.addEventListener("scroll", listenLoadEvent);
