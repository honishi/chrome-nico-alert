import { Program } from "../model/program";
import { Browser } from "./browser";
import { inject, injectable } from "tsyringe";
import { Niconama } from "./niconama";
import { InjectTokens } from "../../di/injections";
import { SoundType } from "../model/sound-type";

const RUN_INTERVAL = 1000 * 30; // 30 seconds
const DELAY_AFTER_OPEN = 1000 * 5; // 5 seconds

export interface Background {
  run(): Promise<void>;
}

@injectable()
export class BackgroundImpl implements Background {
  private lastProgramCheckTime?: Date;
  private processedPrograms: Program[] = [];

  constructor(
    @inject(InjectTokens.Niconama) private niconama: Niconama,
    @inject(InjectTokens.Browser) private browser: Browser,
  ) {}

  async run(): Promise<void> {
    console.log("Background run: start");
    await this.requestPrograms();
    setInterval(this.requestPrograms.bind(this), RUN_INTERVAL);
    console.log("Background run: end");
  }

  private async requestPrograms(): Promise<void> {
    console.log("Background checkPrograms: start", new Date());

    const programs = await this.niconama.getOnAirPrograms();
    await this.browser.setBadgeNumber(programs.length);
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
      await this.browser.showNotification(
        `${program.programProvider.name}が放送開始`,
        `「${program.title}」\n${program.socialGroup.name}`,
        program.programProvider.icon,
      );
      const opened = await this.autoOpenProgramIfNeeded(program);
      await this.browser.playSound(opened ? SoundType.NEW_LIVE_MAIN : SoundType.NEW_LIVE_SUB);
      this.processedPrograms.push(program);
      detectedNewProgram = true;
    }

    this.lastProgramCheckTime = new Date();
    console.log("Background checkAndPlaySounds: end", new Date());
  }

  private async autoOpenProgramIfNeeded(program: Program): Promise<boolean> {
    const autoOpenUserIds = await this.browser.getAutoOpenUserIds();
    const isTargetUser = autoOpenUserIds.includes(program.programProvider.id);
    const isAlreadyOpened = (await this.browser.getTabProgramIds()).includes(program.id);
    const shouldOpen = isTargetUser && !isAlreadyOpened;
    if (shouldOpen) {
      await this.browser.openTab(program.watchPageUrl);
    }
    console.log(
      `Background autoOpenProgramIfNeeded: userId:(${program.programProvider.id}) programId:(${program.id}) isTargetUser:(${isTargetUser}) isAlreadyOpened:(${isAlreadyOpened}) shouldOpen:(${shouldOpen})`,
    );
    return shouldOpen;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
