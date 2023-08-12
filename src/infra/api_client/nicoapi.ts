import { NicoApi } from "../../domain/usecase/nicoapi";
import { Program } from "../../domain/model/program";

const FOLLOW_PROGRAMS_API =
  "https://live.nicovideo.jp/front/api/pages/follow/v1/programs?status=onair&offset=0";

export class NicoApiImpl implements NicoApi {
  public async getOnAirPrograms(): Promise<Program[]> {
    const response = await fetch(FOLLOW_PROGRAMS_API);
    const json = await response.json();
    // console.log(json);
    return json.data.programs.map((program: any) => {
      return {
        title: program.title,
        screenshotThumbnail: {
          liveScreenshotThumbnailUrl: program.screenshotThumbnail.liveScreenshotThumbnailUrl,
        },
        watchPageUrl: program.watchPageUrl,
      };
    });
  }
}
