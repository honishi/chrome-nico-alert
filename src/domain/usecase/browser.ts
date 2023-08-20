import { BrowserApi } from "../infra-interface/browser-api";
import { SoundType } from "../model/sound-type";
import { inject, injectable } from "tsyringe";
import { InjectTokens } from "../../di/injections";

export interface Browser {
  setBadgeNumber(number: number): Promise<void>;
  playSound(sound: SoundType): Promise<void>;
  showNotification(
    title: string,
    message: string,
    iconUrl: string,
    onCreated: (notificationId: string) => void,
  ): void;
  isAutoOpenUser(userId: string): Promise<boolean>;
  setAutoOpenUser(userId: string, enabled: boolean): Promise<void>;
  openTab(url: string): Promise<void>;
  getTabProgramIds(): Promise<string[]>;
}

@injectable()
export class BrowserImpl implements Browser {
  constructor(@inject(InjectTokens.BrowserApi) private browserApi: BrowserApi) {}

  async setBadgeNumber(number: number): Promise<void> {
    await this.browserApi.setBadgeNumber(number);
  }

  async playSound(sound: SoundType): Promise<void> {
    await this.browserApi.playSound(sound);
  }

  showNotification(
    title: string,
    message: string,
    iconUrl: string,
    onCreated: (notificationId: string) => void,
  ): void {
    this.browserApi.showNotification(title, message, iconUrl, onCreated);
  }

  async isAutoOpenUser(userId: string): Promise<boolean> {
    return await this.browserApi.isAutoOpenUser(userId);
  }

  async setAutoOpenUser(userId: string, enabled: boolean): Promise<void> {
    await this.browserApi.setAutoOpenUser(userId, enabled);
  }

  async openTab(url: string): Promise<void> {
    await this.browserApi.openTab(url);
  }

  async getTabProgramIds(): Promise<string[]> {
    return (await this.browserApi.getTabUrls())
      .map(this.extractProgramId)
      .filter((id): id is string => id !== undefined);
  }

  private extractProgramId(url: string): string | undefined {
    const match = url.match(/https:\/\/.+\/watch\/(lv\d+)/);
    if (match === null) {
      return undefined;
    }
    return match[1];
  }
}
