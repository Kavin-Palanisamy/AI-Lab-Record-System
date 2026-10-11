import unittest

from app.verification.contents_parser import OcrLine, parse_contents


def L(text, box, score=0.9):
    return OcrLine(text, score, box)


HEADER = [L("Page", (553, 5, 600, 40)), L("Marks", (640, 10, 700, 45))]


class RowAnchors(unittest.TestCase):
    def test_misread_date_does_not_lose_the_row(self):
        lines = HEADER + [
            L("D 21/7/26 v1 charactersis 05 SCR and TRIAC", (0, 100, 520, 150)),
            L("2) 281/7/26 V-I and transfer Charaneisnis 2 13", (0, 220, 515, 262)),
            L("Of MOSFETFIGBT", (120, 262, 300, 300)),
            L("3) 4/8/26 Stepup chopper", (0, 340, 300, 380)),
        ]
        res = parse_contents(lines, target_exp_no=2)
        self.assertEqual([r.serial for r in res.rows], [1, 2, 3])
        r2 = res.target_row
        self.assertIsNotNone(r2)
        self.assertIsNone(r2.date)
        self.assertIn("date_unreadable", r2.flags)
        self.assertIn("MOSFET", r2.title)
        self.assertNotIn("MOSFET", res.rows[0].title)
        self.assertNotIn("serial_gap_row_missed", res.flags)

    def test_missing_row_is_flagged(self):
        lines = HEADER + [
            L("1) 21/7/26 SCR", (0, 100, 300, 150)),
            L("3) 4/8/26 Chopper", (0, 340, 300, 380)),
        ]
        res = parse_contents(lines)
        self.assertEqual([r.serial for r in res.rows], [1, 3])
        self.assertIn("serial_gap_row_missed", res.flags)


if __name__ == "__main__":
    unittest.main()
