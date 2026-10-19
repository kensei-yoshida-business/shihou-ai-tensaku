import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

/**
 * 法務省サイトへの取得はすべてここを通す。
 * - User-Agent のないリクエストは CloudFront に 403 で拒否されるため、ブラウザ相当の UA を付ける
 * - 1リクエストごとに間隔を空け、取得済みのものは .cache/moj に保存して再取得しない
 */
export const MOJ_ORIGIN = "https://www.moj.go.jp";
export const CACHE_DIR = join(__dirname, "..", "..", ".cache", "moj");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const INTERVAL_MS = 500;

let last = 0;
async function politeFetch(url: string): Promise<Response> {
  const wait = last + INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  for (let attempt = 1; ; attempt++) {
    last = Date.now();
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, "accept-language": "ja" } });
      if (res.status >= 500 && attempt < 4) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
    }
  }
}

function cachePath(kind: "html" | "pdf", url: string) {
  const name = kind === "pdf" ? url.split("/").pop()! : createHash("md5").update(url).digest("hex") + ".html";
  return join(CACHE_DIR, kind, name);
}

/** HTML を取得する。404 などは null */
export async function getHtml(url: string, { refresh = false } = {}): Promise<string | null> {
  const p = cachePath("html", url);
  if (!refresh && existsSync(p)) return readFileSync(p, "utf8");
  const res = await politeFetch(url);
  if (!res.ok) return null;
  const text = await res.text();
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
  return text;
}

/** PDF を取得してキャッシュのパスを返す */
export async function getPdf(url: string): Promise<string> {
  const p = cachePath("pdf", url);
  if (existsSync(p)) return p;
  const res = await politeFetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.subarray(0, 5).toString() !== "%PDF-") throw new Error(`${url}: PDF ではない応答`);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, buf);
  return p;
}
