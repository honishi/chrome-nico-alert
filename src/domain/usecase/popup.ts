import { Program } from "../model/program";
import { inject, injectable } from "tsyringe";
import { InjectTokens } from "../../di/inject-tokens";
import { NiconamaApi } from "../infra-interface/niconama-api";
import { BrowserApi } from "../infra-interface/browser-api";
import { defaultBadgeBackgroundColor, suspendedBadgeBackgroundColor } from "./colors";

export interface Popup {
  getPrograms(): Promise<[Program[], Program[]]>; // [followingPrograms, rankingPrograms]
  toElapsedTime(program: Program): string;
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
    const showRanking = await this.browserApi.getShowRanking();
    const [following, ranking] = await Promise.all([
      this.niconamaApi.getFollowingPrograms(),
      showRanking ? this.niconamaApi.getRankingPrograms() : [],
    ]);
    return [
      following.map(this.fixScreenshotThumbnailUrlIfTooEarly),
      ranking.map(this.maskProgramIfMuted),
    ];
  }

  toElapsedTime(program: Program): string {
    if (program.isMute) return "(非表示)";
    const elapsedMinutes = (new Date().getTime() - program.beginAt.getTime()) / 1000 / 60;
    const hours = Math.floor(elapsedMinutes / 60);
    const minutes = Math.floor(elapsedMinutes % 60);
    return `${hours ? hours + " 時間 " : ""}${minutes} 分経過`;
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

  private maskProgramIfMuted(program: Program): Program {
    const muteIconUrl =
      "https://nicolive.cdn.nimg.jp/relive/party1-static/nicolive/symbol/namaco_icon_mono5.cc903.svg";
    return program.isMute
      ? {
          ...program,
          title: "(非表示に設定されています)",
          listingThumbnail: muteIconUrl,
          programProvider: {
            id: "",
            name: "(非表示)",
            icon: muteIconUrl,
            iconSmall: muteIconUrl,
          },
        }
      : program;
  }
}
