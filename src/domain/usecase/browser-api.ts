import { SoundType } from "../model/sound-type";

export interface BrowserApi {
  setBadgeNumber(number: number): Promise<void>;
  playSound(sound: SoundType): Promise<void>;
  showNotification(message: string): Promise<void>;
}
