"""
文字の対応表（ToUnicode）がないフォントで作られた PDF に、対応表を補って .cache/moj/repaired/ に保存する。
該当する PDF（予備試験 H25・H26・R7 の短答式問題集など）は、そのままでは文字化けしたテキストしか取り出せない。

対応表は、同じフォントを対応表つきで埋め込んでいる他の法務省 PDF から作る。
  1. 対応表つきの TrueType フォントで、字形（アウトライン）→ 文字 の表を作る
  2. 対応表のない TrueType フォントは、字形が一致する文字を当てる
  3. ＭＳ明朝・ＭＳゴシックは字形番号（GID）が共通なので、GID → 文字 の表も作り、
     CFF に変換されて埋め込まれたもの（字形番号 = CID）にも当てる
当てられなかった字形はそのまま残る（取り込み側で文字化けとして除外される）。

  python3 scripts/moj/repair-fonts.py [--rebuild] [001443616.pdf ...]   # 必要: pip install pypdf fontTools
"""
import glob
import hashlib
import io
import json
import logging
import os
import re
import sys

from fontTools.ttLib import TTFont
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ContentStream, NameObject, StreamObject

logging.disable(logging.CRITICAL)
EMPTY = "empty"  # 輪郭のない字形（空白）
ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
PDF_DIR = os.path.join(ROOT, ".cache", "moj", "pdf")
OUT_DIR = os.path.join(ROOT, ".cache", "moj", "repaired")
# ＭＳ明朝・ＭＳゴシック（Shift_JIS の名前が Latin-1 として読まれたもの「‚l‚r」を含む）
MS_FONT = re.compile(r"MS-?(Mincho|Gothic)|‚l‚r(–¾’©|ƒSƒVƒbƒN)")


