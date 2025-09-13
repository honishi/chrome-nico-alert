import { container } from "tsyringe";
import { BackgroundImpl } from "../domain/usecase/background";
import { BrowserApiImpl } from "../infra/browser-api";
import { ContentImpl } from "../domain/usecase/content";
import { NiconamaApiImpl } from "../infra/niconama-api";
import { PopupImpl } from "../domain/usecase/popup";
import { InjectTokens } from "./inject-tokens";
import { OptionImpl } from "../domain/usecase/option";
import { WebPushManager } from "../infra/web-push-manager";

export function configureDefaultContainer() {
  // Singleton: Services that maintain state and should avoid multiple instances
  container.registerSingleton(InjectTokens.Background, BackgroundImpl);
  container.registerSingleton(InjectTokens.BrowserApi, BrowserApiImpl);
  container.registerSingleton(InjectTokens.PushManager, WebPushManager);

  // Transient: Services that need individual instances per screen
  container.register(InjectTokens.Content, { useClass: ContentImpl });
  container.register(InjectTokens.NiconamaApi, { useClass: NiconamaApiImpl });
  container.register(InjectTokens.Option, { useClass: OptionImpl });
  container.register(InjectTokens.Popup, { useClass: PopupImpl });
}
