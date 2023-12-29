export type Program = {
  id: string;
  title: string;
  screenshotThumbnail: ScreenshotThumbnail;
  listingThumbnail?: string;
  watchPageUrl: string;
  programProvider?: ProgramProvider;
  socialGroup: SocialGroup;
  isFollowerOnly: boolean;
  beginAt: Date;
  isMute: boolean;
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
  id: string;
  name: string;
  thumbnailUrl: string;
};
