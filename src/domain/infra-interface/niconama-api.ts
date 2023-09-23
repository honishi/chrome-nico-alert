import { Program } from "../model/program";

export interface NiconamaApi {
  getFollowingPrograms(): Promise<Program[]>;
  getRecentPrograms(): Promise<Program[]>;
  getRankingPrograms(): Promise<Program[]>;
}
