export type ChromeMessage = {
  messageType: ChromeMessageType;
  options?: { [key: string]: unknown };
};

export enum ChromeMessageType {
  PLAY_SOUND = "PLAY_SOUND",
}
