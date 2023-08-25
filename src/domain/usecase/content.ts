import { inject, injectable } from "tsyringe";
import { InjectTokens } from "../../di/inject-tokens";
import { BrowserApi } from "../infra-interface/browser-api";

export interface Content {
  isAutoOpenUser(userId: string): Promise<boolean>;
  setAutoOpenUser(userId: string, enabled: boolean): Promise<void>;
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
}
