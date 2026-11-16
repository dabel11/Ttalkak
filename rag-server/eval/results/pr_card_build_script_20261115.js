// 딸깍 성능 평가 보고서(심사·발표용) — data2.json(최종 측정에서 계산)과 차트 PNG 로 docx 를 만든다.
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, Header, Footer,
  AlignmentType, WidthType, ShadingType, BorderStyle, LevelFormat, PageNumber, PageBreak,
  HeadingLevel, TableLayoutType, VerticalAlign,
} = require("docx");

const DIR = __dirname;
const D = {};
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

// ── 발표용 요약(중간 분량) ───────────────────────────────
const sectionTitle = (t) => para([run(t, { size: 28, bold: true, color: C.ink })],
  { spacing: { before: 480, after: 200 }, keepNext: true });

// 딸깍이 하는 일 — 3칸 카드
const DO = [["다듬는다", "대충 쓴 요청을 AI가 잘 알아듣는 프롬프트로"],
            ["물어본다", "모르는 정보는 지어내지 않고 사용자에게"],
            ["바로 쓴다", "군더더기 없이 그대로 쓸 수 있는 결과물로"]];
const cw = Math.floor(W / 3), cws = [cw, cw, W - cw * 2];
const doCards = new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: cws, layout: TableLayoutType.FIXED, borders: TB,
  rows: [new TableRow({ cantSplit: true, children: DO.map(([h, d], i) => cell([
    para([run(String(i + 1).padStart(2, "0"), { size: 18, bold: true, color: C.teal })], { spacing: { after: 60 } }),
    para([run(h, { size: 30, bold: true, color: C.ink })], { spacing: { after: 80 } }),
    para([run(d, { size: 19, color: C.muted })], { spacing: { after: 0, line: 280 } }),
  ], { w: cws[i], fill: C.paper, valign: VerticalAlign.TOP, pt: 220, pb: 220, pl: 220, pr: 180,
       borders: { top: none, bottom: none, right: none, left: i ? { style: BorderStyle.SINGLE, size: 24, color: C.white } : none } })) })] });

// 핵심 지표
const ROWS = [
  ["34번 중 34번", "빠진 정보를 물어보고 채우면, 더 나은 결과"],
  ["10번 중 7번", "그냥 요청했을 때보다 같거나 더 좋은 결과"],
  ["98%", "요청한 조건을 정확히 반영"],
  ["군더더기 절반", "불필요한 설명은 빼고, 바로 쓰는 결과물"],
];
const NW = 3400;
const metrics = new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [NW, W - NW], layout: TableLayoutType.FIXED, borders: TB,
  rows: ROWS.map(([big, desc], i) => new TableRow({ cantSplit: true, children: [
    cell(para([run(big, { size: 44, bold: true, color: C.teal })], { spacing: { after: 0, line: 240 } }),
         { w: NW, pt: 220, pb: 220, pl: 120, borders: { top: i ? hair : none, bottom: none, left: none, right: none } }),
    cell(para([run(desc, { size: 23, color: C.ink })], { spacing: { after: 0, line: 290 } }),
         { w: W - NW, pt: 220, pb: 220, borders: { top: i ? hair : none, bottom: none, left: none, right: none } }),
  ] })) });

