import { container } from "tsyringe";
import { BackgroundImpl } from "../domain/usecase/background";
import { BrowserApiImpl } from "../infra/browser/browser-api";
import { ContentImpl } from "../domain/usecase/content";
import { NiconamaApiImpl } from "../infra/api_client/nicoapi";
import { PopupImpl } from "../domain/usecase/popup";
import { InjectTokens } from "./injections";

export function configureDefaultContainer() {
  container.register(InjectTokens.Background, { useClass: BackgroundImpl });
  container.register(InjectTokens.BrowserApi, { useClass: BrowserApiImpl });
  container.register(InjectTokens.Content, { useClass: ContentImpl });
  container.register(InjectTokens.NiconamaApi, { useClass: NiconamaApiImpl });
  container.register(InjectTokens.Popup, { useClass: PopupImpl });
}
