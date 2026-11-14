// 딸깍 성능 평가 보고서(심사·발표용) — data2.json(최종 측정에서 계산)과 차트 PNG 로 docx 를 만든다.
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, Header, Footer,
  AlignmentType, WidthType, ShadingType, BorderStyle, LevelFormat, PageNumber, PageBreak,
  HeadingLevel, TableLayoutType, VerticalAlign,
} = require("docx");

const DIR = __dirname;
const D = JSON.parse(fs.readFileSync(path.join(DIR, "data2.json"), "utf8"));
const OUT = process.argv[2] || path.join(DIR, "ttalkak_report.docx");

// ── 디자인 토큰 ─────────────────────────────────────────────
const FONT = "Malgun Gothic";       // Windows 기본 한글 글꼴 — Mac Word 는 Apple SD Gothic Neo 로 대체
const MONO = "Consolas";
const C = { teal: "0F6E6E", tealSoft: "E3EFEE", rust: "B4552D", rustSoft: "F6E6DE", ink: "1E2A2E",
            muted: "6B7478", line: "D9D6CF", paper: "F5F3EE", white: "FFFFFF" };
const PAGE_W = 11906, MARGIN = 1247;                // A4, 2.2cm
const W = PAGE_W - MARGIN * 2;                      // 본문 폭 9412 DXA
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const pfmt = (p) => (p < 0.001 ? "p < 0.001" : `p = ${p.toFixed(2)}`);

// ── 작은 빌더 ───────────────────────────────────────────────
const run = (text, o = {}) => new TextRun({ text, font: { name: o.mono ? MONO : FONT, eastAsia: FONT }, ...o });
const para = (children, o = {}) => new Paragraph({
  spacing: { after: 120, line: 300 }, ...o,
  children: (Array.isArray(children) ? children : [children]).map((c) => (typeof c === "string" ? run(c) : c)),
});
const h1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [run(text)] });
const h2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run(text)] });
const bullet = (children, level = 0) => para(children, { numbering: { reference: "bul", level }, spacing: { after: 60, line: 290 } });
const caption = (text) => para([run(text, { size: 17, color: C.muted })], { spacing: { before: 40, after: 200 } });
const spacer = (after = 120) => new Paragraph({ spacing: { after }, children: [] });

const none = { style: BorderStyle.NONE, size: 0, color: C.white };
const noBorders = { top: none, bottom: none, left: none, right: none };
const hair = { style: BorderStyle.SINGLE, size: 4, color: C.line };
const TB = { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };

function cell(children, o = {}) {
  return new TableCell({
    width: { size: o.w, type: WidthType.DXA },
    shading: o.fill ? { type: ShadingType.CLEAR, color: "auto", fill: o.fill } : undefined,
    margins: { top: o.pt ?? 100, bottom: o.pb ?? 100, left: o.pl ?? 140, right: o.pr ?? 140 },
    borders: o.borders || { top: hair, bottom: hair, left: none, right: none },
    verticalAlign: o.valign || VerticalAlign.CENTER,
    columnSpan: o.span,
    children: (Array.isArray(children) ? children : [children]).map((c) =>
      c instanceof Paragraph ? c : para(typeof c === "string" ? [run(c, { size: 18 })] : c, { spacing: { after: 0, line: 270 } })),
  });
}

// 데이터 표: 머리글은 진한 청록, 본문은 가는 가로선. hi 로 강조할 행 번호.
function dataTable(cols, rows, o = {}) {
  const widths = cols.map((c) => c.w);
  const head = new TableRow({
    tableHeader: true,
    children: cols.map((c) => cell(para([run(c.t, { bold: true, color: C.white, size: 17 })],
      { spacing: { after: 0 }, alignment: c.align || AlignmentType.LEFT }), { w: c.w, fill: C.teal, borders: noBorders })),
  });
  const body = rows.map((r, i) => new TableRow({
    cantSplit: true,
    children: r.map((v, j) => cell(para([run(String(v), { size: 18, bold: o.hi === i && j <= 1, color: C.ink })],
      { spacing: { after: 0, line: 270 }, alignment: cols[j].align || AlignmentType.LEFT }),
      { w: widths[j], fill: o.hi === i ? C.tealSoft : undefined })),
  }));
  return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED, borders: TB, rows: [head, ...body] });
}

