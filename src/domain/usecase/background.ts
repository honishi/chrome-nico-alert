import { Program } from "../model/program";
import { inject, injectable } from "tsyringe";
import { InjectTokens } from "../../di/injections";
import { SoundType } from "../model/sound-type";
import { BrowserApi } from "../infra-interface/browser-api";
import { NiconamaApi } from "../infra-interface/niconama-api";

const RUN_INTERVAL = 1000 * 30; // 30 seconds
const DELAY_AFTER_OPEN = 1000 * 5; // 5 seconds

export interface Background {
  run(): Promise<void>;
  openNotification(notificationId: string): Promise<void>;
}

@injectable()
export class BackgroundImpl implements Background {
  private lastProgramCheckTime?: Date;
  private processedPrograms: Program[] = [];
  private notifiedPrograms: { [key: string]: string } = {}; // key: notificationId, value: watchPageUrl

  constructor(
    @inject(InjectTokens.NiconamaApi) private niconamaApi: NiconamaApi,
    @inject(InjectTokens.BrowserApi) private browserApi: BrowserApi,
  ) {}

  async run(): Promise<void> {
    console.log("Background run: start");
    await this.requestPrograms();
    setInterval(this.requestPrograms.bind(this), RUN_INTERVAL);
    console.log("Background run: end");
  }

  async openNotification(notificationId: string): Promise<void> {
    const url = this.notifiedPrograms[notificationId];
    if (url === undefined) {
      console.log(
        `Background openNotification: url is undefined. notificationId=${notificationId}`,
      );
      return;
    }
    await this.browserApi.openTab(url);
  }

  private async requestPrograms(): Promise<void> {
    console.log("Background checkPrograms: start", new Date());

    const programs = await this.niconamaApi.getOnAirPrograms();
    await this.browserApi.setBadgeNumber(programs.length);
    await this.checkPrograms(programs);

    console.log("Background checkPrograms: end", new Date());
  }

  private async checkPrograms(programs: Program[]): Promise<void> {
    console.log("Background checkAndPlaySounds: start", new Date());
    if (this.lastProgramCheckTime === undefined) {
      this.lastProgramCheckTime = new Date();
      this.processedPrograms = programs;
      return;
    }

    let detectedNewProgram = false;
    for (const program of programs) {
      const isProcessed = this.processedPrograms.map((p) => p.id).includes(program.id);
      if (isProcessed) {
        continue;
      }
      console.log(program.programProvider.name, program.title, program.programProvider.icon);
      if (detectedNewProgram) {
        console.log(`Background checkAndPlaySounds: wait ${DELAY_AFTER_OPEN} ms`);
        await this.delay(DELAY_AFTER_OPEN);
      }
      this.browserApi.showNotification(
        `${program.programProvider.name}が放送開始`,
        `「${program.title}」\n${program.socialGroup.name}`,
        program.programProvider.icon,
        (notificationId) => {
          console.log(`Background checkAndPlaySounds: notificationId: ${notificationId}`);
          this.notifiedPrograms[notificationId] = program.watchPageUrl;
        },
      );
      const opened = await this.autoOpenProgramIfNeeded(program);
      await this.browserApi.playSound(opened ? SoundType.NEW_LIVE_MAIN : SoundType.NEW_LIVE_SUB);
      this.processedPrograms.push(program);
      detectedNewProgram = true;
    }

    this.lastProgramCheckTime = new Date();
    console.log("Background checkAndPlaySounds: end", new Date());
  }

  private async autoOpenProgramIfNeeded(program: Program): Promise<boolean> {
    const isTargetUser = await this.browserApi.isAutoOpenUser(program.programProvider.id);
    const isAlreadyOpened = (await this.getTabProgramIds()).includes(program.id);
    const shouldOpen = isTargetUser && !isAlreadyOpened;
    if (shouldOpen) {
      await this.browserApi.openTab(program.watchPageUrl);
    }
    console.log(
      `Background autoOpenProgramIfNeeded: userId:(${program.programProvider.id}) programId:(${program.id}) isTargetUser:(${isTargetUser}) isAlreadyOpened:(${isAlreadyOpened}) shouldOpen:(${shouldOpen})`,
    );
    return shouldOpen;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async getTabProgramIds(): Promise<string[]> {
    return (await this.browserApi.getTabUrls())
      .map((url) => {
        const match = url.match(/https:\/\/.+\/watch\/(lv\d+)/);
        if (match === null) {
          return undefined;
        }
        return match[1];
      })
      .filter((id): id is string => id !== undefined);
  }
}
