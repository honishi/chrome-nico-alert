import { Program } from "../model/program";
import { inject, injectable } from "tsyringe";
import { InjectTokens } from "../../di/inject-tokens";
import { SoundType } from "../model/sound-type";
import { BrowserApi } from "../infra-interface/browser-api";
import { NiconamaApi } from "../infra-interface/niconama-api";
import { defaultBadgeBackgroundColor } from "./colors";

const RUN_INTERVAL = 1000 * 30; // 30 seconds
const DELAY_AFTER_OPEN = 1000 * 5; // 5 seconds

export interface Background {
  run(): Promise<void>;
  openNotification(notificationId: string): Promise<void>;
}

@injectable()
export class BackgroundImpl implements Background {
  private isRunning = false;
  private lastProgramCheckTime?: Date;
  private processedProgramIds: string[] = [];
  private notifiedPrograms: { [key: string]: string } = {}; // key: notificationId, value: watchPageUrl

  constructor(
    @inject(InjectTokens.NiconamaApi) private niconamaApi: NiconamaApi,
    @inject(InjectTokens.BrowserApi) private browserApi: BrowserApi,
  ) {
    this.initialize().then(() => console.log("Background initialized"));
  }

  async initialize(): Promise<void> {
    await this.resetSuspended();
  }

  async resetSuspended(): Promise<void> {
    await this.browserApi.setSuspendFromDate(undefined);
    await this.browserApi.setBadgeBackgroundColor(defaultBadgeBackgroundColor);
  }

  async run(): Promise<void> {
    if (this.isRunning) {
      console.log("Background run: already running");
      return;
    }
    console.log("Background run: start");
    this.isRunning = true;

    await this.browserApi.startSendingKeepAliveFromOffscreen();
    await this.requestProgramsIgnoringError();
    setInterval(async () => {
      await this.requestProgramsIgnoringError();
    }, RUN_INTERVAL);

    this.isRunning = false;
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

  private async requestProgramsIgnoringError(): Promise<void> {
    try {
      await this.requestPrograms();
    } catch (e) {
      console.log(`Failed to request programs: ${e}`);
    }
  }

  private async requestPrograms(): Promise<void> {
    console.log("Background requestPrograms: start", new Date());

    const [following, recent] = await Promise.all([
      this.niconamaApi.getFollowingPrograms(),
      this.niconamaApi.getRecentPrograms(),
    ]);
    await this.browserApi.setBadgeNumber(following.length);
    await this.checkPrograms(following, recent);

    console.log("Background requestPrograms: end", new Date());
  }

  private async checkPrograms(following: Program[], recent: Program[]): Promise<void> {
    if (this.lastProgramCheckTime === undefined) {
      this.lastProgramCheckTime = new Date();
      this.processedProgramIds = [...following, ...recent].map((p) => p.id);
      return;
    }
    this.lastProgramCheckTime = new Date();

    const isSuspended = (await this.browserApi.getSuspendFromDate()) !== undefined;

    let openedAnyPrograms = false;
    for (const program of following) {
      if (this.isProcessed(program)) {
        continue;
      }
      this.logProgram("Found following program:", program);
      this.processedProgramIds.push(program.id);
      if (openedAnyPrograms) {
        console.log(`wait: ${DELAY_AFTER_OPEN} ms`);
        await this.delay(DELAY_AFTER_OPEN);
      }
      this.showNotification(program);
      if (isSuspended) {
        console.log("Suspended", program.id);
        continue;
      }
      const shouldAutoOpen = await this.shouldAutoOpenProgram(program);
      if (shouldAutoOpen) {
        await this.browserApi.openTab(program.watchPageUrl);
      }
      await this.browserApi.playSound(
        shouldAutoOpen ? SoundType.NEW_LIVE_MAIN : SoundType.NEW_LIVE_SUB,
      );
      openedAnyPrograms = true;
    }

    for (const program of recent) {
      if (this.isProcessed(program)) {
        continue;
      }
      this.logProgram("Found recent program:", program);
      this.processedProgramIds.push(program.id);
      const shouldAutoOpen = await this.shouldAutoOpenProgram(program);
      if (!shouldAutoOpen) {
        continue;
      }
      if (openedAnyPrograms) {
        console.log(`wait: ${DELAY_AFTER_OPEN} ms`);
        await this.delay(DELAY_AFTER_OPEN);
      }
      this.showNotification(program);
      if (isSuspended) {
        console.log("Suspended", program.id);
        continue;
      }
      await this.browserApi.openTab(program.watchPageUrl);
      await this.browserApi.playSound(SoundType.NEW_LIVE_MAIN);
      openedAnyPrograms = true;
    }

    this.processedProgramIds = this.processedProgramIds.slice(-10000);
  }

  private isProcessed(program: Program): boolean {
    return this.processedProgramIds.includes(program.id);
  }

  private logProgram(message: string, program: Program): void {
    console.log(
      message,
      program.programProvider?.name,
      program.title,
      program.programProvider?.icon,
      program.screenshotThumbnail.liveScreenshotThumbnailUrl,
    );
  }

  private showNotification(program: Program): void {
    this.browserApi.showNotification(
      `${program.programProvider?.name ?? program.socialGroup.name}が放送開始`,
      `「${program.title}」\n${program.socialGroup.name}`,
      program.programProvider?.icon ?? program.socialGroup.thumbnailUrl,
      (notificationId) => {
        console.log(`Background checkAndPlaySounds: notificationId: ${notificationId}`);
        this.notifiedPrograms[notificationId] = program.watchPageUrl;
      },
    );
  }

  private async shouldAutoOpenProgram(program: Program): Promise<boolean> {
    const userIdOrChannelId = program.programProvider?.id ?? program.socialGroup.id;
    if (userIdOrChannelId === undefined) {
      return false;
    }
    const isTargetUser = await this.browserApi.isAutoOpenUser(userIdOrChannelId);
    const isAlreadyOpened = (await this.getTabProgramIds()).includes(program.id);
    const shouldOpen = isTargetUser && !isAlreadyOpened;
    console.log(
      `shouldAutoOpen: userIdOrChannelId:(${userIdOrChannelId}) programId:(${program.id}) isTargetUser:(${isTargetUser}) isAlreadyOpened:(${isAlreadyOpened}) shouldOpen:(${shouldOpen})`,
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