// 예시 — 같은 요청, 그냥 요청 vs 딸깍
const EX_RAW = ["일시: 202X년 O월 O일 (요일) OO:OO", "장소: [식당 이름] ([식당 위치/주소])", "주요 메뉴: [메뉴 종류]", "참석이 어려우면 [O월 O일 O시까지] 말씀해 주세요"];
const EX_TT = ["일시: 10월 24일(목) 오후 6시 30분", "장소: 도담갈비 역삼점 (예약자명: 김철수)", "회신 기한: 10월 22일(화) 오후 3시까지", "→ 메신저용 · 이메일용 버전을 바로 보낼 수 있게"];
const ew = Math.floor(W / 2);
const exLine = (t, color) => para([run(t, { size: 19, color })], { spacing: { after: 70, line: 270 } });
const example = new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [ew, W - ew], layout: TableLayoutType.FIXED, borders: TB,
  rows: [
    new TableRow({ tableHeader: true, children: [
      cell(para([run("그냥 요청하면", { bold: true, size: 20, color: C.rust })], { spacing: { after: 0 } }), { w: ew, fill: C.rustSoft, borders: noBorders, pl: 220 }),
      cell(para([run("딸깍을 쓰면", { bold: true, size: 20, color: C.teal })], { spacing: { after: 0 } }), { w: W - ew, fill: C.tealSoft, borders: noBorders, pl: 220 }),
    ] }),
    new TableRow({ cantSplit: true, children: [
      cell([para([run("빈칸투성이 — 직접 다 채워야 함", { size: 17, color: C.muted })], { spacing: { after: 100 } }), ...EX_RAW.map((t) => exLine(t, C.ink))],
           { w: ew, valign: VerticalAlign.TOP, pt: 160, pb: 160, pl: 220, borders: { top: none, bottom: hair, left: none, right: none } }),
      cell([para([run("일시·장소·회신 기한을 먼저 물어봄", { size: 17, color: C.muted })], { spacing: { after: 100 } }), ...EX_TT.map((t) => exLine(t, C.ink))],
           { w: W - ew, valign: VerticalAlign.TOP, pt: 160, pb: 160, pl: 220, borders: { top: none, bottom: hair, left: none, right: none } }),
    ] }),
  ] });

const doc = new Document({
  creator: "Ttalkak", title: "딸깍 — 발표용 요약",
  styles: { default: { document: { run: { font: { name: FONT, eastAsia: FONT }, size: 20, color: C.ink } } } },
  numbering: { config: [{ reference: "bul", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 400, hanging: 260 } }, run: { color: C.teal } } }] }] },
  sections: [{ properties: { page: { size: { width: PAGE_W, height: 16838 }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
    children: [
      para([run("졸업 프로젝트 · 프롬프트 개선 서비스", { size: 20, color: C.muted })], { spacing: { before: 400, after: 160 } }),
      para([run("딸깍", { size: 84, bold: true, color: C.ink })], { spacing: { after: 120, line: 240 } }),
      para([run("대충 써도, 딸깍 한 번이면 제대로 된 결과", { size: 32, color: C.teal })],
           { spacing: { after: 400 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: C.teal, space: 20 } } }),
      sectionTitle("딸깍이 하는 일"),
      doCards,
      sectionTitle("숫자로 보는 딸깍"),
      metrics,
      new Paragraph({ children: [new PageBreak()] }),
      sectionTitle("같은 요청, 다른 결과 — \"팀 회식 공지 써줘\""),
      example,
      caption("결과물 일부. 그냥 요청한 쪽은 날짜·장소를 비워 두고, 딸깍은 사용자에게 물어본 정보로 바로 보낼 수 있는 공지를 만든다."),
      sectionTitle("평가 의견을 반영해 더 좋아졌다"),
      para("사람 평가에서 \"설명이 너무 길다\"는 의견이 나와, 결과물 밖의 해설과 체크리스트를 없애고 분량을 요청에 맞췄습니다."),
      img("chart_pr_update.png", 1280, 420),
      para([run("그냥 요청보다 못한 경우가 ", {}), run("74% → 31%", { bold: true, color: C.teal }), run("로 줄었습니다.", {})], { spacing: { before: 80 } }),
      sectionTitle("어떻게 확인했나"),
      bullet("같은 AI에 '그냥 요청'과 '딸깍 프롬프트'를 각각 넣고, 나온 결과물을 비교했습니다."),
      bullet("요청 48종을 여러 번 반복해 쟀습니다."),
      bullet("AI 판정기를 사람 평가와 대조해, 사람 판단에 더 가깝게 보정해서 썼습니다."),
      para([run("AI 판정 기준 · 요청 48종으로 측정", { size: 16, color: C.muted })], { spacing: { before: 400 } }),
    ] }],
});
Packer.toBuffer(doc).then((b) => { fs.writeFileSync(OUT, b); console.log(OUT); });
