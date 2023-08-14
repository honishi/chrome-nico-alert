import { Program } from "../model/program";
import { Browser } from "./browser";

const RUN_INTERVAL = 1000 * 60; // 1 minute
export class Background {
  private browser: Browser;
  private currentProgramResolver?: () => Promise<Program[]>;

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
    await this.checkAndPlaySounds(programs);

    console.log("Background checkPrograms: end", new Date());
  }

  private async checkAndPlaySounds(programs: Program[]): Promise<void> {
    console.log("Background checkAndPlaySounds: start", new Date());
    await this.browser.playSound();
    console.log("Background checkAndPlaySounds: end", new Date());
  }
}
