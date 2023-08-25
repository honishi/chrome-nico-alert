import { Program } from "../model/program";

export interface NiconamaApi {
  getOnAirPrograms(): Promise<Program[]>;
  getRankingPrograms(): Promise<Program[]>;
}
