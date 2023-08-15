import { SoundType } from "../model/sound-type";

export interface BrowserApi {
  setBadgeNumber(number: number): Promise<void>;
  playSound(sound: SoundType): Promise<void>;
  showNotification(title: string, message: string, iconUrl: string): Promise<void>;
  getAutoOpenUserIds(): Promise<string[]>;
  openTab(url: string): Promise<void>;
}
