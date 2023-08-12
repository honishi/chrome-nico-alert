export type Program = {
  title: string;
  screenshotThumbnail: ScreenshotThumbnail;
  watchPageUrl: string;
  programProvider: ProgramProvider;
};

type ScreenshotThumbnail = {
  liveScreenshotThumbnailUrl: string;
};

type ProgramProvider = {
  name: string;
  icon: string;
  iconSmall: string;
};
