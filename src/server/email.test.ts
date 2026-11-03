import { afterEach, describe, expect, it, vi } from "vitest";
import { emailConfigured, emails, sendEmail } from "./email";

afterEach(() => vi.unstubAllEnvs());

describe("email through Resend (D-023)", () => {
  it("does nothing until both the key and the sender are set", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "Hub <hub@lumor.tech>");
    const fetcher = vi.fn();
    expect(emailConfigured()).toBe(false);
    expect(await sendEmail(emails.invite("a@b.com", "http://x/register/t"), fetcher)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends the link to the person, and reports a failure instead of throwing", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("EMAIL_FROM", "Hub <hub@lumor.tech>");
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    expect(
      await sendEmail(emails.reset("asha@lumor.tech", "http://x/reset?token=t"), fetcher),
    ).toBe(true);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test_key");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ from: "Hub <hub@lumor.tech>", to: ["asha@lumor.tech"] });
    expect(body.text).toContain("http://x/reset?token=t");

    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      await sendEmail(emails.verify("a@b.com", "l"), vi.fn().mockRejectedValue(new Error("down"))),
    ).toBe(false);
    quiet.mockRestore();
  });
});

describe("email through a Gmail account (D-046)", () => {
  const gmailOn = () => {
    vi.stubEnv("GMAIL_USER", "lumor.sales.hub@gmail.com");
    vi.stubEnv("GMAIL_APP_PASSWORD", "abcd efgh ijkl mnop");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
  };

  it("is used when both Gmail settings are set, instead of Resend", async () => {
    gmailOn();
    expect(emailConfigured()).toBe(true);
    const sent: Record<string, unknown>[] = [];
    const transport = { sendMail: async (m: Record<string, unknown>) => sent.push(m) };
    const fetcher = vi.fn();
    const ok = await sendEmail(
      {
        to: ["a@acme.example", "b@acme.example"],
        cc: ["boss@lumor.tech"],
        replyTo: "somnath@lumor.tech",
        subject: "Hello",
        text: "Hi",
        html: "<p>Hi</p>",
        attachments: [
          { filename: "invite.ics", content: "BEGIN:VCALENDAR", contentType: "text/calendar" },
        ],
      },
      fetcher,
      transport,
    );
    expect(ok).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
    expect(sent[0]).toMatchObject({
      from: "Lumor <lumor.sales.hub@gmail.com>",
      to: ["a@acme.example", "b@acme.example"],
      cc: ["boss@lumor.tech"],
      replyTo: "somnath@lumor.tech",
      subject: "Hello",
    });
  });

  it("keeps EMAIL_FROM only when it's the Gmail address; reports a failure instead of throwing", async () => {
    gmailOn();
    vi.stubEnv("EMAIL_FROM", "Somnath at Lumor <lumor.sales.hub@gmail.com>");
    const sent: Record<string, unknown>[] = [];
    await sendEmail({ to: "x@y.example", subject: "s", text: "t" }, fetch, {
      sendMail: async (m) => sent.push(m),
    });
    expect(sent[0].from).toBe("Somnath at Lumor <lumor.sales.hub@gmail.com>");
    vi.stubEnv("EMAIL_FROM", "Hub <hub@lumor.tech>");
    await sendEmail({ to: "x@y.example", subject: "s", text: "t" }, fetch, {
      sendMail: async (m) => sent.push(m),
    });
    expect(sent[1].from).toBe("Lumor <lumor.sales.hub@gmail.com>");
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = await sendEmail({ to: "x@y.example", subject: "s", text: "t" }, fetch, {
      sendMail: async () => {
        throw new Error("Invalid login");
      },
    });
    expect(failed).toBe(false);
    quiet.mockRestore();
  });
});
