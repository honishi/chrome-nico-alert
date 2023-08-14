import Reason = chrome.offscreen.Reason;
import { SoundType } from "../../domain/model/sound-type";
import { ChromeMessage } from "../chrome_message/message";
import { BrowserApi } from "../../domain/usecase/browser-api";

const OFFSCREEN_HTML = "html/offscreen.html";

export class BrowserApiImpl implements BrowserApi {
  async setBadgeNumber(number: number): Promise<void> {
    await chrome.action.setBadgeText({ text: number.toString() });
  }

  async playSound(sound: SoundType): Promise<void> {
    await this.createOffscreen();

    let message = ChromeMessage.PLAY_DEFAULT_SOUND;
    switch (sound) {
      case SoundType.DEFAULT:
        break;
      case SoundType.NEW_LIVE_MAIN:
        message = ChromeMessage.PLAY_NEW_LIVE_SOUND_MAIN;
        break;
      case SoundType.NEW_LIVE_SUB:
        message = ChromeMessage.PLAY_NEW_LIVE_SOUND_SUB;
        break;
    }

    try {
      await chrome.runtime.sendMessage(message);
    } catch (e) {
      console.error(`Failed to send message: ${e}`);
    } finally {
      console.log(`sent message: ${message}`);
    }
  }

  // Create the offscreen document if it doesn't already exist
  private async createOffscreen(): Promise<void> {
    if (await chrome.offscreen.hasDocument()) {
      return;
    }
    const url = chrome.runtime.getURL(OFFSCREEN_HTML);
    try {
      await chrome.offscreen.createDocument({
        url: url,
        reasons: [Reason.AUDIO_PLAYBACK],
        justification: "audio playback",
      });
    } catch (e) {
      console.error(`Failed to create offscreen document: ${e}`);
    } finally {
      console.log("Offscreen document created");
    }
  }

  public async showNotification(title: string, message: string, iconUrl: string): Promise<void> {
    chrome.notifications.create({
      type: "basic",
      iconUrl: iconUrl,
      title: title,
      message: message,
    });
  }
}
