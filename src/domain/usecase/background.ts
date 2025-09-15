import { Program } from "../model/program";
import { PushProgram } from "../model/push-program";
import { inject, injectable } from "tsyringe";
import { InjectTokens } from "../../di/inject-tokens";
import { SoundType } from "../model/sound-type";
import { BrowserApi } from "../infra-interface/browser-api";
import { NiconamaApi } from "../infra-interface/niconama-api";
import { PushManager } from "../infra-interface/push-manager";
import { defaultBadgeBackgroundColor } from "./colors";

const RUN_INTERVAL = 1000 * 30; // 30 seconds
const DELAY_AFTER_OPEN = 1000 * 5; // 5 seconds

export interface Background {
  run(): Promise<void>;
  openNotification(notificationId: string): Promise<void>;
  handlePushNotificationSettingChange(enabled: boolean): Promise<void>;
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
    @inject(InjectTokens.PushManager) private pushManager: PushManager,
  ) {
    this.initialize().then(() => console.log("Background initialized"));
  }

  async initialize(): Promise<void> {
    await this.resetSuspended();
    await this.initializePushManager();
  }

  private async initializePushManager(): Promise<void> {
    console.log("Initializing PushManager...");
    try {
      // Set callback for PushManager
      this.pushManager.onProgramDetected = (pushProgram: PushProgram) =>
        this.processPushProgram(pushProgram);

      // Check push notification settings
      const isPushEnabled = await this.browserApi.getReceivePushNotification();
      console.log("Push notification setting:", isPushEnabled);

      if (isPushEnabled) {
        // Start PushManager if setting is ON
        await this.pushManager.start();
        console.log("PushManager started");
      } else {
        console.log("Push notification is disabled, not starting PushManager");
      }
    } catch (error) {
      console.error("PushManager initialization failed:", error);
    }
  }

  async resetSuspended(): Promise<void> {
    await this.browserApi.setSuspendFromDate(undefined);
    await this.browserApi.setBadgeBackgroundColor(defaultBadgeBackgroundColor);
  }

  async handlePushNotificationSettingChange(enabled: boolean): Promise<void> {
    console.log(`Push notification setting changed to: ${enabled}`);

    try {
      if (enabled) {
        // Start PushManager when setting is turned ON
        console.log("Starting push notifications...");
        await this.pushManager.start();
        console.log("Push notifications started");
      } else {
        // Reset PushManager when setting is turned OFF
        console.log("Resetting push notifications...");
        await this.pushManager.reset();
        console.log("Push notifications reset");
      }
    } catch (error) {
      console.error(`Failed to ${enabled ? "start" : "reset"} push notifications:`, error);
    }
  }

  /**
   * プッシュ通知データからプログラムIDを抽出
   */
  private extractProgramId(url?: string): string {
    if (!url) return "";
    const match = url.match(/watch\/(lv\d+)/);
    return match?.[1] || "";
  }

  /**
   * プッシュ通知で検知した放送を処理
   */
  async processPushProgram(pushProgram: PushProgram): Promise<void> {
    // Filter out old notifications (skip notifications older than 3 minutes)
    const MAX_NOTIFICATION_AGE_MINUTES = 3;
    if (pushProgram.createdAt) {
      const notificationTime = new Date(pushProgram.createdAt);
      const now = new Date();
      const ageMinutes = (now.getTime() - notificationTime.getTime()) / (1000 * 60);

      if (ageMinutes > MAX_NOTIFICATION_AGE_MINUTES) {
        console.log(
          `Skipping stale notification (${ageMinutes.toFixed(1)} minutes old): ${
            pushProgram.onClick
          }`,
        );
        return;
      }
    }

    // Extract programId from PushProgram
    const programId = this.extractProgramId(pushProgram.onClick);
    if (!programId) {
      // Silently skip non-live notifications such as video upload notifications
      console.log("Skipping non-live notification:", pushProgram.onClick);
      return;
    }

    // Get Program information via resolveProgram API
    const program = await this.niconamaApi.resolveProgram(programId);
    if (!program) {
      console.log(`Program not found (may have been deleted): ${programId}`);
      return;
    }

    console.log("Processing push program:", program.id, program.title);

    // Check if already processed
    if (this.isProcessed(program)) {
      console.log("Program already processed:", program.id);
      return;
    }

    // Add to processed list
    this.processedProgramIds.push(program.id);
    this.logProgram("Found program from push notification:", program);

    // Check notification display settings
    const showNotification = await this.browserApi.getShowNotification();
    const isSuspended = (await this.browserApi.getSuspendFromDate()) !== undefined;

    // Display notification
    if (showNotification) {
      this.showNotification(program, "⚡️");
    }

    // Don't open tab if suspended
    if (isSuspended) {
      console.log("Suspended, not opening tab:", program.id);
      return;
    }

    // Auto-open determination
    const shouldAutoOpen = await this.shouldAutoOpenProgram(program);
    if (shouldAutoOpen) {
      await this.browserApi.openTab(program.watchPageUrl);
      await this.browserApi.playSound(SoundType.NEW_LIVE_MAIN);
    } else if (showNotification) {
      await this.browserApi.playSound(SoundType.NEW_LIVE_SUB);
    }
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

    const showNotification = await this.browserApi.getShowNotification();
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
      if (showNotification) {
        this.showNotification(program, "🏠");
      }
      if (isSuspended) {
        console.log("Suspended", program.id);
        continue;
      }
      const shouldAutoOpen = await this.shouldAutoOpenProgram(program);
      if (shouldAutoOpen) {
        await this.browserApi.openTab(program.watchPageUrl);
        await this.browserApi.playSound(SoundType.NEW_LIVE_MAIN);
      } else if (showNotification) {
        await this.browserApi.playSound(SoundType.NEW_LIVE_SUB);
      }
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
      if (showNotification) {
        this.showNotification(program, "🔎");
      }
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

  private showNotification(program: Program, prefix: string): void {
    this.browserApi.showNotification(
      `${prefix} ${program.programProvider?.name ?? program.socialGroup.name}が放送開始`,
      program.title,
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
