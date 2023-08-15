import { BrowserApi } from "../infra-interface/browser-api";
import { SoundType } from "../model/sound-type";
import { inject, injectable } from "tsyringe";
import { InjectTokens } from "../../di/injections";

export interface Browser {
  setBadgeNumber(number: number): Promise<void>;
  playSound(): Promise<void>;
  showNotification(title: string, message: string, iconUrl: string): Promise<void>;
}

@injectable()
export class BrowserImpl implements Browser {
  constructor(@inject(InjectTokens.BrowserApi) private browserApi: BrowserApi) {}

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
