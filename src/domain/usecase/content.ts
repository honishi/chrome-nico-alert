import { inject, injectable } from "tsyringe";
import { InjectTokens } from "../../di/inject-tokens";
import { BrowserApi } from "../infra-interface/browser-api";

export interface Content {
  isAutoOpenUser(userId: string): Promise<boolean>;
  setAutoOpenUser(userId: string, enabled: boolean): Promise<void>;
  extractUserIdFromUrl(url: string): string;
  extractChannelIdFromUrl(url: string): string;
}

@injectable()
export class ContentImpl implements Content {
  constructor(@inject(InjectTokens.BrowserApi) private browserApi: BrowserApi) {}

  async isAutoOpenUser(userId: string): Promise<boolean> {
    return await this.browserApi.isAutoOpenUser(userId);
  }

  async setAutoOpenUser(userId: string, enabled: boolean): Promise<void> {
    await this.browserApi.setAutoOpenUser(userId, enabled);
  }

  extractUserIdFromUrl(url: string): string {
    // https://www.nicovideo.jp/user/116137793?ref=pc_mypage_follow_following
    const match = url.match(/.*\/user\/(\d+).*/);
    return match === null ? "" : match[1];
  }

  extractChannelIdFromUrl(url: string): string {
    // https://ch.nicovideo.jp/torovsniconico
    // https://ch.nicovideo.jp/torovsniconico?xxx
    const match = url.match(/https:\/\/ch\.nicovideo\.jp\/([^/?]+)/);
    return match === null ? "" : match[1];
  }
}
