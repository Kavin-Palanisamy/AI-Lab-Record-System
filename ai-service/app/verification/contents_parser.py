"""
Contents-page parser (Phase 4).

Turns PaddleOCR line output (text + score + box) into structured rows:
serial, date, title, page_no, marks, signature presence.

Design rules
- Pure Python (no extra packages).
- NEVER invents values: anything unreadable stays None and gets a flag.
- Flags + low confidence are what push a submission to MANUAL_REVIEW later.
"""
from __future__ import annotations

import json
import re
import statistics
import sys
from dataclasses import asdict, dataclass, field
from datetime import date
from typing import Any, Dict, List, Optional, Sequence, Tuple

Box = Tuple[float, float, float, float]  # x1, y1, x2, y2

DATE_RE = re.compile(r"(?<!\d)(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4}|\d{2})(?!\d)")
SERIAL_PREFIX_RE = re.compile(r"^\W*(\d{1,2})\s*[)\]:.]\s*$")
NUM_ONLY_RE = re.compile(r"^[^\w]*(\d{1,3}(?:\.\d)?)[^\w]*$")
TRAILING_NUM_RE = re.compile(r"\s(\d{1,3})\W*$")
ROW_START_RE = re.compile(r"^\W{0,2}(\d{1,2})\s*\)")  # '2)' at the start of a line


@dataclass
class OcrLine:
    text: str
    score: float = 0.0
    box: Optional[Box] = None


@dataclass
class ContentsRow:
    serial: Optional[int] = None
    date: Optional[str] = None  # ISO yyyy-mm-dd
    title: str = ""
    page_no: Optional[int] = None
    marks: Optional[float] = None
    signature_present: Optional[bool] = None  # None = unknown (no geometry)
    confidence: float = 0.0
    flags: List[str] = field(default_factory=list)
    raw_lines: List[str] = field(default_factory=list)


@dataclass
class ContentsParseResult:
    rows: List[ContentsRow] = field(default_factory=list)
    header_found: bool = False
    geometry_used: bool = False
    flags: List[str] = field(default_factory=list)
    target_exp_no: Optional[int] = None
    target_row: Optional[ContentsRow] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class _Columns:
    b1: float  # name | page boundary
    b2: float  # page | marks boundary
    b3: float  # marks | sign boundary

    def zone(self, cx: float) -> str:
        if cx < self.b1:
            return "name"
        if cx < self.b2:
            return "page"
        if cx < self.b3:
            return "marks"
        return "sign"


def _cx(box: Box) -> float:
    return (box[0] + box[2]) / 2


def _cy(box: Box) -> float:
    return (box[1] + box[3]) / 2


def parse_date(match: "re.Match[str]") -> Optional[str]:
    d, m, y = int(match.group(1)), int(match.group(2)), int(match.group(3))
    if y < 100:
        y += 2000
    try:
        return date(y, m, d).isoformat()
    except ValueError:
        return None


def _find_columns(header_lines: Sequence[OcrLine]) -> Optional[_Columns]:
    page = marks = None
    for ln in header_lines:
        if ln.box is None:
            continue
        key = re.sub(r"[^a-z]", "", ln.text.lower())
        if key in ("page", "pageno") and page is None:
            page = ln
        elif key in ("mark", "marks") and marks is None:
            marks = ln
    if not (page and marks):
        return None
    pcx, mcx = _cx(page.box), _cx(marks.box)
    if mcx <= pcx:
        return None
    half = (mcx - pcx) / 2
    return _Columns(pcx - half, (pcx + mcx) / 2, mcx + half)


def _split_trailing_page(
    text: str, ln: OcrLine, cols: Optional[_Columns]
) -> Tuple[str, Optional[int], bool]:
    """Returns (text, page_candidate, ambiguous).
    A trailing number counts as the page ONLY if the line's right edge ends inside
    the page column. If the line also spans the marks/sign columns we cannot know
    which column the number sits in, so it is left in the text and flagged."""
    if not cols or ln.box is None:
        return text, None, False
    right = ln.box[2]
    width = cols.b2 - cols.b1
    if right <= cols.b1 + 0.4 * width:
        return text, None, False
    m = TRAILING_NUM_RE.search(text)
    if not m:
        return text, None, False
    if right > cols.b2 + 0.25 * width:
        return text, None, True
    return text[: m.start()].strip(), int(m.group(1)), False


