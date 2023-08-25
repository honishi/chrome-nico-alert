import { Program } from "../model/program";
import { inject, injectable } from "tsyringe";
import { InjectTokens } from "../../di/injections";
import { NiconamaApi } from "../infra-interface/niconama-api";
import { BrowserApi } from "../infra-interface/browser-api";

export interface Popup {
  getPrograms(): Promise<[Program[], Program[]]>; // [followingPrograms, rankingPrograms]
  setBadgeNumber(number: number): Promise<void>;
}

@injectable()
export class PopupImpl implements Popup {
  constructor(
    @inject(InjectTokens.NiconamaApi) private niconamaApi: NiconamaApi,
    @inject(InjectTokens.BrowserApi) private browserApi: BrowserApi,
  ) {}

  async getPrograms(): Promise<[Program[], Program[]]> {
    return await Promise.all([
      this.niconamaApi.getOnAirPrograms(),
      this.niconamaApi.getRankingPrograms(),
    ]);
  }

  async setBadgeNumber(number: number): Promise<void> {
    await this.browserApi.setBadgeNumber(number);
  }
}
