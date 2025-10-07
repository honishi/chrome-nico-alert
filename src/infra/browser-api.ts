import { SoundType } from "../domain/model/sound-type";
import { CustomSoundData } from "../domain/model/custom-sound";
import { BrowserApi } from "../domain/infra-interface/browser-api";
import { ChromeMessage, ChromeMessageType } from "./chrome_message/message";

const SHOW_COMING_KEY = "showComing";
const SHOW_RANKING_KEY = "showRanking";
const PUSH_GUIDANCE_DISMISSED_KEY = "pushGuidanceDismissed";
const SHOW_NOTIFICATION_KEY = "showNotification";
const SOUND_VOLUME_KEY = "soundVolume";
const CUSTOM_SOUND_MAIN_KEY = "customSoundMain";
const CUSTOM_SOUND_SUB_KEY = "customSoundSub";
const SUSPEND_FROM_DATE_KEY = "suspendFromDate";
const AUTO_OPEN_USERS_KEY = "autoOpenUsers";
const RECEIVE_PUSH_NOTIFICATION_KEY = "receivePushNotification";

const OFFSCREEN_HTML = "html/offscreen.html";

export class BrowserApiImpl implements BrowserApi {
  async startSendingKeepAliveFromOffscreen(): Promise<void> {
    await this.createOffscreen();
  }

  async setBadgeNumber(number: number): Promise<void> {
    await chrome.action.setBadgeText({ text: number.toString() });
  }

  async setBadgeBackgroundColor(hex: string): Promise<void> {
    await chrome.action.setBadgeBackgroundColor({ color: hex });
  }

  async getShowComing(): Promise<boolean> {
    const result = await chrome.storage.local.get([SHOW_COMING_KEY]);
    return result[SHOW_COMING_KEY] ?? false;
  }

  async setShowComing(value: boolean): Promise<void> {
    await chrome.storage.local.set({ [SHOW_COMING_KEY]: value });
  }

  async getShowRanking(): Promise<boolean> {
    const result = await chrome.storage.local.get([SHOW_RANKING_KEY]);
    return result[SHOW_RANKING_KEY] ?? true;
  }

  async setShowRanking(value: boolean): Promise<void> {
    await chrome.storage.local.set({ [SHOW_RANKING_KEY]: value });
  }

  async getPushGuidanceDismissed(): Promise<boolean> {
    const result = await chrome.storage.local.get([PUSH_GUIDANCE_DISMISSED_KEY]);
    return result[PUSH_GUIDANCE_DISMISSED_KEY] ?? false;
  }

  async setPushGuidanceDismissed(value: boolean): Promise<void> {
    await chrome.storage.local.set({ [PUSH_GUIDANCE_DISMISSED_KEY]: value });
  }

  async getShowNotification(): Promise<boolean> {
    const result = await chrome.storage.local.get([SHOW_NOTIFICATION_KEY]);
    return result[SHOW_NOTIFICATION_KEY] ?? true;
  }

  async setShowNotification(value: boolean): Promise<void> {
    await chrome.storage.local.set({ [SHOW_NOTIFICATION_KEY]: value });
  }

  async getSoundVolume(): Promise<number> {
    const result = await chrome.storage.local.get([SOUND_VOLUME_KEY]);
    return result[SOUND_VOLUME_KEY] ?? 1.0;
  }

  async setSoundVolume(value: number): Promise<void> {
    await chrome.storage.local.set({ [SOUND_VOLUME_KEY]: value });
  }

  async getCustomSoundFile(type: SoundType): Promise<CustomSoundData | null> {
    const key = type === SoundType.NEW_LIVE_MAIN ? CUSTOM_SOUND_MAIN_KEY : CUSTOM_SOUND_SUB_KEY;
    const result = await chrome.storage.local.get([key]);
    if (!result[key]) {
      return null;
    }
    return JSON.parse(result[key]) as CustomSoundData;
  }

  async setCustomSoundFile(type: SoundType, fileName: string, dataUrl: string): Promise<void> {
    const key = type === SoundType.NEW_LIVE_MAIN ? CUSTOM_SOUND_MAIN_KEY : CUSTOM_SOUND_SUB_KEY;
    const data: CustomSoundData = { fileName, dataUrl };
    await chrome.storage.local.set({ [key]: JSON.stringify(data) });
  }

  async clearCustomSoundFile(type: SoundType): Promise<void> {
    const key = type === SoundType.NEW_LIVE_MAIN ? CUSTOM_SOUND_MAIN_KEY : CUSTOM_SOUND_SUB_KEY;
    await chrome.storage.local.remove(key);
  }

  async playSound(sound: SoundType): Promise<void> {
    await this.createOffscreen();

    // Get custom sound file if available
    const customSound = await this.getCustomSoundFile(sound);

    const message: ChromeMessage = {
      messageType: ChromeMessageType.PLAY_SOUND,
      options: {
        sound: sound,
        volume: await this.getSoundVolume(),
        customSoundFile: customSound?.dataUrl ?? null,
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

  async getReceivePushNotification(): Promise<boolean> {
    const result = await chrome.storage.local.get([RECEIVE_PUSH_NOTIFICATION_KEY]);
    return result[RECEIVE_PUSH_NOTIFICATION_KEY] ?? false;
  }

  async setReceivePushNotification(value: boolean): Promise<void> {
    await chrome.storage.local.set({ [RECEIVE_PUSH_NOTIFICATION_KEY]: value });
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

  async setSuspendFromDate(date: Date | undefined): Promise<void> {
    if (date === undefined) {
      await chrome.storage.local.remove(SUSPEND_FROM_DATE_KEY);
      return;
    }
    await chrome.storage.local.set({ [SUSPEND_FROM_DATE_KEY]: date.toISOString() });
  }

  async getSuspendFromDate(): Promise<Date | undefined> {
    const result = await chrome.storage.local.get([SUSPEND_FROM_DATE_KEY]);
    const date = result[SUSPEND_FROM_DATE_KEY];
    if (date === undefined) {
      return undefined;
    }
    return new Date(date);
  }

  openOptionsPage(): void {
    chrome.runtime.openOptionsPage();
  }
}
