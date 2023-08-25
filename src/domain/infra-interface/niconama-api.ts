import { Program } from "../model/program";

export interface NiconamaApi {
  getFollowingPrograms(): Promise<Program[]>;
  getRankingPrograms(): Promise<Program[]>;
}
