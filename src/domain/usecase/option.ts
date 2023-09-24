import { inject, injectable } from "tsyringe";
import { InjectTokens } from "../../di/inject-tokens";
import { NiconamaApi } from "../infra-interface/niconama-api";
import { BrowserApi } from "../infra-interface/browser-api";

export interface Option {
  getAutoOpenUserIds(): Promise<string[]>;
}

@injectable()
export class OptionImpl implements Option {
  constructor(
    @inject(InjectTokens.NiconamaApi) private niconamaApi: NiconamaApi,
    @inject(InjectTokens.BrowserApi) private browserApi: BrowserApi,
  ) {}

  async getAutoOpenUserIds(): Promise<string[]> {
    return ["123", "456"];
  }
}
