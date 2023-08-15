import { NicoApi } from "../infra-interface/nicoapi";
import { Program } from "../model/program";
import { inject, injectable } from "tsyringe";
import { InjectTokens } from "../../di/injections";

export interface Niconama {
  getOnAirPrograms(): Promise<Program[]>;
}

@injectable()
export class NiconamaImpl implements Niconama {
  constructor(@inject(InjectTokens.NicoApi) private nicoapi: NicoApi) {}

  public async getOnAirPrograms(): Promise<Program[]> {
    return await this.nicoapi.getOnAirPrograms();
  }
}
