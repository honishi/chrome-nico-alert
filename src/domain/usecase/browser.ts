export class Browser {
  private browserApi: BrowserApi;
  constructor(browserApi: BrowserApi) {
    this.browserApi = browserApi;
  }
  public async setBadgeNumber(number: number): Promise<void> {
    await this.browserApi.setBadgeNumber(number);
  }
}