// 강조 상자(한 칸 표): 왼쪽 굵은 띠 + 옅은 바탕.
function callout(title, lines, tone = "teal") {
  const bar = tone === "teal" ? C.teal : C.rust, fill = tone === "teal" ? C.tealSoft : C.rustSoft;
  const kids = [para([run(title, { bold: true, color: bar, size: 19 })], { spacing: { after: 80 } }),
    ...lines.map((l) => para(typeof l === "string" ? [run(l, { size: 19 })] : l, { spacing: { after: 60, line: 290 } }))];
  return new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: [W], layout: TableLayoutType.FIXED, borders: TB,
    rows: [new TableRow({ cantSplit: true, children: [cell(kids, { w: W, fill, pt: 160, pb: 120, pl: 240, pr: 240,
      borders: { top: none, bottom: none, right: none, left: { style: BorderStyle.SINGLE, size: 24, color: bar } } })] })],
  });
}

// 숫자 카드 줄: 큰 숫자 + 이름 + 근거.
function kpiRow(items) {
  const w = Math.floor(W / items.length);
  const widths = items.map((_, i) => (i === items.length - 1 ? W - w * (items.length - 1) : w));
  return new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED, borders: TB,
    rows: [new TableRow({ cantSplit: true, children: items.map((k, i) => cell([
      para([run(k.big, { size: 44, bold: true, color: k.color || C.teal })], { spacing: { after: 40, line: 240 } }),
      para([run(k.label, { size: 18, bold: true, color: C.ink })], { spacing: { after: 30, line: 260 } }),
      para([run(k.sub, { size: 15, color: C.muted })], { spacing: { after: 0, line: 250 } }),
    ], { w: widths[i], fill: C.paper, valign: VerticalAlign.TOP, pt: 180, pb: 160, pl: 180, pr: 120,
         borders: { top: none, bottom: none, left: i ? { style: BorderStyle.SINGLE, size: 12, color: C.white } : none, right: none } })) })],
  });
}

const img = (file, wPx, hPx, widthDxa = W) => {
  const wpt = widthDxa / 20, hpt = wpt * hPx / wPx;
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 40 },
    children: [new ImageRun({ type: "png", data: fs.readFileSync(path.join(DIR, file)),
      transformation: { width: Math.round(wpt * 96 / 72), height: Math.round(hpt * 96 / 72) },
      altText: { title: file, description: file, name: file } })] });
};

// ── 숫자 ───────────────────────────────────────────────────
const b7 = D.v7, b10 = D.v10, P = D.paired.v2, IT = D.items, BH = D.behavior, A = D.trackA, H = D.human;
const lossPct = (s) => pct(s.L / s.N, 0);
const rq = A["요구사항 충족률"], fab = A["지어내기"], ph = A["자리표시자 개수"], gold = A["정확성"];
const p2 = (p) => (p < 0.00001 ? "p < 0.00001" : p < 0.001 ? "p < 0.001" : `p = ${p.toFixed(3)}`);

// ── 표지 ───────────────────────────────────────────────────
const cover = [
  spacer(1100),
  para([run("졸업 프로젝트 · 프롬프트 개선 서비스", { size: 20, color: C.muted })], { spacing: { after: 160 } }),
  para([run("딸깍 성능 평가 보고서", { size: 60, bold: true, color: C.ink })], { spacing: { after: 160 } }),
  para([run("사람 평가로 찾은 문제를 고쳐, 원래 요청에 지는 비율을 ", { size: 28, color: C.teal }),
        run(`${lossPct(b7)} → ${lossPct(b10)}`, { size: 28, bold: true, color: C.teal }), run("로", { size: 28, color: C.teal })],
       { spacing: { after: 600 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: C.teal, space: 18 } } }),
  para([run("핵심 결과", { size: 20, bold: true, color: C.ink })], { spacing: { after: 140 } }),
  kpiRow([
    { big: `${lossPct(b7).replace("%", "")}→${lossPct(b10)}`, label: "원래 요청에 지는 비율", sub: `v7 → v10 · 같은 요청끼리 비교 ${p2(P.sign_p)}` },
    { big: `${IT.better}/${IT.better + IT.same + IT.worse}`, label: "요청에서 개선", sub: `나빠진 요청 ${IT.worse}개 · ${p2(IT.sign_p)}` },
    { big: `${BH.v7.len_ratio_median.toFixed(1)}→${BH.v10.len_ratio_median.toFixed(1)}배`, label: "결과물 길이", sub: "원래 요청 결과물 대비 · 군더더기 제거" },
    { big: pct(rq.mean_b), label: "명확한 요청 품질 유지", sub: `요구사항 충족률 · 원래 요청 ${pct(rq.mean_a)}`, color: C.ink },
  ]),
  spacer(500),
  dataTable([{ t: "항목", w: 2400 }, { t: "내용", w: W - 2400 }], [
    ["작성일", "2026년 11월 15일"],
    ["대상", "딸깍 생성 프롬프트 v10 (이전 배포 버전 v7 과 비교)"],
    ["평가 규모", `애매한 요청 17개 × 4회 · 명확한 요청 31개 · 사람 평가 2명 × 10쌍`],
    ["측정 모델", "gemini-3.6-flash (딸깍 프롬프트 생성 · 결과물 실행 · 판정)"],
  ]),
  new Paragraph({ children: [new PageBreak()] }),
];

