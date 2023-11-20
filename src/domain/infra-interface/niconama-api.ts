import { Program } from "../model/program";

export interface NiconamaApi {
  getFollowingPrograms(): Promise<Program[]>;
  getRecentPrograms(): Promise<Program[]>;
  getRankingPrograms(): Promise<Program[]>;
  resolveUserName(userId: string): Promise<string>;
  resolveChannelId(channelUrl: string): Promise<string | undefined>;
  resolveChannelName(channelId: string): Promise<string>;
}
