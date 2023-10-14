import { SoundType } from "../domain/model/sound-type";
import { BrowserApi } from "../domain/infra-interface/browser-api";
import { ChromeMessage, ChromeMessageType } from "./chrome_message/message";

const SOUND_VOLUME_KEY = "soundVolume";
const AUTO_OPEN_USERS_KEY = "autoOpenUsers";

const OFFSCREEN_HTML = "html/offscreen.html";

export class BrowserApiImpl implements BrowserApi {
  async startSendingKeepAliveFromOffscreen(): Promise<void> {
    await this.createOffscreen();
  }

  async setBadgeNumber(number: number): Promise<void> {
    await chrome.action.setBadgeText({ text: number.toString() });
  }

  async getSoundVolume(): Promise<number> {
    const result = await chrome.storage.local.get([SOUND_VOLUME_KEY]);
    return result[SOUND_VOLUME_KEY] ?? 1.0;
  }

  async setSoundVolume(value: number): Promise<void> {
    await chrome.storage.local.set({ [SOUND_VOLUME_KEY]: value });
  }

  async playSound(sound: SoundType): Promise<void> {
    await this.createOffscreen();

    const message: ChromeMessage = {
      messageType: ChromeMessageType.PLAY_SOUND,
      options: {
        sound: sound,
        volume: await this.getSoundVolume(),
      },
    };

    try {
      await chrome.runtime.sendMessage(message);
    } catch (e) {
      console.error(`Failed to send message: ${e}`);
    } finally {
      console.log(`sent message: ${message}`);
    }
  }

  private async createOffscreen(): Promise<void> {
    if (await chrome.offscreen.hasDocument()) {
      return;
    }
    const url = chrome.runtime.getURL(OFFSCREEN_HTML);
    try {
      await chrome.offscreen.createDocument({
        url: url,
        reasons: [chrome.offscreen.Reason.BLOBS, chrome.offscreen.Reason.AUDIO_PLAYBACK],
        justification: "background.js keep alive, audio playback",
      });
    } catch (e) {
      console.error(`Failed to create offscreen document: ${e}`);
    } finally {
      console.log("Offscreen document created");
    }
  }

  public showNotification(
    title: string,
    message: string,
    iconUrl: string,
    onCreated: (notificationId: string) => void,
  ): void {
    chrome.notifications.create(
      {
        type: "basic",
        iconUrl: iconUrl,
        title: title,
        message: message,
      },
      onCreated,
    );
  }

  async isAutoOpenUser(userId: string): Promise<boolean> {
    const autoOpenUserIds = await this.getAutoOpenUserIds();
    return autoOpenUserIds.includes(userId);
  }

  async getAutoOpenUserIds(): Promise<string[]> {
    const result = await chrome.storage.local.get([AUTO_OPEN_USERS_KEY]);
    const autoOpenUsers = (result[AUTO_OPEN_USERS_KEY] as { [key: string]: string }[]) ?? [];
    return autoOpenUsers.map((user) => user.userId);
  }

  async setAutoOpenUser(userId: string, enabled: boolean): Promise<void> {
    const result = await chrome.storage.local.get([AUTO_OPEN_USERS_KEY]);
    const autoOpenUsers = (result[AUTO_OPEN_USERS_KEY] as { [key: string]: string }[]) ?? [];
    const autoOpenUserIds = autoOpenUsers.map((user) => user.userId);
    const targetEnabled = enabled;
    const currentEnabled = autoOpenUserIds.includes(userId);
    if (targetEnabled === currentEnabled) {
      // already set
      return;
    }
    const users = targetEnabled
      ? [...autoOpenUsers, { userId: userId }]
      : autoOpenUsers.filter((user) => user.userId !== userId);
    await chrome.storage.local.set({ [AUTO_OPEN_USERS_KEY]: users });
  }

  async openTab(url: string): Promise<void> {
    await chrome.tabs.create({ url: url });
  }

  async getTabUrls(): Promise<string[]> {
    const tabs = await chrome.tabs.query({});
    return tabs.map((tab) => tab.url).filter((url): url is string => url !== undefined);
  }
}
