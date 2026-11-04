// The report as a PDF (F19 round 2, D-043), made on the server with jsPDF: headline numbers,
// three charts (outreach per rep, people by stage, the funnel) and every table. Landscape A4 so
// the wide tables fit. The built-in Helvetica font only has Western characters, so text is
// cleaned first ("₹" becomes "INR", arrows become "->").
import { jsPDF } from "jspdf";
import { formatIst } from "@/lib/time";
import type { ReportSection } from "@/lib/report-shape";
import { NUMBER_SECTIONS, PIPELINE_COLUMNS, REPORT_COLUMNS, type ReportData } from "./reports";

const BLUE: [number, number, number] = [30, 58, 196];
const GREY: [number, number, number] = [91, 100, 112];
const INK: [number, number, number] = [20, 23, 26];
const SERIES: [number, number, number][] = [
  [30, 58, 196],
  [31, 122, 77],
  [214, 132, 23],
];
const PAGE_W = 297;
const PAGE_H = 210;
const M = 14;

/** Text the standard PDF fonts can show. */
export function pdfText(s: string): string {
  return s
    .replace(/₹/g, "INR ")
    .replace(/[→⟶]/g, "->")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7e\xa0-\xff\n]/g, "");
}

const pct = (n: number | null) => (n === null ? "-" : `${Math.round(n * 100)}%`);

class Doc {
  pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  y = M;

  ensure(h: number) {
    if (this.y + h > PAGE_H - M) {
      this.pdf.addPage();
      this.y = M;
    }
  }

  text(s: string, size = 10, color = INK, bold = false, x = M) {
    this.pdf.setFont("helvetica", bold ? "bold" : "normal");
    this.pdf.setFontSize(size);
    this.pdf.setTextColor(...color);
    const lines = this.pdf.splitTextToSize(pdfText(s), PAGE_W - M - x) as string[];
    const lh = size * 0.45;
    this.ensure(lines.length * lh + 1);
    this.pdf.text(lines, x, this.y + lh);
    this.y += lines.length * lh + 1.5;
  }

  heading(s: string) {
    this.y += 3;
    this.ensure(14);
    this.text(s, 13, BLUE, true);
    this.y += 1;
  }

  /** A simple table: the first column is wide, the rest share the space. Repeats its header. */
  table(headers: string[], rows: (string | number)[][], firstW = 46) {
    const n = headers.length - 1;
    const w = n > 0 ? (PAGE_W - 2 * M - firstW) / n : 0;
    const cols = [firstW, ...Array(n).fill(w)];
    const rowH = 6;
    const header = () => {
      this.pdf.setFillColor(238, 241, 255);
      this.pdf.rect(M, this.y, PAGE_W - 2 * M, rowH + 2, "F");
      this.pdf.setFont("helvetica", "bold");
      this.pdf.setFontSize(7);
      this.pdf.setTextColor(...INK);
      let x = M;
      headers.forEach((h, i) => {
        const lines = this.pdf.splitTextToSize(pdfText(h), cols[i] - 2) as string[];
        this.pdf.text(lines.slice(0, 2), i === 0 ? x + 1.5 : x + cols[i] - 1.5, this.y + 3.2, {
          align: i === 0 ? "left" : "right",
        });
        x += cols[i];
      });
      this.y += rowH + 2;
    };
    this.ensure(rowH * 3);
    header();
    rows.forEach((r, ri) => {
      if (this.y + rowH > PAGE_H - M) {
        this.pdf.addPage();
        this.y = M;
        header();
      }
      const last = ri === rows.length - 1 && String(r[0]) === "Total";
      this.pdf.setFont("helvetica", last ? "bold" : "normal");
      this.pdf.setFontSize(8);
      this.pdf.setTextColor(...INK);
      let x = M;
      r.forEach((c, i) => {
        const t = pdfText(String(c));
        this.pdf.text(
          i === 0 ? (this.pdf.splitTextToSize(t, cols[0] - 3) as string[])[0] : t,
          i === 0 ? x + 1.5 : x + cols[i] - 1.5,
          this.y + 4.2,
          { align: i === 0 ? "left" : "right" },
        );
        x += cols[i];
      });
      this.pdf.setDrawColor(232, 232, 232);
      this.pdf.line(M, this.y + rowH, PAGE_W - M, this.y + rowH);
      this.y += rowH;
    });
    this.y += 2;
  }

