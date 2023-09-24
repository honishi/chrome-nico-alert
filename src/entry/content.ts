import "reflect-metadata";
import { container } from "tsyringe";
import { InjectTokens } from "../di/inject-tokens";
import { Content } from "../domain/usecase/content";
import { configureDefaultContainer } from "../di/register";

const MY_FOLLOW_PAGE_URL = "https://www.nicovideo.jp/my/follow";
const USER_PAGE_URL = "https://www.nicovideo.jp/user";

let fixingFollowPage = false;

function isMyFollowPage(): boolean {
  return window.location.href.startsWith(MY_FOLLOW_PAGE_URL);
}

function isUserPage(): boolean {
  return window.location.href.startsWith(USER_PAGE_URL);
}

async function listenLoadEvent() {
  console.log("listenLoadEvent");
  await fixFollowPage();
  await fixUserPage();
}

async function fixFollowPage() {
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

async function fixMyFollowPage() {
  // console.log("fix target", window.location.href);
  if (!isMyFollowPage()) {
    return;
  }
  if (fixingFollowPage) {
    return;
  }
  fixingFollowPage = true;

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
    const autoOpenSettingButton = await createAutoOpenSettingButton(
      buttonTag,
      userId,
      content,
      "follow-page-auto-open-button",
    );
    userItem.appendChild(autoOpenSettingButton);
  }

  fixingFollowPage = false;
}

async function fixUserPage() {
  if (!isUserPage()) {
    return;
  }
  const content = container.resolve<Content>(InjectTokens.Content);

  const userPageButtonContainer = document.getElementsByClassName("UserDetailsHeader-buttons")[0];
  if (userPageButtonContainer === undefined) {
    // console.log("userPageHeader is undefined");
    return;
  }
  const userId = content.extractUserIdFromUrl(window.location.href);
  const button = await createAutoOpenSettingButton(
    "",
    userId,
    content,
    "user-page-auto-open-button",
  );
  userPageButtonContainer.appendChild(button);
}

async function createAutoOpenSettingButton(
  buttonTag: string,
  userId: string,
  content: Content,
  className: string,
): Promise<HTMLButtonElement> {
  const button = document.createElement("button");
  button.dataset.tag = buttonTag;
  button.className = className;
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