// ── 요약 ───────────────────────────────────────────────────
const summary = [
  h1("요약"),
  para("딸깍은 사용자가 짧게 쓴 요청을 AI가 더 잘 알아듣는 프롬프트로 다듬고, 빠진 정보는 지어내지 않고 사용자에게 물어보는 서비스다."),
  callout("이 보고서의 질문", ["딸깍이 다듬은 프롬프트를 쓰면, 원래 요청을 그대로 쓸 때보다 AI 결과물이 좋아지는가? 좋아지지 않는다면 무엇을 고쳐야 하는가?"]),
  spacer(),
  bullet([run("사람 평가로 문제를 찾았다. ", { bold: true }),
    run(`평가자 2명이 이전 버전(v7)의 결과물을 직접 비교한 결과, 딸깍 결과물은 '지울 부분이 30% 이상'이라는 평가가 20번 중 ${H.fluff_tt}번(원래 요청 ${H.fluff_raw}번)이었다. 해설·체크리스트·불필요한 버전이 붙어 있었다.`)]),
  bullet([run("원인을 고쳤다. ", { bold: true }),
    run("딸깍 프롬프트가 실행 AI에게 결과물 밖의 해설과 체크리스트를 출력하게 하고, 요청에 없는 개수('3가지')를 강제하던 부분을 고쳐 v10을 만들었다.")]),
  bullet([run("원래 요청에 지는 비율이 크게 줄었다. ", { bold: true }),
    run(`애매한 요청에서 ${lossPct(b7)} → ${lossPct(b10)}. 같은 요청·회차끼리 비교하면 ${P.better}번 좋아지고 ${P.worse}번 나빠졌다(${p2(P.sign_p)}). 두 버전 모두 결과물이 있는 요청 ${IT.better + IT.same + IT.worse}개 중 ${IT.better}개에서 좋아졌다.`)]),
  bullet([run("이미 잘 쓴 요청은 망치지 않는다. ", { bold: true }),
    run(`명확한 요청 31개에서 요구사항 충족률 ${pct(rq.mean_b)}(원래 요청 ${pct(rq.mean_a)}). 이 판정기는 사람 채점과 94~97% 일치한다.`)]),
  spacer(60),
  para([run("다음 목표: ", { bold: true, color: C.teal }),
    run(`v10은 원래 요청과 대등한 수준(딸깍이 더 좋음 ${pct(b10.win, 0)} · 원래 요청이 더 좋음 ${pct(b10.loss, 0)})까지 올라왔다. 다음 단계는 원래 요청보다 확실히 좋은 결과를 만드는 것이다(5장).`)]),
];