  /** Vertical grouped bars: one group per label, one bar per series. */
  groupedBars(title: string, labels: string[], series: { name: string; values: number[] }[]) {
    const h = 62;
    this.ensure(h + 14);
    this.text(title, 10, INK, true);
    const top = this.y + 2;
    const left = M + 8;
    const width = PAGE_W - 2 * M - 8;
    const max = Math.max(1, ...series.flatMap((s) => s.values));
    const plotH = h - 16;
    const base = top + plotH;
    this.pdf.setDrawColor(200, 200, 200);
    this.pdf.line(left, base, left + width, base);
    this.pdf.setFontSize(7);
    this.pdf.setTextColor(...GREY);
    this.pdf.text(String(max), M, top + 3);
    this.pdf.text("0", M + 3, base);
    const groupW = width / Math.max(1, labels.length);
    const barW = Math.min(12, (groupW * 0.7) / series.length);
    labels.forEach((label, gi) => {
      const gx = left + gi * groupW + (groupW - barW * series.length) / 2;
      series.forEach((s, si) => {
        const v = s.values[gi] ?? 0;
        const bh = (v / max) * plotH;
        this.pdf.setFillColor(...SERIES[si % SERIES.length]);
        this.pdf.rect(gx + si * barW, base - bh, barW - 0.8, bh, "F");
        if (v > 0) {
          this.pdf.setTextColor(...INK);
          this.pdf.text(String(v), gx + si * barW + barW / 2 - 0.4, base - bh - 1, {
            align: "center",
          });
        }
      });
      this.pdf.setTextColor(...GREY);
      const name = (this.pdf.splitTextToSize(pdfText(label), groupW - 2) as string[])[0];
      this.pdf.text(name, left + gi * groupW + groupW / 2, base + 4, { align: "center" });
    });
    // Legend.
    let lx = left;
    series.forEach((s, si) => {
      this.pdf.setFillColor(...SERIES[si % SERIES.length]);
      this.pdf.rect(lx, base + 7, 3, 3, "F");
      this.pdf.setTextColor(...INK);
      this.pdf.text(pdfText(s.name), lx + 4.5, base + 9.6);
      lx += 6 + this.pdf.getTextWidth(pdfText(s.name)) + 6;
    });
    this.y = base + 14;
  }

  /** Horizontal bars, one per row, with a label and a value. */
  hBars(title: string, rows: { label: string; value: number; text?: string }[]) {
    const rowH = 6.5;
    this.ensure(rows.length * rowH + 12);
    this.text(title, 10, INK, true);
    const labelW = 62;
    const width = PAGE_W - 2 * M - labelW - 24;
    const max = Math.max(1, ...rows.map((r) => r.value));
    rows.forEach((r) => {
      this.pdf.setFontSize(8);
      this.pdf.setTextColor(...INK);
      this.pdf.text(pdfText(r.label), M, this.y + 4);
      const bw = (r.value / max) * width;
      this.pdf.setFillColor(...BLUE);
      if (bw > 0) this.pdf.rect(M + labelW, this.y + 0.8, bw, rowH - 2.2, "F");
      this.pdf.setTextColor(...GREY);
      this.pdf.text(pdfText(r.text ?? String(r.value)), M + labelW + bw + 2, this.y + 4);
      this.y += rowH;
    });
    this.y += 3;
  }
}

