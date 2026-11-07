import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { sendViaZeptoMail, EMAIL_FROM } from "@/lib/email";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ZEPTOMAIL_API_HOST;
});

describe("sendViaZeptoMail", () => {
  it("posts the email to ZeptoMail with the token header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const ok = await sendViaZeptoMail("Zoho-enczapikey tok123", ["a@x.com", "b@y.com"], "Hi", "Body");

    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.zeptomail.com/v1.1/email");
    expect(init.headers.Authorization).toBe("Zoho-enczapikey tok123");
    const body = JSON.parse(init.body);
    expect(body.to).toEqual([
      { email_address: { address: "a@x.com" } },
      { email_address: { address: "b@y.com" } },
    ]);
    expect(body.subject).toBe("Hi");
    expect(body.textbody).toBe("Body");
    expect(body.from.address).toBe(EMAIL_FROM.match(/<([^>]+)>/)?.[1] ?? EMAIL_FROM);
  });

  it("returns false when ZeptoMail rejects the request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad token", { status: 401 })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendViaZeptoMail("bad", ["a@x.com"], "s", "t")).toBe(false);
  });

  it("refuses a non-ZeptoMail API host", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.ZEPTOMAIL_API_HOST = "evil.example.com";
    expect(await sendViaZeptoMail("t", ["a@x.com"], "s", "t")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
