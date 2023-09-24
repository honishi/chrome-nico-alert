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
  const userIds = await option.getAutoOpenUserIds();
  for (const userId of userIds) {
    const userIdDiv = createUserIdDiv(userId);
    autoOpenContainer.appendChild(userIdDiv);
  }
}

function createUserIdDiv(userId: string): HTMLElement {
  const div = document.createElement("div");
  div.textContent = userId;
  return div;
}

function addEventListeners() {
  document.addEventListener("DOMContentLoaded", async () => {
    await renderPage();
  });
}

configureDefaultContainer();
addEventListeners();