/** The PDF for a saved report, as bytes. */
export function reportPdf(
  r: ReportData,
  aiSummary: string | null,
  hidden: readonly ReportSection[] = [],
): Buffer {
  const on = (k: ReportSection) => !hidden.includes(k);
  const d = new Doc();
  d.text("Lumor Sales Hub", 10, BLUE, true);
  d.text(r.title, 18, INK, true);
  d.text(
    `Period: ${r.from} to ${r.to} (IST) · Made ${formatIst(new Date(r.generatedAt))}`,
    9,
    GREY,
  );
  if (aiSummary && on("summary")) {
    d.y += 2;
    d.text(`Summary: ${aiSummary}`, 10);
  }

  const t = r.total;
  const p = r.pipeline;
  d.heading("Headline numbers");
  d.table(
    [
      "",
      "People added",
      "New outreach",
      "Replied",
      "Meetings booked",
      "Converted",
      "No response yet",
    ],
    [
      [
        "Total",
        p ? p.total.peopleAdded : "-",
        p ? p.total.newOutreach : "-",
        p ? p.total.replied : t.replies,
        t.meetingsBooked,
        t.conversions,
        p ? p.total.noResponse : "-",
      ],
    ],
  );

  const reps = r.people;
  d.groupedBars(
    p ? "New outreach, replies and meetings per rep" : "Requests, replies and meetings per rep",
    reps.map((x) => x.name),
    p
      ? [
          { name: "New outreach", values: p.people.map((x) => x.newOutreach) },
          { name: "Replied", values: p.people.map((x) => x.replied) },
          { name: "Meetings booked", values: reps.map((x) => x.meetingsBooked) },
        ]
      : [
          { name: "Connection requests", values: reps.map((x) => x.requests) },
          { name: "Replies", values: reps.map((x) => x.replies) },
          { name: "Meetings booked", values: reps.map((x) => x.meetingsBooked) },
        ],
  );

  if (p && on("pipeline")) {
    d.heading("Pipeline");
    d.table(
      ["Person", ...PIPELINE_COLUMNS.map((c) => c.label)],
      [...p.people, p.total].map((x) => [x.name, ...PIPELINE_COLUMNS.map((c) => x[c.key])]),
    );
    const stages = Object.entries(p.total.stages).sort((a, b) => b[1] - a[1]);
    if (stages.length > 0) {
      d.hBars(
        "Where their people stand now (by stage)",
        stages.map(([label, value]) => ({ label, value })),
      );
    }
  }

  for (const sec of NUMBER_SECTIONS) {
    if (!on(sec.key)) continue;
    d.heading(sec.title);
    const cols = sec.keys.map((k) => REPORT_COLUMNS.find((c) => c.key === k)!);
    d.table(
      ["Person", ...cols.map((c) => c.label)],
      [...r.people, r.total].map((x) => [
        x.name,
        ...cols.map((c) =>
          c.key === "dealValueInr" ? `INR ${x[c.key].toLocaleString("en-IN")}` : x[c.key],
        ),
      ]),
    );
  }

  if (on("funnel")) d.heading("Funnel");
  if (on("funnel"))
    d.hBars(
      "Conversion rates (benchmark in brackets)",
      r.funnel.conversions.map((c) => ({
        label: c.label,
        value: c.rate ?? 0,
        text: `${pct(c.rate)} (${pct(c.benchmark)}) · ${c.to} of ${c.from}`,
      })),
    );

  if (r.plans.length > 0 && on("plans")) {
    d.heading("Plan performance");
    d.table(
      ["Plan / step", "Enrolled or done", "Replied", "Reply rate"],
      r.plans.flatMap((pl) => [
        [pl.name, pl.enrolled, pl.replied, pct(pl.replyRate)],
        ...pl.steps.map((s) => [`   Step ${s.order}`, s.done, s.replies, pct(s.rate)]),
      ]),
      90,
    );
  }

  if (r.details && on("details")) {
    const det = r.details;
    const when = (iso: string) => formatIst(new Date(iso), "d MMM, h:mm aaa");
    d.heading("What happened");
    d.text(
      `${det.companies.length + det.more.companies} companies added · ${det.people.length + det.more.people} people added · ${det.actions.length + det.more.actions} contacts, replies and meetings`,
      9,
      GREY,
    );
    if (det.companies.length > 0) {
      d.text("Companies added", 10, INK, true);
      d.table(
        ["Company", "Added by", "When"],
        det.companies.map((c) => [c.name, c.by ?? "-", when(c.at)]),
        90,
      );
    }
    if (det.people.length > 0) {
      d.text("People added", 10, INK, true);
      d.table(
        ["Person", "Title", "Company", "Added by", "When"],
        det.people.map((x) => [x.name, x.title ?? "-", x.company ?? "-", x.by ?? "-", when(x.at)]),
        60,
      );
    }
    if (det.actions.length > 0) {
      d.text("Contacts, replies and meetings", 10, INK, true);
      for (const a of det.actions) {
        d.text(
          `${when(a.at)} · ${a.rep} · ${a.what} · ${a.person ?? "Someone"}${a.company ? ` (${a.company})` : ""}`,
          8.5,
          INK,
          true,
        );
        if (a.text) d.text(a.text, 8.5, GREY, false, M + 4);
      }
    }
    const more = det.more.companies + det.more.people + det.more.actions;
    if (more > 0)
      d.text(`${more} more rows aren't listed (the first ${500} of each list are).`, 8, GREY);
  }

  return Buffer.from(d.pdf.output("arraybuffer"));
}