// ── 1. 방법 ────────────────────────────────────────────────
const method = [
  h1("1. 어떻게 쟀나"),
  para("같은 AI에게 같은 요청을 두 가지 방식으로 넣고, 나온 결과물을 비교했다."),
  dataTable([{ t: "단계", w: 2000 }, { t: "내용", w: W - 2000 }], [
    ["결과물 만들기", "같은 AI에 ① 원래 요청 ② 딸깍 프롬프트를 각각 넣는다. 시스템 프롬프트·온도·출력 한도는 같다."],
    ["공정한 조건", "딸깍이 빈칸으로 물어본 정보(예: 동아리 이름·모집 기간)는 사용자가 채운다고 보고, 원래 요청에도 같은 정보를 똑같이 붙인다. 정보량이 같으므로 차이는 프롬프트의 품질에서 나온다."],
    ["비교", "AI 판정기가 두 결과물 중 요청자가 실제로 쓸 쪽을 고른다. 어느 쪽이 딸깍인지는 모른다. 순서를 바꿔 두 번 묻고, 두 번 모두 같은 쪽일 때만 승패로 센다."],
    ["판정기", "사람 평가와 가장 가깝게 판단하도록 만든 판정기를 쓴다(4장). 결과물마다 의도·고칠 양·군더더기·정확성을 먼저 매긴 뒤 비교한다."],
    ["반복", "AI 답은 매번 달라서 같은 요청을 4번씩 반복했다."],
  ]),
  spacer(),
  dataTable([{ t: "세트", w: 2300 }, { t: "요청 예", w: 2900 }, { t: "보는 것", w: W - 5200 }], [
    ["애매한 요청 (17개 × 4회)", "\"사과문 써줘.\" \"팀 회식 공지 써줘.\"", "딸깍이 결과물을 좋게 만드는가 — 원래 요청과 짝 비교"],
    ["명확한 요청 (31개)", "\"아래 회의록을 결정사항 중심으로 5줄 요약해줘: …\"", "이미 잘 쓴 요청을 망치지 않는가 — 요구사항 충족률"],
  ]),
];

// ── 2. 개선 과정 ───────────────────────────────────────────
const fix = [
  h1("2. 문제를 찾고 고친 과정"),
  h2("2.1 사람 평가에서 찾은 문제"),
  para(`평가자 2명이 이전 버전(v7)의 결과물 10쌍을 출처를 모른 채 비교했다. 평가자는 결과물마다 의도·바로 쓰기·빠진 것·군더더기·정확성을 따로 답하고, 그다음 실제로 쓸 쪽을 골랐다.`),
  dataTable([{ t: "사람 평가 결과 (v7)", w: 5600 }, { t: "딸깍", w: 1900, align: AlignmentType.CENTER }, { t: "원래 요청", w: W - 7500, align: AlignmentType.CENTER }], [
    ["'요청자가 지울 부분이 30% 이상'이라는 평가 (20번 중)", `${H.fluff_tt}번`, `${H.fluff_raw}번`],
    ["평가자가 실제로 쓰겠다고 고른 횟수", `${H.rater_pick_tt}번`, `${H.rater_pick_raw}번`],
  ]),
  caption("원래 요청을 고른 이유로 가장 많이 나온 답은 '군더더기가 적음'이었다. 의도·정확성에서는 두 쪽 차이가 거의 없었다."),
  h2("2.2 원인"),
  para("딸깍 결과물을 하나씩 분석하니 군더더기는 딸깍 프롬프트가 직접 시킨 것이었다."),
  bullet(`실행 AI에게 '스스로 점검할 체크리스트'를 넣으라고 해서, 결과물에 체크리스트가 그대로 출력됐다(${BH.v7.checklist_outputs}/${D.n_cells.v7}).`),
  bullet(`요청에 없는 개수('3가지', '2가지', '한 단락')를 넣은 프롬프트가 ${pct(BH.v7.caps_rate, 0)}였다. 개수를 박으면 실행 AI가 그 수에 맞춰 내용을 자르거나 늘린다.`),
  bullet("참고 기법 자료의 \"'3문장으로 요약해 줘'처럼 구체화하라\" 같은 예시를 그대로 따라 쓴 것이 원인이었다."),
  h2("2.3 수정 — v10"),
  bullet([run("결과물만 내게 한다. ", { bold: true }), run("서두·요청 되풀이·해설·사용 팁·점검 결과처럼 결과물 밖의 말은 붙이지 않게 하고, 체크리스트는 실행 AI가 속으로만 점검하게 했다.")]),
  bullet([run("분량은 그 종류의 보통 크기로. ", { bold: true }), run("메시지·공지는 짧게, 여러 버전이 필요하면 두되 각 버전은 간결하게.")]),
  bullet([run("요청에 없는 개수·분량을 정하지 않는다. ", { bold: true }), run("❌ \"해결 방법 2가지를 제시하라\" → ✅ \"해결 방법들을 제시하라\". 사용자가 정한 개수만 옮긴다.")]),
  bullet([run("지키던 것은 그대로. ", { bold: true }), run("모르는 사실은 지어내지 않고 빈칸으로 묻기, 사용자가 준 원문은 그대로 인용하기, 정보가 너무 부족하면 되묻기. 이 안전 규칙은 수정 후에도 12/12로 유지됐다.")]),
  h2("2.4 결과물이 이렇게 바뀌었다"),
  dataTable([{ t: "지표 (애매한 요청)", w: 4800 }, { t: "v7", w: 2000, align: AlignmentType.CENTER }, { t: "v10", w: W - 6800, align: AlignmentType.CENTER }], [
    ["결과물 길이 (원래 요청 결과물 대비, 중앙값)", `${BH.v7.len_ratio_median.toFixed(2)}배`, `${BH.v10.len_ratio_median.toFixed(2)}배`],
    ["결과물에 체크리스트가 출력된 경우", `${BH.v7.checklist_outputs}회`, `${BH.v10.checklist_outputs}회`],
    ["요청에 없는 개수를 정한 프롬프트", pct(BH.v7.caps_rate, 0), pct(BH.v10.caps_rate, 0)],
    ["딸깍 프롬프트 길이 (중앙값)", `${BH.v7.prompt_len_median}자`, `${BH.v10.prompt_len_median}자`],
  ], { hi: 0 }),
];

