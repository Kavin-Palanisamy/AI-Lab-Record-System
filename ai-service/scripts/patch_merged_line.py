"""One-time patch for ai-service/app/verification/contents_parser.py
Fixes: a number at the end of a merged line was called 'page' even when the line
spans the marks/sign columns too. Now it only counts as page if the line's right
edge ends inside the page column; otherwise it is flagged ambiguous, not guessed."""
import sys

path = sys.argv[1]
src = open(path, encoding="utf-8").read()

def swap(old, new, count=1):
    global src
    assert src.count(old) == count, f"expected {count} match(es) for: {old[:60]!r}, found {src.count(old)}"
    src = src.replace(old, new)

swap('''def _split_trailing_page(text: str, ln: OcrLine, cols: Optional[_Columns]) -> Tuple[str, Optional[int]]:
    """A line whose box reaches into the page column and ends with a number:
    that number is probably the page (the detector merged title + page)."""
    if not cols or ln.box is None:
        return text, None
    if ln.box[2] <= cols.b1 + 0.4 * (cols.b2 - cols.b1):
        return text, None
    m = TRAILING_NUM_RE.search(text)
    if not m:
        return text, None
    return text[: m.start()].strip(), int(m.group(1))
''', '''def _split_trailing_page(
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
''')

swap('''        rest, merged_page = _split_trailing_page(ln.text[m.end():].strip(), ln, cols)
        if merged_page is not None:
            pages[k].append((merged_page, ln.score))
            row.flags.append("page_from_merged_line")
''', '''        rest, merged_page, ambiguous = _split_trailing_page(ln.text[m.end():].strip(), ln, cols)
        if merged_page is not None:
            pages[k].append((merged_page, ln.score))
            row.flags.append("page_from_merged_line")
        if ambiguous:
            row.flags.append("trailing_number_ambiguous")
''')

swap('''            text, merged_page = _split_trailing_page(ln.text.strip(), ln, cols)
            if merged_page is not None:
                pages[k].append((merged_page, ln.score))
                row.flags.append("page_from_merged_line")
''', '''            text, merged_page, ambiguous = _split_trailing_page(ln.text.strip(), ln, cols)
            if merged_page is not None:
                pages[k].append((merged_page, ln.score))
                row.flags.append("page_from_merged_line")
            if ambiguous:
                row.flags.append("trailing_number_ambiguous")
''')

open(path, "w", encoding="utf-8").write(src)
print("patched OK:", path)
