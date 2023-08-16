import { inject, injectable } from "tsyringe";
import { InjectTokens } from "../../di/injections";
import { Browser } from "./browser";

export interface Content {
  getAutoOpenUserIds(): Promise<string[]>;
}

@injectable()
export class ContentImpl implements Content {
  constructor(@inject(InjectTokens.Browser) private browser: Browser) {}

  async getAutoOpenUserIds(): Promise<string[]> {
    return await this.browser.getAutoOpenUserIds();
  }
}
