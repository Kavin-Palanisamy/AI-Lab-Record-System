"""Patch 2 for ai-service/app/verification/contents_parser.py
1) A row can start with a serial like '2)' even when its date is misread
   (e.g. '281/7/26'). Previously such a row was lost and its lines were glued
   onto the row above. Now the row is kept, date=None, flag 'date_unreadable'.
2) Flags 'serial_gap_row_missed' when serials are not consecutive (a row was lost).
3) Command line: optional 3rd argument = maximum marks (default 10)."""
import sys

path = sys.argv[1]
src = open(path, encoding="utf-8").read()


def swap(old, new):
    global src
    assert src.count(old) == 1, f"expected exactly 1 match for: {old[:70]!r}, found {src.count(old)}"
    src = src.replace(old, new)


swap('''TRAILING_NUM_RE = re.compile(r"\\s(\\d{1,3})\\W*$")
''', '''TRAILING_NUM_RE = re.compile(r"\\s(\\d{1,3})\\W*$")
ROW_START_RE = re.compile(r"^\\W{0,2}(\\d{1,2})\\s*\\)")  # '2)' at the start of a line
''')

swap('''    anchors = [i for i, ln in enumerate(lines) if DATE_RE.search(ln.text)]
    if not anchors:
        res.flags.append("no_date_rows_found")''', '''    anchors = [
        i for i, ln in enumerate(lines) if DATE_RE.search(ln.text) or ROW_START_RE.match(ln.text)
    ]
    if not anchors:
        res.flags.append("no_date_rows_found")''')

swap('''        m = DATE_RE.search(ln.text)
        assert m is not None
        row = rows[k]
        row.raw_lines.append(ln.text)
        row.date = parse_date(m)
        if row.date is None:
            row.flags.append("date_invalid")
        sm = SERIAL_PREFIX_RE.match(ln.text[: m.start()])
        if sm:
            row.serial = int(sm.group(1))
        rest, merged_page, ambiguous = _split_trailing_page(ln.text[m.end():].strip(), ln, cols)''', '''        m = DATE_RE.search(ln.text)
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
        rest, merged_page, ambiguous = _split_trailing_page(rest_text, ln, cols)''')

swap('''    iso = [r.date for r in rows if r.date]''', '''    sers = [r.serial for r in rows]
    if any(a is not None and b is not None and b != a + 1 for a, b in zip(sers, sers[1:])):
        res.flags.append("serial_gap_row_missed")

    iso = [r.date for r in rows if r.date]''')

swap('''    target = int(sys.argv[2]) if len(sys.argv) > 2 else None
    result = parse_contents(load_paddleocr_json(sys.argv[1]), target_exp_no=target)''', '''    target = int(sys.argv[2]) if len(sys.argv) > 2 else None
    max_marks = float(sys.argv[3]) if len(sys.argv) > 3 else 10.0
    result = parse_contents(load_paddleocr_json(sys.argv[1]), target_exp_no=target, max_marks=max_marks)''')

open(path, "w", encoding="utf-8").write(src)
print("patched OK:", path)
