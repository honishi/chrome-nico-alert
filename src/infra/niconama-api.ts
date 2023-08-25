import { NiconamaApi } from "../domain/infra-interface/niconama-api";
import { Program } from "../domain/model/program";
import { decode } from "html-entities";

const FOLLOW_PROGRAMS_API_URL =
  "https://live.nicovideo.jp/front/api/pages/follow/v1/programs?status=onair&offset=0";
const RANKING_HTML_PAGE_URL = "https://live.nicovideo.jp/ranking";

export class NiconamaApiImpl implements NiconamaApi {
  async getOnAirPrograms(): Promise<Program[]> {
    const response = await fetch(FOLLOW_PROGRAMS_API_URL);
    const json = await response.text();
    // console.log(json);
    return this.extractOnAirProgramsFromJson(json);
  }

  async getRankingPrograms(): Promise<Program[]> {
    const response = await fetch(RANKING_HTML_PAGE_URL);
    const html = await response.text();
    // console.log(json);
    return this.extractUserProgramRankingFromHtml(html);
  }

  private extractOnAirProgramsFromJson(json: string): Program[] {
    const parsedJson = JSON.parse(json);
    return parsedJson.data.programs.map(this.toDomainProgram);
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
        liveScreenshotThumbnailUrl: responseProgram.screenshotThumbnail.liveScreenshotThumbnailUrl,
      },
      watchPageUrl: responseProgram.watchPageUrl,
      programProvider: {
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
    };
  }
}
