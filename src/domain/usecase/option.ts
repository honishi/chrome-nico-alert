import { inject, injectable } from "tsyringe";
import { InjectTokens } from "../../di/inject-tokens";
import { NiconamaApi } from "../infra-interface/niconama-api";
import { BrowserApi } from "../infra-interface/browser-api";
import { SoundType } from "../model/sound-type";

export interface Option {
  getSoundVolume(): Promise<number>;
  setSoundVolume(value: number): Promise<void>;
  playTestSound(): Promise<void>;
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

  async getSoundVolume(): Promise<number> {
    return await this.browserApi.getSoundVolume();
  }

  async setSoundVolume(value: number): Promise<void> {
    await this.browserApi.setSoundVolume(value);
  }

  async playTestSound(): Promise<void> {
    await this.browserApi.playSound(SoundType.NEW_LIVE_MAIN);
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
