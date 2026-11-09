// A short, honest summary of a User-Agent string for the sessions list ("Chrome on Windows"). Only well-known
// browsers and systems are named; anything else returns null so the caller can show "Unknown device".

export type DeviceSummary = { browser: string | null; os: string | null; mobile: boolean };

export function describeUserAgent(userAgent: string): DeviceSummary {
  const ua = userAgent ?? "";
  const mobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);

  let browser: string | null = null;
  if (/Edg(e|A|iOS)?\//.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
  else if (/SamsungBrowser\//.test(ua)) browser = "Samsung Internet";
  else if (/Firefox\/|FxiOS\//.test(ua)) browser = "Firefox";
  else if (/Chrome\/|CriOS\//.test(ua)) browser = "Chrome";
  else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = "Safari";
  else if (/^curl\//i.test(ua)) browser = "curl";

  let os: string | null = null;
  if (/Windows/.test(ua)) os = "Windows";
  else if (/Android/.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
  else if (/Mac OS X|Macintosh/.test(ua)) os = "macOS";
  else if (/CrOS/.test(ua)) os = "ChromeOS";
  else if (/Linux|X11/.test(ua)) os = "Linux";

  return { browser, os, mobile };
}
