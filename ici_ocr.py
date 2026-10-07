"""coaltradeindo.com 주간 ICI 가격표(이미지) OCR → JSON.
사용: py ici_ocr.py <image path>
출력: {"date": "YYYY-MM-DD"|null, "title": str, "rows": {"4200": 79.5, ...}}
"""
import json, re, sys
from PIL import Image
from rapidocr_onnxruntime import RapidOCR

MONTHS = {m: i for i, m in enumerate(
    ["january","february","march","april","may","june","july","august","september","october","november","december"], 1)}

def parse_date(text):
    m = re.search(r"(\d{1,2})[ -]([A-Za-z]+)[ -](20\d{2})", text)
    if not m: return None
    mon = MONTHS.get(m.group(2).lower().replace("0", "o"))
    if not mon: return None
    return f"{m.group(3)}-{mon:02d}-{int(m.group(1)):02d}"

def main(path):
    im = Image.open(path).convert("RGB")
    big = im.resize((im.width * 3, im.height * 3))
    tmp = path + ".ocr.png"; big.save(tmp)
    res, _ = RapidOCR()(tmp)
    items = []
    for box, txt, conf in res or []:
        x = sum(p[0] for p in box) / 4; y = sum(p[1] for p in box) / 4
        items.append((y, x, txt.strip()))
    rows = {}
    for y, x, txt in items:
        g = re.fullmatch(r"GAR\s*(\d{4})", txt, re.I)
        if not g: continue
        cands = []
        for y2, x2, t2 in items:
            if x2 <= x or abs(y2 - y) > 30: continue
            p = re.fullmatch(r"\$?\s*(\d{2,3})[.,]\s*(\d{2})", t2)
            if p: cands.append((x2 - x, float(p.group(1) + "." + p.group(2))))
        if cands:
            rows[g.group(1)] = min(cands)[1]
    title = next((t for _, _, t in sorted(items) if "coal price" in t.lower()), "")
    print(json.dumps({"date": parse_date(path.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]) or parse_date(title), "title": title, "rows": rows}))

if __name__ == "__main__":
    main(sys.argv[1])
