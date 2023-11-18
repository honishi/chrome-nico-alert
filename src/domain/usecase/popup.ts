import { Program } from "../model/program";
import { inject, injectable } from "tsyringe";
import { InjectTokens } from "../../di/inject-tokens";
import { NiconamaApi } from "../infra-interface/niconama-api";
import { BrowserApi } from "../infra-interface/browser-api";
import { defaultBadgeBackgroundColor, suspendedBadgeBackgroundColor } from "./colors";

export interface Popup {
  getPrograms(): Promise<[Program[], Program[]]>; // [followingPrograms, rankingPrograms]
  setBadgeNumber(number: number): Promise<void>;
  isSuspended(): Promise<boolean>;
  setSuspended(suspended: boolean): Promise<void>;
  openOptionsPage(): void;
}

@injectable()
export class PopupImpl implements Popup {
  constructor(
    @inject(InjectTokens.NiconamaApi) private niconamaApi: NiconamaApi,
    @inject(InjectTokens.BrowserApi) private browserApi: BrowserApi,
  ) {}

  async getPrograms(): Promise<[Program[], Program[]]> {
    const [following, ranking] = await Promise.all([
      this.niconamaApi.getFollowingPrograms(),
      this.niconamaApi.getRankingPrograms(),
    ]);
    return [following.map(this.fixScreenshotThumbnailUrlIfTooEarly), ranking];
  }

  async setBadgeNumber(number: number): Promise<void> {
    await this.browserApi.setBadgeNumber(number);
  }

  async isSuspended(): Promise<boolean> {
    return (await this.browserApi.getSuspendFromDate()) !== undefined;
  }

  async setSuspended(suspended: boolean): Promise<void> {
    await this.browserApi.setSuspendFromDate(suspended ? new Date() : undefined);

    const isSuspended = await this.isSuspended();
    await this.browserApi.setBadgeBackgroundColor(
      isSuspended ? suspendedBadgeBackgroundColor : defaultBadgeBackgroundColor,
    );
  }

  openOptionsPage(): void {
    this.browserApi.openOptionsPage();
  }

  private fixScreenshotThumbnailUrlIfTooEarly(program: Program): Program {
    const begin = program.beginAt.getTime();
    const now = new Date().getTime();
    const elapsed = now - begin;
    const isTooEarly = elapsed < 1000 * 60 * 2; // 2 minutes
    return isTooEarly
      ? {
          ...program,
          screenshotThumbnail: {
            liveScreenshotThumbnailUrl: program.socialGroup.thumbnailUrl,
          },
        }
      : program;
  }
}
