import "reflect-metadata";
import { NicoApiImpl } from "../src/infra/api_client/nicoapi";
import { container } from "tsyringe";
import { InjectTokens } from "../src/di/injections";
import { NicoApi } from "../src/domain/infra-interface/nicoapi";
import * as fs from "fs";

test("test", async () => {
  container.register(InjectTokens.NicoApi, { useClass: NicoApiImpl });
  const nicoapi = container.resolve<NicoApi>(InjectTokens.NicoApi);
  const data = fs.readFileSync("test/html/ranking.html", "utf8");
});
