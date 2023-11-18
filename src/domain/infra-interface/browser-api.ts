import { SoundType } from "../model/sound-type";

export interface BrowserApi {
  startSendingKeepAliveFromOffscreen(): Promise<void>;
  setBadgeNumber(number: number): Promise<void>;
  setBadgeBackgroundColor(hex: string): Promise<void>;
  getSoundVolume(): Promise<number>;
  setSoundVolume(value: number): Promise<void>;
  playSound(sound: SoundType): Promise<void>;
  showNotification(
    title: string,
    message: string,
    iconUrl: string,
    onCreated: (notificationId: string) => void,
  ): void;
  isAutoOpenUser(userId: string): Promise<boolean>;
  getAutoOpenUserIds(): Promise<string[]>;
  setAutoOpenUser(userId: string, enabled: boolean): Promise<void>;
  openTab(url: string): Promise<void>;
  getTabUrls(): Promise<string[]>;
  setSuspendFromDate(date: Date | undefined): Promise<void>;
  getSuspendFromDate(): Promise<Date | undefined>;
  openOptionsPage(): void;
}
