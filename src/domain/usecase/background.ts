import { Program } from "../model/program";
import { Browser } from "./browser";
import { inject, injectable } from "tsyringe";
import { Niconama } from "./niconama";
import { InjectTokens } from "../../di/injections";

const RUN_INTERVAL = 1000 * 60; // 1 minute

export interface Background {
  run(): Promise<void>;
}

@injectable()
export class BackgroundImpl implements Background {
  private lastProgramCheckTime?: Date;
  private notifiedPrograms: Program[] = [];

  constructor(
    @inject(InjectTokens.Niconama) private niconama: Niconama,
    @inject(InjectTokens.Browser) private browser: Browser,
  ) {}

  public async run(): Promise<void> {
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
