import { SoundType } from "../model/sound-type";

export interface BrowserApi {
  setBadgeNumber(number: number): Promise<void>;
  playSound(sound: SoundType): Promise<void>;
  showNotification(
    title: string,
    message: string,
    iconUrl: string,
    onCreated: (notificationId: string) => void,
  ): void;
  getAutoOpenUserIds(): Promise<string[]>;
  openTab(url: string): Promise<void>;
  getTabUrls(): Promise<string[]>;
}
