/**
 * Broadcast information obtained from push notifications
 */
export interface PushProgram {
  /** Notification body (e.g., "「車載配信 湯河原温泉までドライブ」を放送") */
  body: string;

  /** Icon URL (e.g., "https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/13143/131438120.jpg?1739782913") */
  icon: string;

  /** Notification title (e.g., "Japan Explorersさんが生放送を開始") */
  title: string;

  /** Creation date/time (e.g., "2025-09-14T02:59:53Z") */
  createdAt?: string;

  /** URL to open on click (e.g., "https://live.nicovideo.jp/watch/lv348712105?from=webpush&_topic=live_user_program_onairs") */
  onClick?: string;
}
