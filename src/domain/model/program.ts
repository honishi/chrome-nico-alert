export type Program = {
  id: string;
  title: string;
  screenshotThumbnail: ScreenshotThumbnail;
  watchPageUrl: string;
  programProvider: ProgramProvider;
  socialGroup: SocialGroup;
  isFollowerOnly: boolean;
  beginAt: Date;
};

type ScreenshotThumbnail = {
  liveScreenshotThumbnailUrl: string;
};

type ProgramProvider = {
  id: string;
  name: string;
  icon: string;
  iconSmall: string;
};

type SocialGroup = {
  name: string;
  thumbnailUrl: string;
};
