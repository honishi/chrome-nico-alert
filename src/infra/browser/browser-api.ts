import Reason = chrome.offscreen.Reason;
import { SoundType } from "../../domain/model/sound-type";
import { ChromeMessage } from "../chrome_message/message";
import { BrowserApi } from "../../domain/infra-interface/browser-api";

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

  async getAutoOpenUserIds(): Promise<string[]> {
    return [
      "122712824", //大ちゃんマン(大司教)
      "14162285", // みなみの魔王2nd
      "26503722", // ジンギスカン
      "16408042", // 歌下手お兄さん
      "94985107", // ふわん
      "6947682", // 安田くん
      "128879388", // えなこ2
      "128277277", // くさぴーーーーーーーーーーーーー
      "117775278", // 世界のももこ
      "22791190", // @こはちゃん。
      "31486519", // ゆばニャン
      "17602354", // まろん
      "387778", // むらまこ
      "118046334", // おどろき
      "58852571", // あおこ
      "88807981", // あああ
      "115823553", // ユキちゃん
      "117159293", // 藤澤タック
      "98454847", // (じゃない方の)ひろゆき
      "97492560", // 浅井にしの
      "13686098", // 我©️
      "96254336", // クロサワ・ザラ
      "45894055", // イノシシ
      "58366769", // もっちゃん
      "116171071", // 田中アオ
      "77683676", // ぼっとん
      "11908507", // 向日葵(ひまわり)2nd
      "93234861", // うんさい
      "92216320", // きょろちゃん
      "38762035", // トロ
      "1333269", // 名川ちゃん
      "36867326", // 七原くん (ななはら)
    ];
  }

  async openTab(url: string): Promise<void> {
    await chrome.tabs.create({ url: url });
  }

  async getTabUrls(): Promise<string[]> {
    const tabs = await chrome.tabs.query({});
    return tabs.map((tab) => tab.url).filter((url): url is string => url !== undefined);
  }
}
