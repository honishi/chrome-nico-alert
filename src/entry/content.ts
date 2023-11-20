import "reflect-metadata";
import { container } from "tsyringe";
import { InjectTokens } from "../di/inject-tokens";
import { Content } from "../domain/usecase/content";
import { configureDefaultContainer } from "../di/register";

const MY_FOLLOW_PAGE_URL = "https://www.nicovideo.jp/my/follow";
const USER_PAGE_URL = "https://www.nicovideo.jp/user";
const CHANNEL_PAGE_URL = "https://ch.nicovideo.jp/";

const autoOpenButtonTag = "auto-open";
enum AutoOpenButtonType {
  FollowPage = "follow-page",
  UserPage = "user-page",
}

let fixingFollowPage = false;

function isMyFollowPage(): boolean {
  return window.location.href.startsWith(MY_FOLLOW_PAGE_URL);
}

function isUserPage(): boolean {
  return window.location.href.startsWith(USER_PAGE_URL);
}

function isChannelPage(): boolean {
  return window.location.href.startsWith(CHANNEL_PAGE_URL);
}

async function listenLoadEvent() {
  console.log("listenLoadEvent");
  await fixFollowPage();
  await fixUserPage();
  await fixChannelPage();
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

  const userItems = document.getElementsByClassName("UserItem");

  for (const userItem of userItems) {
    const existingButtons = userItem.getElementsByTagName("button");
    const _existingButtons = [...existingButtons];
    const isExisting = _existingButtons
      .map((button) => button.dataset.tag)
      .includes(autoOpenButtonTag);
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
      userId,
      content,
      AutoOpenButtonType.FollowPage,
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
  const button = await createAutoOpenSettingButton(userId, content, AutoOpenButtonType.UserPage);
  userPageButtonContainer.appendChild(button);
}

async function fixChannelPage() {
  if (!isChannelPage()) {
    return;
  }
  const content = container.resolve<Content>(InjectTokens.Content);

  const channelPageHeader = document.getElementsByClassName("join_leave")[0];
  if (channelPageHeader === undefined) {
    // console.log("channelPageHeader is undefined");
    return;
  }
  const channelId = content.extractChannelIdFromUrl(window.location.href);
  // console.log("channelId", channelId);
  const button = await createAutoOpenSettingButton(channelId, content, AutoOpenButtonType.UserPage);
  channelPageHeader.appendChild(button);
}

async function createAutoOpenSettingButton(
  userId: string,
  content: Content,
  buttonType: AutoOpenButtonType,
): Promise<HTMLButtonElement> {
  const button = document.createElement("button");
  button.dataset.tag = autoOpenButtonTag;
  const currentOnOff = await content.isAutoOpenUser(userId);
  updateButtonStyle(button, buttonType, currentOnOff);
  button.onclick = async () => {
    const targetOnOff = !(await content.isAutoOpenUser(userId));
    await content.setAutoOpenUser(userId, targetOnOff);
    updateButtonStyle(button, buttonType, targetOnOff);
  };
  return button;
}

function updateButtonStyle(
  button: HTMLButtonElement,
  buttonType: AutoOpenButtonType,
  isOn: boolean,
) {
  const onOffString = isOn ? "on" : "off";
  const className = (() => {
    switch (buttonType) {
      case AutoOpenButtonType.FollowPage:
        return `follow-page-auto-open-${onOffString}-button`;
      case AutoOpenButtonType.UserPage:
        return `user-page-auto-open-${onOffString}-button`;
    }
  })();
  button.className = className;
  button.innerHTML = isOn ? "自動入場設定中" : "自動入場する";
}

configureDefaultContainer();
window.addEventListener("load", listenLoadEvent);
