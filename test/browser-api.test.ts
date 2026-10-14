import { BrowserApiImpl } from "../src/infra/browser-api";

const remoteIconUrl = "https://img.nicoprofile.nimg.jp/usericon/1112/11126750.jpg";
const fallbackIconUrl = "chrome-extension://test/icons/icon128.png";

describe("BrowserApiImpl.showNotification", () => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  let browserApi: BrowserApiImpl;
  let create: jest.Mock<
    void,
    [chrome.notifications.NotificationOptions, (id: string | undefined) => void]
  >;
  let onCreated: jest.Mock<void, [string]>;
  let lastError: chrome.runtime.LastError | undefined;
  let readLastError: jest.Mock;

  beforeEach(() => {
    create = jest.fn();
    onCreated = jest.fn();
    lastError = undefined;
    readLastError = jest.fn(() => lastError);
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        notifications: { create },
        runtime: {
          getURL: jest.fn((path: string) => `chrome-extension://test/${path}`),
          get lastError() {
            return readLastError();
          },
        },
      },
    });
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    browserApi = new BrowserApiImpl();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  });

  function completeCreation(
    callIndex: number,
    id: string | undefined,
    errorMessage?: string,
  ): void {
    lastError = errorMessage ? { message: errorMessage } : undefined;
    try {
      create.mock.calls[callIndex][1](id);
    } finally {
      lastError = undefined;
    }
  }

  test("reports successful creation with the requested icon", () => {
    browserApi.showNotification("Broadcast started", "Program title", remoteIconUrl, onCreated);

    expect(create.mock.calls[0][0]).toEqual({
      type: "basic",
      iconUrl: remoteIconUrl,
      title: "Broadcast started",
      message: "Program title",
    });
    expect(onCreated).not.toHaveBeenCalled();
    completeCreation(0, "notification-1");

    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onCreated).toHaveBeenCalledWith("notification-1");
    expect(create).toHaveBeenCalledTimes(1);
  });

  test("recovers from image download failure with a local icon", () => {
    browserApi.showNotification("Broadcast started", "Program title", remoteIconUrl, onCreated);
    completeCreation(0, undefined, "Unable to download all specified images.");

    expect(readLastError).toHaveBeenCalledTimes(1);
    expect(onCreated).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0]).toEqual({
      type: "basic",
      iconUrl: fallbackIconUrl,
      title: "Broadcast started",
      message: "Program title",
    });

    completeCreation(1, "fallback-notification");
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onCreated).toHaveBeenCalledWith("fallback-notification");
  });

  test("stops retrying and reports failure when the local icon also fails", () => {
    browserApi.showNotification("Broadcast started", "Program title", remoteIconUrl, onCreated);
    completeCreation(0, undefined, "Unable to download all specified images.");
    completeCreation(1, undefined, "Notifications are disabled");

    expect(readLastError).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(2);
    expect(onCreated).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      "Failed to create notification with local icon:",
      "Notifications are disabled",
    );
  });

  test("uses the local icon when no icon URL is available", () => {
    browserApi.showNotification("Broadcast started", "Program title", "", onCreated);
    expect(create.mock.calls[0][0].iconUrl).toBe(fallbackIconUrl);
    completeCreation(0, "notification-1");
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onCreated).toHaveBeenCalledWith("notification-1");
  });

  test("does not retry a failed notification already using the local icon", () => {
    browserApi.showNotification("Broadcast started", "Program title", fallbackIconUrl, onCreated);
    completeCreation(0, undefined, "Notifications are disabled");
    expect(create).toHaveBeenCalledTimes(1);
    expect(onCreated).not.toHaveBeenCalled();
  });

  test("does not report success when Chrome returns no notification ID", () => {
    browserApi.showNotification("Broadcast started", "Program title", remoteIconUrl, onCreated);
    completeCreation(0, undefined);
    expect(onCreated).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("Notification creation returned no notification ID");
  });
});
