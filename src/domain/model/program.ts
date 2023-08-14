export type Program = {
  id: string;
  title: string;
  screenshotThumbnail: ScreenshotThumbnail;
  watchPageUrl: string;
  programProvider: ProgramProvider;
  socialGroup: SocialGroup;
  isFollowerOnly: boolean;
};

type ScreenshotThumbnail = {
  liveScreenshotThumbnailUrl: string;
};

type ProgramProvider = {
  name: string;
  icon: string;
  iconSmall: string;
};

type SocialGroup = {
  thumbnailUrl: string;
};
