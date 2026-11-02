// Booking emails (F22 round 2, F25, D-042): one simple layout, as HTML and plain text.
// Email apps ignore style sheets, so this HTML uses inline styles (the app's own pages don't).

export type MailContent = {
  heading: string;
  intro: string;
  rows: [label: string, value: string][];
  button?: { label: string; url: string };
  /** Extra links under the button. */
  links?: { label: string; url: string }[];
  foot?: string;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const linkify = (s: string) =>
  esc(s).replace(
    /(https?:\/\/[^\s<]+)/g,
    (u) => `<a href="${u}" style="color:#1f7a4d;word-break:break-all">${u}</a>`,
  );

export function renderMail(m: MailContent): { text: string; html: string } {
  const text = [
    m.heading,
    "",
    m.intro,
    "",
    ...m.rows.map(([k, v]) => `${k}: ${v}`),
    ...(m.button ? ["", `${m.button.label}: ${m.button.url}`] : []),
    ...(m.links ?? []).map((l) => `${l.label}: ${l.url}`),
    ...(m.foot ? ["", m.foot] : []),
    "",
    "— Lumor",
  ].join("\n");

  const rows = m.rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#5b6470;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;color:#14171a">${linkify(v)}</td></tr>`,
    )
    .join("");
  const button = m.button
    ? `<p style="margin:24px 0 8px"><a href="${esc(m.button.url)}" style="display:inline-block;background:#1f7a4d;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${esc(m.button.label)}</a></p>`
    : "";
  const links = (m.links ?? [])
    .map(
      (l) =>
        `<p style="margin:8px 0"><a href="${esc(l.url)}" style="color:#1f7a4d">${esc(l.label)}</a></p>`,
    )
    .join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:28px">
<tr><td>
<p style="margin:0 0 16px;font-weight:700;color:#1f7a4d;font-size:15px">Lumor</p>
<h1 style="margin:0 0 12px;font-size:20px;color:#14171a">${esc(m.heading)}</h1>
<p style="margin:0 0 16px;color:#14171a;line-height:1.5">${linkify(m.intro)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.4">${rows}</table>
${button}${links}
${m.foot ? `<p style="margin:24px 0 0;color:#5b6470;font-size:13px;line-height:1.5">${linkify(m.foot)}</p>` : ""}
</td></tr></table>
</td></tr></table></body></html>`;
  return { text, html };
}
