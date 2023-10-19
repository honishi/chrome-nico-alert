import { NiconamaApi } from "../domain/infra-interface/niconama-api";
import { Program } from "../domain/model/program";
import { decode } from "html-entities";

const FOLLOW_PROGRAMS_API_URL =
  "https://live.nicovideo.jp/front/api/pages/follow/v1/programs?status=onair&offset=0";
const RECENT_PROGRAMS_API_URL = "https://live.nicovideo.jp/front/api/pages/recent/v1/programs";
const RANKING_HTML_PAGE_URL = "https://live.nicovideo.jp/ranking";
const USER_NICKNAME_API_URL = "https://api.live2.nicovideo.jp/api/v1/user/nickname";

export class NiconamaApiImpl implements NiconamaApi {
  async getFollowingPrograms(): Promise<Program[]> {
    const response = await fetch(FOLLOW_PROGRAMS_API_URL);
    const json = await response.text();
    // console.log(json);
    return this.extractFollowingProgramsFromJson(json);
  }

  async getRecentPrograms(): Promise<Program[]> {
    const response = await fetch(RECENT_PROGRAMS_API_URL);
    const json = await response.text();
    // console.log(json);
    return this.extractRecentProgramsFromJson(json);
  }

  async getRankingPrograms(): Promise<Program[]> {
    const response = await fetch(RANKING_HTML_PAGE_URL);
    const html = await response.text();
    // console.log(json);
    return this.extractUserProgramRankingFromHtml(html);
  }

  async resolveUserName(userId: string): Promise<string> {
    const response = await fetch(USER_NICKNAME_API_URL + `?userId=${userId}`);
    const json = await response.json();
    return json.data.nickname;
  }

  private extractFollowingProgramsFromJson(json: string): Program[] {
    const parsedJson = JSON.parse(json);
    return parsedJson.data.programs.map(this.toDomainProgram);
  }

  private extractRecentProgramsFromJson(json: string): Program[] {
    const parsedJson = JSON.parse(json);
    return parsedJson.data.map(this.toDomainProgram);
  }

  private extractUserProgramRankingFromHtml(html: string): Program[] {
    const match = /<script id="embedded-data" data-props="([^"]*)"><\/script>/.exec(html);
    if (match === null || match.length < 2) {
      return [];
    }
    const dataProps = match[1];
    const jsonString = decode(dataProps);
    const json = JSON.parse(jsonString);
    // console.log(json.ranking.userPrograms);
    return json.ranking.userPrograms.map(this.toDomainProgram);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toDomainProgram(responseProgram: any): Program {
    return {
      id: responseProgram.id,
      title: responseProgram.title,
      screenshotThumbnail: {
        // Seems channel lives have `responseProgram.thumbnailUrl`, but community lives have not.
        liveScreenshotThumbnailUrl:
          responseProgram.thumbnailUrl ??
          responseProgram.screenshotThumbnail.liveScreenshotThumbnailUrl,
      },
      watchPageUrl: responseProgram.watchPageUrl,
      programProvider: responseProgram.programProvider && {
        id: responseProgram.programProvider.id,
        name: responseProgram.programProvider.name,
        icon: responseProgram.programProvider.icon,
        iconSmall: responseProgram.programProvider.iconSmall,
      },
      socialGroup: {
        name: responseProgram.socialGroup.name,
        thumbnailUrl: responseProgram.socialGroup.thumbnailUrl,
      },
      isFollowerOnly: responseProgram.isFollowerOnly,
      beginAt: new Date(responseProgram.beginAt),
    };
  }
}
