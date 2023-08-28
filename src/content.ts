import "reflect-metadata";
import { container } from "tsyringe";
import { InjectTokens } from "./di/inject-tokens";
import { Content } from "./domain/usecase/content";
import { configureDefaultContainer } from "./di/register";

const MY_FOLLOW_PAGE_URL = "https://www.nicovideo.jp/my/follow";

function isMyFollowPage(): boolean {
  return window.location.href.startsWith(MY_FOLLOW_PAGE_URL);
}

async function listenLoadEvent() {
  console.log("listenLoadEvent");
  if (!isMyFollowPage()) {
    // console.log("not target");
    return;
  }
  const userPageMain = document.getElementsByClassName("UserPage-main")[0];
  if (userPageMain === null || !(userPageMain instanceof Node)) {
    console.log("userPageMain is null");
    return;
  }
  const observer = new MutationObserver(async () => {
    // console.log("MutationObserver", mutations);
    await fixMyFollowPage();
  });
  observer.observe(userPageMain, {
    childList: true,
    subtree: true,
  });
  await fixMyFollowPage();
}

let fixing = false;

async function fixMyFollowPage() {
  // console.log("fix target", window.location.href);
  if (!isMyFollowPage()) {
    // console.log("not target");
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
    const userId = content.extractUserIdFromUrl(userItemLink.href);
    const autoOpenSettingButton = await createAutoOpenSettingButton(buttonTag, userId, content);
    userItem.appendChild(autoOpenSettingButton);
  }

  fixing = false;
}

async function createAutoOpenSettingButton(
  buttonTag: string,
  userId: string,
  content: Content,
): Promise<HTMLButtonElement> {
  const button = document.createElement("button");
  button.dataset.tag = buttonTag;
  button.className = "auto-open-button";
  updateButtonInnerHtml(button, await content.isAutoOpenUser(userId));
  button.onclick = async () => {
    const target = !(await content.isAutoOpenUser(userId));
    await content.setAutoOpenUser(userId, target);
    updateButtonInnerHtml(button, target);
  };
  return button;
}

function updateButtonInnerHtml(button: HTMLButtonElement, isOn: boolean) {
  const onOff = isOn ? "ON ✅" : "OFF";
  button.innerHTML = `自動入場 ${onOff}`;
}

configureDefaultContainer();
window.addEventListener("load", listenLoadEvent);
