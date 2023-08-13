export class BrowserApiImpl implements BrowserApi {
  async setBadgeNumber(number: number): Promise<void> {
    await chrome.action.setBadgeText({ text: number.toString() });
  }
}
