import "reflect-metadata";
import { container } from "tsyringe";
import { InjectTokens } from "./di/injections";
import { BrowserApiImpl } from "./infra/browser/browser-api";
import { Content, ContentImpl } from "./domain/usecase/content";
import { BackgroundImpl } from "./domain/usecase/background";
import { NiconamaApiImpl } from "./infra/api_client/nicoapi";
import { PopupImpl } from "./domain/usecase/popup";

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
    button.dataset.tag = buttonTag;
    button.className = "auto-open-button";
    updateButtonInnerHtml(button, await content.isAutoOpenUser(userId));
    button.onclick = async () => {
      const target = !(await content.isAutoOpenUser(userId));
      await content.setAutoOpenUser(userId, target);
      updateButtonInnerHtml(button, target);
    };

    userItem.appendChild(button);
  }

  fixing = false;
}

function updateButtonInnerHtml(button: HTMLButtonElement, isOn: boolean) {
  const onOff = isOn ? "ON✨" : "OFF";
  button.innerHTML = `自動入場 ${onOff}`;
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
  container.register(InjectTokens.Background, { useClass: BackgroundImpl });
  container.register(InjectTokens.BrowserApi, { useClass: BrowserApiImpl });
  container.register(InjectTokens.Content, { useClass: ContentImpl });
  container.register(InjectTokens.NiconamaApi, { useClass: NiconamaApiImpl });
  container.register(InjectTokens.Popup, { useClass: PopupImpl });
}

configureContainer();

window.addEventListener("load", listenLoadEvent);
window.addEventListener("scroll", listenLoadEvent);
