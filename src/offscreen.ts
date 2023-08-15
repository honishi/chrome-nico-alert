import { ChromeMessage } from "./infra/chrome_message/message";

// Listen for messages from the extension
chrome.runtime.onMessage.addListener(async (msg) => {
  // console.log(`Received message from the extension: ${JSON.stringify(msg)}`);
  const chromeMessage = msg as ChromeMessage;
  let source = "";
  switch (chromeMessage) {
    case ChromeMessage.PLAY_DEFAULT_SOUND:
      source = "../sounds/new_live_sub.mp3";
      break;
    case ChromeMessage.PLAY_NEW_LIVE_SOUND_MAIN:
      source = "../sounds/new_live_main.mp3";
      break;
    case ChromeMessage.PLAY_NEW_LIVE_SOUND_SUB:
      source = "../sounds/new_live_sub.mp3";
      break;
  }
  await playAudio(source);
});

// Play sound with access to DOM APIs
async function playAudio(source: string, volume: number = 1) {
  const audio = new Audio(source);
  audio.volume = volume;
  await audio.play();
}
