import { inject, injectable } from "tsyringe";
import { InjectTokens } from "../../di/inject-tokens";
import { NiconamaApi } from "../infra-interface/niconama-api";
import { BrowserApi } from "../infra-interface/browser-api";
import { SoundType } from "../model/sound-type";

export interface Option {
  getShowComing(): Promise<boolean>;
  setShowComing(value: boolean): Promise<void>;
  getShowRanking(): Promise<boolean>;
  setShowRanking(value: boolean): Promise<void>;
  getShowNotification(): Promise<boolean>;
  setShowNotification(value: boolean): Promise<void>;
  getSoundVolume(): Promise<number>;
  setSoundVolume(value: number): Promise<void>;
  playTestSound(): Promise<void>;
  getReceivePushNotification(): Promise<boolean>;
  setReceivePushNotification(value: boolean): Promise<void>;
  getAutoOpenUserIds(): Promise<string[]>;
  getUserName(userId: string): Promise<string>;
  getChannelName(channelId: string): Promise<string>;
  disableAutoOpen(userId: string): Promise<void>;
}

@injectable()
export class OptionImpl implements Option {
  constructor(
    @inject(InjectTokens.NiconamaApi) private niconamaApi: NiconamaApi,
    @inject(InjectTokens.BrowserApi) private browserApi: BrowserApi,
  ) {}

  async getShowComing(): Promise<boolean> {
    return await this.browserApi.getShowComing();
  }

  async setShowComing(value: boolean): Promise<void> {
    await this.browserApi.setShowComing(value);
  }

  async getShowRanking(): Promise<boolean> {
    return await this.browserApi.getShowRanking();
  }

  async setShowRanking(value: boolean): Promise<void> {
    await this.browserApi.setShowRanking(value);
  }

  async getShowNotification(): Promise<boolean> {
    return await this.browserApi.getShowNotification();
  }

  async setShowNotification(value: boolean): Promise<void> {
    await this.browserApi.setShowNotification(value);
  }

  async getSoundVolume(): Promise<number> {
    return await this.browserApi.getSoundVolume();
  }

  async setSoundVolume(value: number): Promise<void> {
    await this.browserApi.setSoundVolume(value);
  }

  async playTestSound(): Promise<void> {
    await this.browserApi.playSound(SoundType.NEW_LIVE_MAIN);
  }

  async getReceivePushNotification(): Promise<boolean> {
    return await this.browserApi.getReceivePushNotification();
  }

  async setReceivePushNotification(value: boolean): Promise<void> {
    await this.browserApi.setReceivePushNotification(value);
  }

  async getAutoOpenUserIds(): Promise<string[]> {
    return (await this.browserApi.getAutoOpenUserIds()).reverse();
  }

  async getUserName(userId: string): Promise<string> {
    return await this.niconamaApi.resolveUserName(userId);
  }

  async getChannelName(channelId: string): Promise<string> {
    return await this.niconamaApi.resolveChannelName(channelId);
  }

  async disableAutoOpen(userId: string): Promise<void> {
    await this.browserApi.setAutoOpenUser(userId, false);
  }
}
