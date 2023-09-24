import { inject, injectable } from "tsyringe";
import { InjectTokens } from "../../di/inject-tokens";
import { NiconamaApi } from "../infra-interface/niconama-api";
import { BrowserApi } from "../infra-interface/browser-api";

export interface Option {
  getAutoOpenUserIds(): Promise<string[]>;
  getUserName(userId: string): Promise<string>;
  disableAutoOpen(userId: string): Promise<void>;
}

@injectable()
export class OptionImpl implements Option {
  constructor(
    @inject(InjectTokens.NiconamaApi) private niconamaApi: NiconamaApi,
    @inject(InjectTokens.BrowserApi) private browserApi: BrowserApi,
  ) {}

  async getAutoOpenUserIds(): Promise<string[]> {
    return (await this.browserApi.getAutoOpenUserIds()).reverse();
  }

  async getUserName(userId: string): Promise<string> {
    return await this.niconamaApi.resolveUserName(userId);
  }

  async disableAutoOpen(userId: string): Promise<void> {
    await this.browserApi.setAutoOpenUser(userId, false);
  }
}
