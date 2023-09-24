import "reflect-metadata";
import { configureDefaultContainer } from "../di/register";
import { container } from "tsyringe";
import { InjectTokens } from "../di/inject-tokens";
import { Option } from "../domain/usecase/option";

async function renderPage() {
  const option = container.resolve<Option>(InjectTokens.Option);

  const autoOpenContainer = document.getElementById("auto-open");
  if (autoOpenContainer === null) {
    return;
  }
  autoOpenContainer.innerHTML = "";
  const userIds = await option.getAutoOpenUserIds();
  for (const userId of userIds) {
    const userIdDiv = await createUserIdDiv(userId);
    autoOpenContainer.appendChild(userIdDiv);
  }
}

async function createUserIdDiv(userId: string): Promise<HTMLElement> {
  const option = container.resolve<Option>(InjectTokens.Option);
  const userName = await option.getUserName(userId);

  const div = document.createElement("div");
  div.className = "user-div";
  const button = document.createElement("button");
  button.className = "remove-button";
  button.textContent = "[削除]";
  button.addEventListener("click", async () => {
    // console.log("remove", userId);
    await option.disableAutoOpen(userId);
    div.remove();
  });
  const text = document.createElement("span");
  text.className = "user-name";
  text.textContent = userName;
  const link = document.createElement("a");
  link.className = "user-link";
  link.text = `(${userId})`;
  link.href = `https://www.nicovideo.jp/user/${userId}`;
  link.target = "_blank";
  div.appendChild(button);
  div.appendChild(text);
  div.appendChild(link);
  // console.log(div);
  return div;
}

function addEventListeners() {
  document.addEventListener("DOMContentLoaded", async () => {
    await renderPage();
  });
}

configureDefaultContainer();
addEventListeners();