def parse_contents(
    lines: Sequence[OcrLine],
    target_exp_no: Optional[int] = None,
    max_marks: float = 10.0,
) -> ContentsParseResult:
    res = ContentsParseResult(target_exp_no=target_exp_no)
    anchors = [
        i for i, ln in enumerate(lines) if DATE_RE.search(ln.text) or ROW_START_RE.match(ln.text)
    ]
    if not anchors:
        res.flags.append("no_date_rows_found")
        return res

    cols = _find_columns(lines[: anchors[0]])
    res.header_found = cols is not None
    res.geometry_used = bool(cols) and all(lines[i].box is not None for i in anchors)
    if not res.geometry_used:
        cols = None
        res.flags.append("no_geometry_page_marks_unreliable")

    anchor_y: List[float] = []
    tol = 0.0
    if res.geometry_used:
        anchor_y = [_cy(lines[i].box) for i in anchors]  # type: ignore[arg-type]
        if len(anchor_y) > 1:
            tol = 0.15 * statistics.median(b - a for a, b in zip(anchor_y, anchor_y[1:]))

    def row_of(idx: int, ln: OcrLine) -> Optional[int]:
        if res.geometry_used and ln.box is not None:
            cy = _cy(ln.box)
            found = None
            for k, ay in enumerate(anchor_y):
                if ay - tol <= cy:
                    found = k
            return found
        found = None
        for k, ai in enumerate(anchors):
            if ai <= idx:
                found = k
        return found

    n = len(anchors)
    rows = [ContentsRow() for _ in range(n)]
    pages: List[List[Tuple[int, float]]] = [[] for _ in range(n)]
    marks: List[List[Tuple[float, float]]] = [[] for _ in range(n)]
    scores: List[List[float]] = [[] for _ in range(n)]
    sig_seen = [False] * n

    for k, ai in enumerate(anchors):
        ln = lines[ai]
        m = DATE_RE.search(ln.text)
        row = rows[k]
        row.raw_lines.append(ln.text)
        if m:
            row.date = parse_date(m)
            if row.date is None:
                row.flags.append("date_invalid")
            prefix = ln.text[: m.start()]
            rest_text = ln.text[m.end():].strip()
        else:
            sm0 = ROW_START_RE.match(ln.text)
            row.flags.append("date_unreadable")
            prefix = ln.text[: sm0.end()] if sm0 else ""
            rest_text = ln.text[sm0.end():].strip() if sm0 else ln.text.strip()
        sm = SERIAL_PREFIX_RE.match(prefix)
        if sm:
            row.serial = int(sm.group(1))
        rest, merged_page, ambiguous = _split_trailing_page(rest_text, ln, cols)
        if merged_page is not None:
            pages[k].append((merged_page, ln.score))
            row.flags.append("page_from_merged_line")
        if ambiguous:
            row.flags.append("trailing_number_ambiguous")
        row.title = rest
        scores[k].append(ln.score)

    for i, ln in enumerate(lines):
        if i in anchors or i < anchors[0]:
            continue
        k = row_of(i, ln)
        if k is None:
            continue
        row = rows[k]
        row.raw_lines.append(ln.text)
        zone = cols.zone(_cx(ln.box)) if (cols and ln.box) else None
        num = NUM_ONLY_RE.match(ln.text.strip())

        if zone == "sign":
            sig_seen[k] = True
            continue
        if num and zone == "page":
            pages[k].append((int(float(num.group(1))), ln.score))
            scores[k].append(ln.score)
        elif num and zone == "marks":
            marks[k].append((float(num.group(1)), ln.score))
            scores[k].append(ln.score)
        elif num and zone is None:
            row.flags.append("numeric_unassigned:" + num.group(1))
        elif zone in ("page", "marks"):
            row.flags.append("noise_in_page_or_marks_zone")
        else:
            text, merged_page, ambiguous = _split_trailing_page(ln.text.strip(), ln, cols)
            if merged_page is not None:
                pages[k].append((merged_page, ln.score))
                row.flags.append("page_from_merged_line")
            if ambiguous:
                row.flags.append("trailing_number_ambiguous")
            row.title = (row.title + " " + text).strip()
            scores[k].append(ln.score)

    # finalise rows
    for k, row in enumerate(rows):
        distinct_pages = {p for p, _ in pages[k]}
        if len(distinct_pages) == 1:
            p = next(iter(distinct_pages))
            if 1 <= p <= 999:
                row.page_no = p
            else:
                row.flags.append("page_out_of_range")
        elif len(distinct_pages) > 1:
            row.flags.append("multiple_page_candidates")

        distinct_marks = {mk for mk, _ in marks[k]}
        if len(distinct_marks) == 1:
            mk = next(iter(distinct_marks))
            if 0 <= mk <= max_marks:
                row.marks = mk
            else:
                row.flags.append(f"marks_out_of_range:{mk:g}")
        elif len(distinct_marks) > 1:
            row.flags.append("multiple_marks_candidates")

        row.signature_present = sig_seen[k] if res.geometry_used else None
        base = statistics.mean(scores[k]) if scores[k] else 0.0
        row.confidence = round(max(0.0, min(1.0, base - 0.1 * len(row.flags))), 2)

    # serial numbers: use OCR value when present, otherwise infer (and flag it)
    for k in range(n):
        if rows[k].serial is None and k > 0 and rows[k - 1].serial is not None:
            rows[k].serial = rows[k - 1].serial + 1
            rows[k].flags.append("serial_inferred")
    for k in range(n - 2, -1, -1):
        if rows[k].serial is None and rows[k + 1].serial is not None:
            rows[k].serial = rows[k + 1].serial - 1
            rows[k].flags.append("serial_inferred")

    sers = [r.serial for r in rows]
    if any(a is not None and b is not None and b != a + 1 for a, b in zip(sers, sers[1:])):
        res.flags.append("serial_gap_row_missed")

    iso = [r.date for r in rows if r.date]
    if any(b < a for a, b in zip(iso, iso[1:])):
        res.flags.append("dates_not_increasing")

    res.rows = rows
    if target_exp_no is not None:
        hits = [r for r in rows if r.serial == target_exp_no]
        if len(hits) == 1:
            res.target_row = hits[0]
        elif not hits:
            res.flags.append("target_experiment_not_found")
        else:
            res.flags.append("target_experiment_duplicated")
    return res


