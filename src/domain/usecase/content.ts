import { inject, injectable } from "tsyringe";
import { InjectTokens } from "../../di/injections";
import { Browser } from "./browser";

export interface Content {
  isAutoOpenUser(userId: string): Promise<boolean>;
  setAutoOpenUser(userId: string, enabled: boolean): Promise<void>;
}

@injectable()
export class ContentImpl implements Content {
  constructor(@inject(InjectTokens.Browser) private browser: Browser) {}

  async isAutoOpenUser(userId: string): Promise<boolean> {
    return await this.browser.isAutoOpenUser(userId);
  }

  async setAutoOpenUser(userId: string, enabled: boolean): Promise<void> {
    await this.browser.setAutoOpenUser(userId, enabled);
  }
}
