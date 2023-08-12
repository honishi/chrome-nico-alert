import { NicoApi } from "./nicoapi";
import { Program } from "../model/program";

export class Niconama {
  nicoapi: NicoApi;
  constructor(nicoapi: NicoApi) {
    this.nicoapi = nicoapi;
  }
  public async startCrawling(): Promise<void> {
    console.log("Niconama run");
  }

  public async getOnAirPrograms(): Promise<Program[]> {
    return await this.nicoapi.getOnAirPrograms();
  }
}