// ── 3. 결과 ────────────────────────────────────────────────
const results = [
  h1("3. 결과"),
  h2("3.1 원래 요청과의 비교"),
  para(`애매한 요청 17개를 4번씩 측정했다. 딸깍이 결과물 대신 되묻기로 끝난 회차는 비교에서 뺐다(v7 ${D.asked.v7}회 · v10 ${D.asked.v10}회 — 예: \"공부 계획 세워줘\"는 v10에서 목표·기간을 먼저 묻는다).`),
  img("chart2_bars.png", 1280, 440),
  caption("그림 1. 애매한 요청에서 어느 쪽 결과물이 더 좋았나 (공정한 조건 — 두 쪽에 같은 정보)."),
  dataTable([{ t: "", w: 2400 }, { t: "딸깍 / 비슷 / 원래 요청", w: 2700, align: AlignmentType.CENTER },
             { t: "원래 요청에 지는 비율 (95% 구간)", w: W - 5100, align: AlignmentType.CENTER }], [
    ["v7 (이전)", `${b7.W} / ${b7.T} / ${b7.L}`, `${pct(b7.loss, 0)} (${pct(b7.loss_ci[0], 0)}~${pct(b7.loss_ci[1], 0)})`],
    ["v10 (개선 후)", `${b10.W} / ${b10.T} / ${b10.L}`, `${pct(b10.loss, 0)} (${pct(b10.loss_ci[0], 0)}~${pct(b10.loss_ci[1], 0)})`],
  ], { hi: 1 }),
  spacer(80),
  para([run("같은 요청·회차끼리 짝지어 보면 ", {}), run(`v10이 ${P.better}번 좋아지고 ${P.worse}번 나빠졌다`, { bold: true }),
        run(`(그대로 ${P.same}번, ${p2(P.sign_p)}). 두 구간이 겹치지 않을 만큼 큰 차이다.`)]),
  h2("3.2 요청별로 보면"),
  img("chart2_items.png", 1280, 920),
  caption("그림 2. 요청마다 (딸깍 승 − 원래 요청 승), 4회 기준. 빈 원 = v7, 채운 원 = v10."),
  para(`두 버전 모두 결과물이 있는 요청 ${IT.better + IT.same + IT.worse}개 중 ${IT.better}개에서 좋아졌고(${p2(IT.sign_p)}), 나빠진 요청은 ${IT.worse}개다. 사과문·회식 공지·크롤러·유튜브 제목처럼 쓰임새가 정해지지 않은 요청에서는 이제 딸깍이 앞서고, 원문을 다듬거나 코드를 리뷰하는 요청에서는 지던 결과가 동률 가까이 올라왔다.`),
  h2("3.3 명확한 요청 — 망치지 않는가"),
  para("조건을 다 적은 요청에서는 딸깍이 결과를 망치지 않는 것이 목표다. 사람 채점과 94~97% 일치하는 요구사항 판정기로 쟀다."),
  dataTable([{ t: "지표 (명확한 요청, 같은 요청끼리)", w: 4300 }, { t: "원래 요청", w: 1600, align: AlignmentType.CENTER },
             { t: "딸깍 v10", w: 1600, align: AlignmentType.CENTER }, { t: "요청 수", w: W - 7500, align: AlignmentType.CENTER }], [
    ["요구사항 충족률 (높을수록 좋음)", pct(rq.mean_a), pct(rq.mean_b), String(rq.n)],
    ["정확성 · 정답 있는 문항 (높을수록 좋음)", pct(gold.mean_a), pct(gold.mean_b), String(gold.n)],
    ["지어낸 사실이 있는 비율 (낮을수록 좋음)", pct(fab.mean_a), pct(fab.mean_b), String(fab.n)],
    ["결과물 속 빈칸 수 (낮을수록 바로 쓰기 쉬움)", `${ph.mean_a.toFixed(2)}개`, `${ph.mean_b.toFixed(2)}개`, String(ph.n)],
  ]),
  caption(`요구사항 충족률은 31개 중 ${rq.ties}개가 같고 좋아진 것·나빠진 것이 1개씩이다. 지어낸 사실과 빈칸은 조금 줄었다.`),
  h2("3.4 참고 — 정보를 물어보는 기능의 효과"),
  para("딸깍은 모르는 사실을 지어내지 않고 빈칸으로 물어본다. 사용자가 그 빈칸을 채운 딸깍 결과물은, 정보 없이 쓴 원래 요청 결과물보다 34번 모두 좋다고 판정됐다(이전 버전 v7로 측정, 34/34)."),
  caption("판정기가 사용자 정보를 알고 판단하는 비교라 딸깍에 유리하다. 성능 수치가 아니라 '물어보는 기능이 결과물을 사용자 상황에 맞게 만든다'는 사례로 본다."),
];

