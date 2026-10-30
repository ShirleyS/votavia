import type { TestCookieStore } from "./next-headers-mock";

/** Copy Set-Cookie pairs from a NextResponse into the in-process test jar. */
export function absorbSetCookies(response: Response, store: TestCookieStore) {
  const lines = typeof (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === "function"
    ? (response.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
    : (response.headers.get("set-cookie") ?? "").split(/,(?=[^;,]+=)/);
  for (const line of lines) {
    const first = line.split(";")[0];
    const index = first.indexOf("=");
    if (index <= 0) continue;
    const name = first.slice(0, index).trim();
    const value = first.slice(index + 1).trim();
    if (/max-age=0/i.test(line)) store.delete(name);
    else store.set(name, decodeURIComponent(value));
  }
}

export function locationOf(response: Response) {
  return response.headers.get("location") ?? "";
}
