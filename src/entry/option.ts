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
  const span = document.createElement("span");
  span.textContent = `${userName} (${userId})`;
  const button = document.createElement("button");
  button.textContent = "Remove";
  button.addEventListener("click", async () => {
    // console.log("remove", userId);
    await option.disableAutoOpen(userId);
    div.remove();
  });
  div.appendChild(span);
  div.appendChild(button);
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
