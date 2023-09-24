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

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(async (entry) => {
      if (!entry.isIntersecting) {
        return;
      }
      const userId = entry.target.getAttribute("user-id");
      if (userId === null) {
        return;
      }
      const text = entry.target.getElementsByClassName("user-name")[0] as HTMLSpanElement;
      const userName = await option.getUserName(userId);
      if (text === null || userName === null) {
        return;
      }
      text.textContent = userName;
      observer.unobserve(entry.target);
    });
  });
  [...autoOpenContainer.children].forEach((userDiv) => observer.observe(userDiv));
}

async function createUserIdDiv(userId: string): Promise<HTMLElement> {
  const option = container.resolve<Option>(InjectTokens.Option);

  const div = document.createElement("div");
  div.className = "auto-open-user-div";
  div.setAttribute("user-id", userId);

  const button = document.createElement("button");
  button.className = "remove-button";
  button.textContent = "[削除]";
  button.addEventListener("click", async () => {
    // console.log("remove", userId);
    await option.disableAutoOpen(userId);
    div.remove();
  });
  div.appendChild(button);

  const text = document.createElement("span");
  text.className = "user-name";
  text.textContent = ".....";
  div.appendChild(text);

  const link = document.createElement("a");
  link.className = "user-link";
  link.text = `(${userId})`;
  link.href = `https://www.nicovideo.jp/user/${userId}`;
  link.target = "_blank";
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
