import { Program } from "../model/program";
import { Browser } from "./browser";

const RUN_INTERVAL = 1000 * 60; // 1 minute
export class Background {
  private browser: Browser;
  private currentProgramResolver?: () => Promise<Program[]>;

  private lastProgramCheckTime?: Date;
  private notifiedPrograms: Program[] = [];

  constructor(browser: Browser) {
    this.browser = browser;
  }

  public async run(currentProgramsResolver: () => Promise<Program[]>): Promise<void> {
    console.log("Background run: start");
    this.currentProgramResolver = currentProgramsResolver;

    await this.requestPrograms();
    setInterval(this.requestPrograms.bind(this), RUN_INTERVAL);
    console.log("Background run: end");
  }

  private async requestPrograms(): Promise<void> {
    console.log("Background checkPrograms: start", new Date());
    if (this.currentProgramResolver === undefined) {
      console.log("Background checkPrograms: currentProgramResolver is undefined");
      return;
    }

    const programs = await this.currentProgramResolver();
    await this.browser.setBadgeNumber(programs.length);
    await this.checkPrograms(programs);

    console.log("Background checkPrograms: end", new Date());
  }

  private async checkPrograms(programs: Program[]): Promise<void> {
    console.log("Background checkAndPlaySounds: start", new Date());
    if (this.lastProgramCheckTime === undefined) {
      this.lastProgramCheckTime = new Date();
      this.notifiedPrograms = programs;
      return;
    }

    const promises = programs.map(async (program) => {
      const isNotified = this.notifiedPrograms.some((notifiedProgram) => {
        return notifiedProgram.id === program.id;
      });
      if (isNotified) {
        return;
      }
      await this.browser.showNotification(
        program.programProvider.name,
        program.title,
        program.socialGroup.thumbnailUrl,
      );
      await this.browser.playSound();
      this.notifiedPrograms.push(program);
    });
    await Promise.all(promises);

    this.lastProgramCheckTime = new Date();
    console.log("Background checkAndPlaySounds: end", new Date());
  }
}
