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