def load_paddleocr_json(path: str) -> List[OcrLine]:
    """Read the *_res.json written by PaddleOCR (test_paddleocr.py)."""
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    texts = data.get("rec_texts", [])
    scores = data.get("rec_scores", [0.0] * len(texts))
    boxes = data.get("rec_boxes")
    out: List[OcrLine] = []
    for i, t in enumerate(texts):
        box: Optional[Box] = None
        if boxes is not None and i < len(boxes):
            b = boxes[i]
            box = (float(b[0]), float(b[1]), float(b[2]), float(b[3]))
        out.append(OcrLine(text=str(t), score=float(scores[i]), box=box))
    return out


if __name__ == "__main__":
    # python app\verification\contents_parser.py <paddleocr_res.json> [experiment_no]
    if len(sys.argv) < 2:
        print("usage: contents_parser.py <paddleocr_res.json> [experiment_no]")
        sys.exit(1)
    target = int(sys.argv[2]) if len(sys.argv) > 2 else None
    max_marks = float(sys.argv[3]) if len(sys.argv) > 3 else 10.0
    result = parse_contents(load_paddleocr_json(sys.argv[1]), target_exp_no=target, max_marks=max_marks)
    print(f"header_found={result.header_found} geometry_used={result.geometry_used} flags={result.flags}")
    for r in result.rows:
        print(
            f"exp={r.serial} date={r.date} page={r.page_no} marks={r.marks} "
            f"sig={r.signature_present} conf={r.confidence} flags={r.flags}\n    title={r.title!r}"
        )
    if target is not None:
        print("TARGET ROW:", result.target_row.serial if result.target_row else None)
