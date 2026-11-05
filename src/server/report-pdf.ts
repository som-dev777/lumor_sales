// The report as a PDF (F19 round 2, D-043), made on the server with jsPDF: headline numbers,
// the headline numbers and every included table (no charts since D-058). Landscape A4 so
// the wide tables fit. The built-in Helvetica font only has Western characters, so text is
// cleaned first ("₹" becomes "INR", arrows become "->").
import { jsPDF } from "jspdf";
import { formatIst } from "@/lib/time";
import type { ReportSection } from "@/lib/report-shape";
import {
  eventsTitle,
  headlines,
  NUMBER_SECTIONS,
  PIPELINE_COLUMNS,
  REPORT_COLUMNS,
  type ReportData,
} from "./reports";

const BLUE: [number, number, number] = [30, 58, 196];
const GREY: [number, number, number] = [91, 100, 112];
const INK: [number, number, number] = [20, 23, 26];
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
}

/** The PDF for a saved report, as bytes: what the maker included, with edited numbers. */
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

  const p = r.pipeline;
  if (p && on("pipeline")) {
    d.heading("Pipeline");
    const h = headlines(r);
    d.table(
      ["", ...h.map((x) => x.label)],
      [["Total", ...h.map((x) => (x.value === null ? "-" : x.value))]],
    );
    d.table(
      ["Person", ...PIPELINE_COLUMNS.map((c) => c.label)],
      [...p.people, p.total].map((x) => [x.name, ...PIPELINE_COLUMNS.map((c) => x[c.key] ?? "-")]),
    );
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

  if (r.events && on("details")) {
    const e = r.events;
    d.heading(eventsTitle(r));
    d.table(
      ["", "Companies added", "People added", "Contacts", "Replies", "Meetings and demos"],
      [
        [
          "Total",
          e.counts.companies,
          e.counts.people,
          e.counts.contacts,
          e.counts.replies,
          e.counts.meetings,
        ],
      ],
    );
    for (const c of e.companies) {
      d.y += 1;
      d.text(`${c.name}${c.isNew ? "  [NEW]" : ""}`, 11, INK, true);
      if (c.people.length === 0) d.text("No people added yet.", 8.5, GREY, false, M + 4);
      for (const x of c.people) {
        d.text(
          `${x.name}${x.title ? `, ${x.title}` : ""}${x.isNew ? "  [NEW]" : ""}`,
          9.5,
          INK,
          true,
          M + 4,
        );
        d.text(x.facts.join(" · "), 8.5, GREY, false, M + 8);
        if (x.summary) {
          const s = x.summary;
          if (s.offered) d.text(`Offered: ${s.offered}`, 8.5, INK, false, M + 8);
          if (s.theySaid) d.text(`They said: ${s.theySaid}`, 8.5, INK, false, M + 8);
          if (s.outlook) d.text(`Outlook: ${s.outlook}`, 8.5, INK, false, M + 8);
          if (s.nextStep) d.text(`Next step: ${s.nextStep}`, 8.5, INK, false, M + 8);
        }
      }
    }
    if (e.more > 0) d.text(`${e.more} more people aren't listed.`, 8, GREY);
  } else if (r.details && on("details")) {
    const det = r.details;
    const when = (iso: string) => formatIst(new Date(iso), "d MMM, h:mm aaa");
    d.heading("What happened");
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

  return Buffer.from(d.pdf.output("arraybuffer"));
}