// ── 4. 신뢰도 ──────────────────────────────────────────────
const trust = [
  h1("4. 이 결과를 믿을 수 있나"),
  para("결과 대부분을 AI 판정기가 매겼으므로, 판정기 자체를 사람과 대조해 골랐다."),
  dataTable([{ t: "점검", w: 3000 }, { t: "결과", w: 1900, align: AlignmentType.CENTER }, { t: "방법", w: W - 4900 }], [
    ["짝 비교 판정기 — 사람과 같은 쪽을 고른 비율", `${pct(H.v1_pct, 0)} → ${pct(H.v2_pct, 0)}`,
     "평가자 2명의 선택과 비교. 처음 판정기는 긴 답을 선호했다. 결과물마다 의도·고칠 양·군더더기·정확성을 먼저 매기게 고친 판정기를 썼다. 두 평가자가 같은 답을 낸 쌍에서 틀린 판정도 3 → 1로 줄었다."],
    ["요구사항 판정기 — 사람 채점과 일치", "94~97%", "사람 2명이 71문항을 각자 채점해 비교(AC1 0.94~0.97, 합격선 0.6). 명확한 요청 결과(3.3)에 썼다."],
    ["안전 규칙 유지", "12/12", "사실 빈칸 유지 · 원문 그대로 인용 · 되묻기 · 템플릿 빈칸, 각 3회."],
  ]),
  spacer(),
  para([run("판정기에 따른 차이. ", { bold: true }),
    run(`긴 답을 선호하는 처음 판정기(사람과 ${pct(H.v1_pct, 0)} 일치)로 재면 v10이 v7보다 낮게 나온다. v10이 줄인 군더더기를 그 판정기는 장점으로 쳤기 때문이다. 결론은 사람과 더 가까운 판정기로 냈고, 두 판정기가 모두 같은 결론을 낸 경우만 세면 v10이 좋아진 경우 ${D.paired.both.better}번, 나빠진 경우 ${D.paired.both.worse}번이다(이 기준으로는 통계적으로 유의하지 않다).`)]),
];

