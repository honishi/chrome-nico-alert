import { BrowserApi } from "./browser-api";
import { SoundType } from "../model/sound-type";

export class Browser {
  private browserApi: BrowserApi;

  constructor(browserApi: BrowserApi) {
    this.browserApi = browserApi;
  }

  public async setBadgeNumber(number: number): Promise<void> {
    await this.browserApi.setBadgeNumber(number);
  }

  public async playSound(): Promise<void> {
    await this.browserApi.playSound(SoundType.NEW_LIVE_MAIN);
  }

  public async showNotification(title: string, message: string, iconUrl: string): Promise<void> {
    await this.browserApi.showNotification(title, message, iconUrl);
  }
}
