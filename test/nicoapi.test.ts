import "reflect-metadata";
import { NicoApiImpl } from "../src/infra/api_client/nicoapi";
import { container } from "tsyringe";
import { InjectTokens } from "../src/di/injections";
import { NicoApi } from "../src/domain/infra-interface/nicoapi";
import * as fs from "fs";

beforeAll(() => {
  container.register(InjectTokens.NicoApi, { useClass: NicoApiImpl });
});

test("Parse programs_onair.json", async () => {
  const nicoapi = container.resolve<NicoApi>(InjectTokens.NicoApi);
  const json = fs.readFileSync("test/json/programs_onair.json", "utf8");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const programs = (nicoapi as any).extractOnAirProgramsFromJson(json);
  // console.log(programs);
  expect(programs.length).toBeGreaterThan(0);
});

test("Parse ranking.html", async () => {
  const nicoapi = container.resolve<NicoApi>(InjectTokens.NicoApi);
  const html = fs.readFileSync("test/html/ranking.html", "utf8");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const programs = (nicoapi as any).extractUserProgramRankingFromHtml(html);
  // console.log(programs);
  expect(programs.length).toBeGreaterThan(0);
});