// ── 5. 향후 과제 ───────────────────────────────────────────
const next = [
  h1("5. 향후 과제"),
  bullet([run("원래 요청보다 확실히 좋게. ", { bold: true }), run(`v10은 원래 요청과 대등하다(딸깍 ${pct(b10.win, 0)} · 원래 요청 ${pct(b10.loss, 0)}). 이기는 비율을 높이는 것이 다음 목표다.`)]),
  bullet([run("사람 평가 확대. ", { bold: true }), run("지금은 평가자 2명 × 10쌍이다. 평가자와 쌍을 늘려 판정기 검증을 넓힌다.")]),
  bullet([run("실제 사용자 정보로 재측정. ", { bold: true }), run("빈칸을 채운 정보는 요청 문장만 보고 미리 만든 가상 정보다. 실제 사용 기록이 쌓이면 그 값으로 다시 잰다.")]),
];

// ── 부록 ───────────────────────────────────────────────────
const appendix = [
  h1("부록"),
  h2("A. 용어"),
  dataTable([{ t: "용어", w: 2400 }, { t: "뜻", w: W - 2400 }], [
    ["원래 요청", "사용자가 쓴 요청을 그대로 AI에 넣은 경우."],
    ["딸깍 프롬프트", "딸깍이 원래 요청을 다듬어 만든 프롬프트."],
    ["판정기", "두 결과물 중 요청자가 실제로 쓸 쪽을 고르는 AI(gemini-3.6-flash)."],
    ["p값", "실제로는 차이가 없는데 이만큼 치우친 결과가 우연히 나올 확률. 0.05보다 작으면 유의하다고 본다."],
    ["95% 구간", "참값이 들어 있을 범위."],
    ["AC1", "두 채점자가 얼마나 일치하는지 나타내는 값(0~1). 답이 한쪽으로 쏠려도 안정적이다."],
  ]),
  spacer(),
  h2("B. 데이터 (rag-server/)"),
  dataTable([{ t: "파일", w: 5200 }, { t: "내용", w: W - 5200 }], [
    ["eval/results/uplift_trackB_v10_fair_20261115.json", "애매한 요청 v10 측정(공정한 조건, 두 판정기)"],
    ["eval/results/uplift_trackA_v10_20261115.json", "명확한 요청 v10 측정"],
    ["eval/results/final_v10_summary_20261115.json", "v7 대 v10 집계"],
    ["eval/results/pref_human_20261114.json", "사람 평가(2명 × 10쌍) 집계"],
    ["WORKLOG.md", "모든 변경의 Before/After와 근거"],
  ]),
];

// ── 문서 ───────────────────────────────────────────────────
const doc = new Document({
  creator: "Ttalkak", title: "딸깍 성능 평가 보고서", description: "사람 평가로 찾은 문제를 고친 v10 의 효과 측정",
  styles: {
    default: { document: { run: { font: { name: FONT, eastAsia: FONT }, size: 20, color: C.ink } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: { name: FONT, eastAsia: FONT }, size: 32, bold: true, color: C.ink },
        paragraph: { spacing: { before: 480, after: 200 }, keepNext: true, outlineLevel: 0,
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.line, space: 6 } } } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: { name: FONT, eastAsia: FONT }, size: 24, bold: true, color: C.teal },
        paragraph: { spacing: { before: 320, after: 120 }, keepNext: true, outlineLevel: 1 } },
    ],
  },
  numbering: { config: [{ reference: "bul", levels: [
    { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 400, hanging: 260 } }, run: { color: C.teal } } },
    { level: 1, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 800, hanging: 260 } } } },
  ] }] },
  sections: [
    { properties: { page: { size: { width: PAGE_W, height: 16838 }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
      children: cover },
    { properties: { page: { size: { width: PAGE_W, height: 16838 }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
        pageNumbers: { start: 1 } } },
      headers: { default: new Header({ children: [para([run("딸깍 성능 평가 보고서", { size: 15, color: C.muted })],
        { alignment: AlignmentType.RIGHT, spacing: { after: 0 } })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ children: [PageNumber.CURRENT], size: 16, color: C.muted, font: FONT })] })] }) },
      children: [...summary, ...method, ...fix, ...results, ...trust, ...next, ...appendix] },
  ],
});

Packer.toBuffer(doc).then((b) => { fs.writeFileSync(OUT, b); console.log(OUT); });
