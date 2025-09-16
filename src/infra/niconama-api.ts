import { NiconamaApi } from "../domain/infra-interface/niconama-api";
import { Program } from "../domain/model/program";
import { decode } from "html-entities";

const FOLLOW_PROGRAMS_API_URL =
  "https://live.nicovideo.jp/front/api/pages/follow/v1/programs?status=onair&offset=0";
const COMING_PROGRAMS_API_URL =
  "https://live.nicovideo.jp/front/api/pages/follow/v1/programs?status=comingsoon&offset=0";
const RECENT_PROGRAMS_API_URL = "https://live.nicovideo.jp/front/api/pages/recent/v1/programs";
const RANKING_HTML_PAGE_URL = "https://live.nicovideo.jp/ranking";
const USER_NICKNAME_API_URL = "https://api.live2.nicovideo.jp/api/v1/user/nickname";
const CHANNEL_PAGE_URL = "https://ch.nicovideo.jp/";

export class NiconamaApiImpl implements NiconamaApi {
  async getFollowingPrograms(): Promise<Program[]> {
    const response = await fetch(FOLLOW_PROGRAMS_API_URL);
    const json = await response.text();
    // console.log(json);
    return this.extractFollowProgramsFromJson(json);
  }

  async getComingPrograms(): Promise<Program[]> {
    const response = await fetch(COMING_PROGRAMS_API_URL);
    const json = await response.text();
    // console.log(json);
    return this.extractFollowProgramsFromJson(json);
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

  async resolveChannelId(channelUrl: string): Promise<string | undefined> {
    const response = await fetch(channelUrl);
    const text = await response.text();
    const match = text.match(/content\.channel_id\s*=\s*'([^']+)'/);
    return match === null ? undefined : match[1];
  }

  async resolveChannelName(channelId: string): Promise<string> {
    // console.log("resolveChannelName", channelId);
    const response = await fetch(CHANNEL_PAGE_URL + channelId);
    const text = await response.text();
    const match = text.match(/<meta property="og:site_name" content="([^"]+)">/);
    return match === null ? "" : match[1];
  }

  private extractFollowProgramsFromJson(json: string): Program[] {
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
    // console.log(json.userMute.targets);
    return json.ranking.userPrograms.map((p: object) =>
      this.toDomainProgram(p, json.userMute.targets),
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toDomainProgram(responseProgram: any, muteUserIds: string[] = []): Program {
    // Handle ranking API response structure where data is wrapped in { type, value, key }
    const program = responseProgram.value ?? responseProgram;
    return {
      id: program.id ?? program.nicoliveProgramId,
      title: program.title,
      listingThumbnail: program.flippedListingThumbnail ?? program.listingThumbnail,
      screenshotThumbnail: {
        liveScreenshotThumbnailUrl: program.listingThumbnail,
      },
      watchPageUrl: program.watchPageUrl,
      programProvider: program.programProvider && {
        id: program.programProvider.id,
        name: program.programProvider.name,
        icon: program.programProvider.icon,
        iconSmall: program.programProvider.iconSmall,
      },
      socialGroup: {
        id: program.socialGroup.id,
        name: program.socialGroup.name,
        thumbnailUrl: program.socialGroup.thumbnailUrl,
      },
      supplier: program.supplier && {
        name: program.supplier.name,
        programProviderId: program.supplier.programProviderId,
        icons: {
          uri50x50: program.supplier.icons.uri50x50,
          uri150x150: program.supplier.icons.uri150x150,
        },
      },
      isFollowerOnly: program.isFollowerOnly,
      beginAt: new Date(program.beginAt ?? program.beginTime * 1000),
      isMute:
        program.supplier &&
        Array.isArray(muteUserIds) &&
        muteUserIds.includes(program.supplier.programProviderId),
    };
  }

  async resolveProgram(programId: string): Promise<Program | undefined> {
    const url = `https://live.nicovideo.jp/watch/${programId}`;
    const response = await fetch(url);
    const html = await response.text();
    return this.extractProgramFromHtml(html);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractProgramFromHtml(html: string): Program | undefined {
    // Find the embedded-data script tag and extract data-props attribute
    const match = html.match(/<script[^>]*id="embedded-data"[^>]*data-props="([^"]+)"[^>]*>/);
    if (!match) {
      return undefined;
    }

    // Decode HTML entities in the JSON string
    const propsJson = decode(match[1]);

    try {
      const props = JSON.parse(propsJson);
      return this.convertEmbeddedDataToProgram(props);
    } catch (error) {
      console.error("Failed to parse embedded data:", error);
      return undefined;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private convertEmbeddedDataToProgram(props: any): Program {
    const program = props.program;
    const supplier = program.supplier;
    const socialGroup = props.socialGroup;

    return {
      id: program.nicoliveProgramId,
      title: program.title,
      watchPageUrl: program.watchPageUrl,
      listingThumbnail: program.thumbnail?.huge?.s352x198,
      screenshotThumbnail: {
        liveScreenshotThumbnailUrl:
          program.screenshot?.urlSet?.large || program.thumbnail?.huge?.s1280x720 || "",
      },
      programProvider:
        supplier?.supplierType === "user"
          ? {
              id: supplier.programProviderId,
              name: supplier.name,
              icon: supplier.icons?.uri150x150 || "",
              iconSmall: supplier.icons?.uri50x50 || "",
            }
          : undefined,
      socialGroup: {
        id: socialGroup.id,
        name: socialGroup.name,
        thumbnailUrl: socialGroup.thumbnailImageUrl || "",
      },
      supplier: supplier
        ? {
            name: supplier.name,
            programProviderId: supplier.programProviderId,
            icons: {
              uri50x50: supplier.icons?.uri50x50 || "",
              uri150x150: supplier.icons?.uri150x150 || "",
            },
          }
        : undefined,
      isFollowerOnly: program.isFollowerOnly || false,
      beginAt: new Date(program.beginTime * 1000),
      isMute: false,
    };
  }
}
