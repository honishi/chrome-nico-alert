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

describe("resolveProgram", () => {
  test("Parse watch-user.html", () => {
    const nicoapi = container.resolve<NiconamaApi>(InjectTokens.NiconamaApi);
    const html = fs.readFileSync("test/html/watch-user.html", "utf8");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const program = (nicoapi as any).extractProgramFromHtml(html);

    expect(program).toBeDefined();
    expect(program?.id).toBe("lv348714322");
    expect(program?.title).toBe("昨日ありがとう。");
    expect(program?.watchPageUrl).toBe("https://live.nicovideo.jp/watch/lv348714322");
    expect(program?.programProvider).toBeDefined();
    expect(program?.programProvider?.id).toBe("26671874");
    expect(program?.programProvider?.name).toBe("まがまり");
    expect(program?.socialGroup).toBeDefined();
    expect(program?.socialGroup.id).toBe("co0");
    expect(program?.socialGroup.name).toBe("削除されたコミュニティ");
    expect(program?.isFollowerOnly).toBe(false);
    expect(program?.beginAt).toEqual(new Date(1757841029 * 1000));
  });

  test("Parse watch-channel.html", () => {
    const nicoapi = container.resolve<NiconamaApi>(InjectTokens.NiconamaApi);
    const html = fs.readFileSync("test/html/watch-channel.html", "utf8");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const program = (nicoapi as any).extractProgramFromHtml(html);

    expect(program).toBeDefined();
    expect(program?.id).toBe("lv348687624");
    expect(program?.title).toBe(
      "再生の道 代表選考会 生中継｜登壇:石丸伸二代表、候補者:⻘柳充哉･⼤⾕佳弘･奥村光貴･萩原崇･⽔野純也"
    );
    expect(program?.watchPageUrl).toBe("https://live.nicovideo.jp/watch/lv348687624");
    // Channel broadcasts don't have programProvider for user
    expect(program?.programProvider).toBeUndefined();
    expect(program?.socialGroup).toBeDefined();
    expect(program?.socialGroup.id).toBe("ch2525");
    expect(program?.socialGroup.name).toBe("ニコニコニュース");
    expect(program?.socialGroup.thumbnailUrl).toBe(
      "https://secure-dcdn.cdn.nimg.jp/comch/channel-icon/128x128/ch2525.jpg?1699511163"
    );
    expect(program?.isFollowerOnly).toBe(false);
    expect(program?.beginAt).toEqual(new Date(1757844000 * 1000));
  });

  test("Return undefined for invalid HTML", () => {
    const nicoapi = container.resolve<NiconamaApi>(InjectTokens.NiconamaApi);
    const html = "<html><body>No embedded data here</body></html>";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const program = (nicoapi as any).extractProgramFromHtml(html);
    expect(program).toBeUndefined();
  });
});
