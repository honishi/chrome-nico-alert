import "reflect-metadata";
import { NiconamaApiImpl } from "../src/infra/niconama-api";
import { container } from "tsyringe";
import { InjectTokens } from "../src/di/inject-tokens";
import { NiconamaApi } from "../src/domain/infra-interface/niconama-api";
import * as fs from "fs";

beforeAll(() => {
  container.register(InjectTokens.NiconamaApi, { useClass: NiconamaApiImpl });
});

test("Parse programs_onair.json", async () => {
  const nicoapi = container.resolve<NiconamaApi>(InjectTokens.NiconamaApi);
  const json = fs.readFileSync("test/json/programs_onair.json", "utf8");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const programs = (nicoapi as any).extractFollowProgramsFromJson(json);
  // console.log(programs);
  expect(programs.length).toBeGreaterThan(0);
});

test("Parse recent_programs.json", async () => {
  const nicoapi = container.resolve<NiconamaApi>(InjectTokens.NiconamaApi);
  const json = fs.readFileSync("test/json/recent_programs.json", "utf8");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const programs = (nicoapi as any).extractRecentProgramsFromJson(json);
  // console.log(programs);
  expect(programs.length).toBeGreaterThan(0);
});

test("Parse ranking.html", async () => {
  const nicoapi = container.resolve<NiconamaApi>(InjectTokens.NiconamaApi);
  const html = fs.readFileSync("test/html/ranking.html", "utf8");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const programs = (nicoapi as any).extractUserProgramRankingFromHtml(html);
  // console.log(programs);
  expect(programs.length).toBeGreaterThan(0);
});