def parse_tounicode(data):
    m = {}
    s = data.decode("latin-1")
    for block in re.findall(r"beginbfchar(.*?)endbfchar", s, re.S):
        for a, b in re.findall(r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>", block):
            m[int(a, 16)] = bytes.fromhex(b).decode("utf-16-be", "ignore")
    for block in re.findall(r"beginbfrange(.*?)endbfrange", s, re.S):
        for a, b, c in re.findall(r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>", block):
            lo, hi, base = int(a, 16), int(b, 16), int.from_bytes(bytes.fromhex(c), "big")
            for i in range(hi - lo + 1):
                if base + i < 0x110000:
                    m[lo + i] = chr(base + i)
    return m


def glyph_hashes(data):
    """GID → 字形のハッシュ"""
    tt = TTFont(io.BytesIO(data), lazy=True)
    glyf = tt["glyf"]
    out = {}
    for gid, name in enumerate(tt.getGlyphOrder()):
        try:
            g = glyf[name]
            if g.numberOfContours == 0:
                out[gid] = EMPTY
                continue
            coords, ends, _ = g.getCoordinates(glyf)
            out[gid] = hashlib.md5(repr((list(coords), list(ends))).encode()).hexdigest()
        except Exception:
            pass
    return out


def type0_fonts(reader):
    """(フォント辞書, 名前, TrueType のデータ or None, Identity で CID=GID か) を返す"""
    seen = set()
    for page in reader.pages:
        res = page.get("/Resources")
        fonts = res.get_object().get("/Font") if res else None
        if not fonts:
            continue
        for ref in fonts.get_object().values():
            f = ref.get_object()
            if id(f) in seen or f.get("/Subtype") != "/Type0" or f.get("/Encoding") != "/Identity-H":
                continue
            seen.add(id(f))
            d = f["/DescendantFonts"][0].get_object()
            fd = d.get("/FontDescriptor")
            fd = fd.get_object() if fd else {}
            c2g = d.get("/CIDToGIDMap")
            identity = c2g is None or str(c2g) == "/Identity"
            ff2 = fd.get("/FontFile2")
            yield f, str(f.get("/BaseFont")), ff2.get_object().get_data() if ff2 is not None else None, identity


def tounicode_cmap(mapping):
    lines = [
        "/CIDInit /ProcSet findresource begin", "12 dict begin", "begincmap",
        "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
        "/CMapName /Adobe-Identity-UCS def", "/CMapType 2 def",
        "1 begincodespacerange", "<0000> <FFFF>", "endcodespacerange",
    ]
    items = sorted(mapping.items())
    for i in range(0, len(items), 100):
        chunk = items[i:i + 100]
        lines.append(f"{len(chunk)} beginbfchar")
        for code, ch in chunk:
            lines.append(f"<{code:04X}> <{ch.encode('utf-16-be').hex().upper()}>")
        lines.append("endbfchar")
    lines += ["endcmap", "CMapName currentdict /CMap defineresource pop", "end", "end"]
    return "\n".join(lines).encode()


def build_tables(paths):
    """他の PDF から 字形のハッシュ → 文字、ＭＳ明朝・ゴシックの GID → 文字 の表を作る"""
    by_hash = {}
    votes = {}  # GID → {文字: 票}。フォントの版によって GID がずれることがあるので多数決にする
    broken = []  # 対応表のないフォントがある PDF

    def vote(gid, ch, n=1):
        votes.setdefault(gid, {})
        votes[gid][ch] = votes[gid].get(ch, 0) + n

    for p in paths:
        try:
            reader = PdfReader(p)
            missing = False
            for f, name, data, identity in type0_fonts(reader):
                if "/ToUnicode" not in f:
                    missing = True
                    continue
                if not identity:
                    continue
                tu = parse_tounicode(f["/ToUnicode"].get_object().get_data())
                if data:
                    for gid, h in glyph_hashes(data).items():
                        if h != EMPTY and tu.get(gid, "").strip():
                            by_hash.setdefault(h, tu[gid])
                if MS_FONT.search(name):
                    for gid, ch in tu.items():
                        if len(ch) == 1:
                            vote(gid, ch)
            if missing:
                broken.append(p)
        except Exception as e:
            print(f"読み込めない: {p}: {e}", file=sys.stderr)

    # 対応表のない TrueType のＭＳフォントは字形で文字が確定するので、その GID は重く数える
    for p in broken:
        for f, name, data, identity in type0_fonts(PdfReader(p)):
            if "/ToUnicode" in f or not data or not identity or not MS_FONT.search(name):
                continue
            for gid, h in glyph_hashes(data).items():
                if h != EMPTY and h in by_hash:
                    vote(gid, by_hash[h], 100)
    ms_gid = {gid: max(c.items(), key=lambda kv: kv[1])[0] for gid, c in votes.items()}
    return by_hash, ms_gid, broken


def main():
    paths = sorted(glob.glob(os.path.join(PDF_DIR, "*.pdf")))
    # 表づくりは全 PDF を読むので数分かかる。PDF の顔ぶれが同じなら前回の表を使う
    cache = os.path.join(ROOT, ".cache", "moj", "glyph-tables.json")
    names = [os.path.basename(p) for p in paths]
    tables = None
    if os.path.exists(cache) and "--rebuild" not in sys.argv:
        with open(cache) as fh:
            tables = json.load(fh)
        if tables.get("pdfs") != names:
            tables = None
    if tables is None:
        by_hash, ms_gid, broken = build_tables(paths)
        tables = {"pdfs": names, "by_hash": by_hash, "ms_gid": ms_gid, "broken": [os.path.basename(p) for p in broken]}
        with open(cache, "w") as fh:
            json.dump(tables, fh, ensure_ascii=False)
    by_hash = tables["by_hash"]
    ms_gid = {int(k): v for k, v in tables["ms_gid"].items()}
    only = [a for a in sys.argv[1:] if not a.startswith("--")]
    broken = [os.path.join(PDF_DIR, n) for n in tables["broken"] if not only or n in only]

    os.makedirs(OUT_DIR, exist_ok=True)
    for p in broken:
        report = []
        writer = PdfWriter(clone_from=p)
        clipped = sum(strip_clipped_text(page, writer) for page in writer.pages)
        if clipped:
            report.append(f"切り抜きの外にある文字の描画 {clipped} 件を削除")
        for f, name, data, identity in type0_fonts(writer):
            if "/ToUnicode" in f:
                continue
            mapping = {}
            if data and identity:
                for gid, h in glyph_hashes(data).items():
                    if h == EMPTY:
                        mapping[gid] = ms_gid.get(gid, " ") if MS_FONT.search(name) else " "
                    elif h in by_hash:
                        mapping[gid] = by_hash[h]
            if MS_FONT.search(name) and identity:
                for gid, ch in ms_gid.items():
                    mapping.setdefault(gid, ch)
            if not mapping:
                report.append(f"{name}: 対応表を作れない")
                continue
            stream = StreamObject()
            stream.set_data(tounicode_cmap(mapping))
            f[NameObject("/ToUnicode")] = writer._add_object(stream)
            report.append(f"{name}: {len(mapping)}字")
        out = os.path.join(OUT_DIR, os.path.basename(p))
        with open(out, "wb") as fh:
            writer.write(fh)
        dropped = drop_implausible(out)
        print(os.path.basename(p), "／".join(report), f"（読めない対応になったフォント {dropped} 件は外した）" if dropped else "")


def mul(a, b):
    """PDF の変換行列 [a b c d e f] の積 a×b"""
    return [
        a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
        a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
        a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
    ]


def strip_clipped_text(page, writer):
    """
    矩形の切り抜き（re W n）の外に描かれる文字を消す。画面にも印刷にも出ないが、テキスト抽出では拾われてしまう
    （InDesign で別の冊子のページを切り抜いて重ねた PDF で、一般教養科目の文章が隠れて入っている）。
    判定は文字列の描き始めの位置だけで行う簡易なもの。
    """
    contents = page.get_contents()
    if contents is None:
        return 0
    cs = ContentStream(contents, writer)
    ctm, clip, stack = [1, 0, 0, 1, 0, 0], None, []
    rect, tm, tlm, leading = None, None, None, 0
    kept, removed = [], 0
    pending_clip = False
    for operands, op in cs.operations:
        o = op.decode("latin-1") if isinstance(op, bytes) else op
        nums = [float(x) for x in operands] if o in ("cm", "re", "Tm", "Td", "TD", "TL") else None
        if o == "q":
            stack.append((ctm, clip))
        elif o == "Q":
            ctm, clip = stack.pop() if stack else (ctm, clip)
        elif o == "cm":
            ctm = mul(nums, ctm)
        elif o == "re":
            x, y, w, h = nums
            pts = [(px * ctm[0] + py * ctm[2] + ctm[4], px * ctm[1] + py * ctm[3] + ctm[5]) for px, py in ((x, y), (x + w, y + h))]
            rect = (min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts))
        elif o in ("W", "W*"):
            pending_clip = True
        elif o in ("n", "f", "F", "f*", "S", "s", "B", "B*", "b", "b*"):
            if pending_clip and rect:
                clip = rect if clip is None else (max(clip[0], rect[0]), max(clip[1], rect[1]), min(clip[2], rect[2]), min(clip[3], rect[3]))
            pending_clip, rect = False, None
        elif o == "BT":
            tm = tlm = [1, 0, 0, 1, 0, 0]
        elif o == "Tm":
            tm = tlm = nums
        elif o in ("Td", "TD"):
            if o == "TD":
                leading = -nums[1]
            tm = tlm = mul([1, 0, 0, 1, nums[0], nums[1]], tlm)
        elif o == "TL":
            leading = nums[0]
        elif o in ("T*", "'", '"'):
            tm = tlm = mul([1, 0, 0, 1, 0, -leading], tlm)
        if o in ("Tj", "TJ", "'", '"') and clip is not None and tm is not None:
            m = mul(tm, ctm)
            x, y = m[4], m[5]
            if not (clip[0] - 2 <= x <= clip[2] + 2 and clip[1] - 2 <= y <= clip[3] + 2):
                removed += 1
                continue
        kept.append((operands, op))
    if removed:
        cs.operations = kept
        page.replace_contents(cs)
    return removed


def font_key(font):
    """フォントを読み直しても変わらない識別子（埋め込まれたフォント本体のハッシュ）"""
    d = font["/DescendantFonts"][0].get_object()
    fd = d.get("/FontDescriptor")
    fd = fd.get_object() if fd else {}
    for k in ("/FontFile2", "/FontFile3"):
        if k in fd:
            return hashlib.md5(fd[k].get_object().get_data()).hexdigest()
    return None


def drop_implausible(path):
    """
    当てた文字で日本語の文として読めないフォントからは対応表を外す。
    字形番号の並びが違うフォント（例: 冊子に隠れて重ねられた別の冊子の文章）は、
    「の」「は」の代わりに「ワ」「レ」のような文字が並ぶので、その数で判定する。
    外したフォントの文字は文字化けのまま残り、取り込み側で読み飛ばされる。
    """
    reader = PdfReader(path)
    stats = {}
    for page in reader.pages:
        def visit(text, cm, tm, font, size):
            if font is None or font.get("/Subtype") != "/Type0":
                return
            key = font_key(font)
            good, bad = stats.get(key, (0, 0))
            stats[key] = (good + sum(text.count(c) for c in "のはをにがて"), bad + sum(text.count(c) for c in "ワレムョノ"))
        try:
            page.extract_text(visitor_text=visit)
        except Exception:
            pass
    bad_keys = {key for key, (good, bad) in stats.items() if key and bad >= 10 and bad > good}
    if not bad_keys:
        return 0
    writer = PdfWriter(clone_from=path)
    dropped = 0
    for f, *_ in type0_fonts(writer):
        if "/ToUnicode" in f and font_key(f) in bad_keys:
            del f["/ToUnicode"]
            dropped += 1
    with open(path, "wb") as fh:
        writer.write(fh)
    return dropped


if __name__ == "__main__":
    main()
