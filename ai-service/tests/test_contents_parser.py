import unittest

from app.verification.contents_parser import OcrLine, parse_contents

# Real PaddleOCR output from the notebook contents page (no boxes available here).
REAL_TEXTS = ['Page', 'Marks', 'Sign with', 'S. No', 'Date', 'Name of the Experiment', 'No.', 'Date',
 'D 21/7/26 v1charactersis o5 so1713 ', 'and TRIAC', '2)28/7/26 v-I and transfer Charaunisnic 13',
 'Of HOSFET4IGBT', '65', '3) 4/8/26 Stepup chopper', '18', 'stepdown chopper',
 '4) 11/8/26 single Phase halt and 41', '69', 'gay', 'fully conorolled rectitier',
 '18/8/26 simulation or single Phax 91,9513', 'half+ fully controllbed', 'Corwerter']
REAL_SCORES = [1.0, 1.0, 1.0, 0.92, 1.0, 0.98, 1.0, 1.0, 0.84, 0.99, 0.87, 0.85, 1.0, 0.97, 0.71,
 1.0, 0.91, 1.0, 0.57, 0.87, 0.84, 0.92, 0.84]


def L(text, box=None, score=0.95):
    return OcrLine(text=text, score=score, box=box)


class RealTextNoGeometry(unittest.TestCase):
    def setUp(self):
        lines = [OcrLine(t, s) for t, s in zip(REAL_TEXTS, REAL_SCORES)]
        self.res = parse_contents(lines, target_exp_no=3)

    def test_five_rows_with_correct_dates(self):
        self.assertEqual(
            [r.date for r in self.res.rows],
            ["2026-07-21", "2026-07-28", "2026-08-04", "2026-08-11", "2026-08-18"],
        )

    def test_serials(self):
        self.assertEqual([r.serial for r in self.res.rows], [1, 2, 3, 4, 5])
        self.assertIn("serial_inferred", self.res.rows[0].flags)

    def test_never_guesses_page_or_marks_without_geometry(self):
        self.assertIn("no_geometry_page_marks_unreliable", self.res.flags)
        for r in self.res.rows:
            self.assertIsNone(r.page_no)
            self.assertIsNone(r.marks)

    def test_target_row(self):
        self.assertIsNotNone(self.res.target_row)
        self.assertIn("Stepup", self.res.target_row.title)

    def test_dates_increasing(self):
        self.assertNotIn("dates_not_increasing", self.res.flags)


class SyntheticGeometry(unittest.TestCase):
    def build(self):
        return [
            L("Page", (575, 40, 620, 62)), L("Marks", (650, 40, 700, 62)),
            L("Sign with", (730, 40, 810, 62)), L("Date", (80, 40, 170, 62)),
            L("1) 21/7/26 V-I of SCR", (0, 150, 400, 180)),
            L("13", (580, 150, 610, 180)), L("8", (660, 150, 690, 180)),
            L("sgn", (720, 150, 810, 180)),
            L("2) 28/7/26 MOSFET and IGBT 15", (0, 240, 640, 270)),
            L("3) 4/8/26 Chopper", (0, 330, 300, 360)),
            L("99", (660, 330, 690, 360)),
            L("4) 11/8/26 Rectifier", (0, 420, 300, 450)),
            L("12", (580, 420, 610, 450)), L("14", (580, 425, 610, 455)),
        ]

    def test_page_marks_signature(self):
        res = parse_contents(self.build(), target_exp_no=1)
        r1 = res.rows[0]
        self.assertTrue(res.geometry_used)
        self.assertEqual((r1.page_no, r1.marks, r1.signature_present), (13, 8.0, True))
        self.assertEqual(res.target_row.serial, 1)

    def test_merged_line_page(self):
        r2 = parse_contents(self.build()).rows[1]
        self.assertEqual(r2.page_no, 15)
        self.assertIn("page_from_merged_line", r2.flags)
        self.assertEqual(r2.title, "MOSFET and IGBT")

    def test_marks_out_of_range_is_not_accepted(self):
        r3 = parse_contents(self.build()).rows[2]
        self.assertIsNone(r3.marks)
        self.assertTrue(any(f.startswith("marks_out_of_range") for f in r3.flags))

    def test_conflicting_pages_not_guessed(self):
        r4 = parse_contents(self.build()).rows[3]
        self.assertIsNone(r4.page_no)
        self.assertIn("multiple_page_candidates", r4.flags)


class Edge(unittest.TestCase):
    def test_no_dates_at_all(self):
        res = parse_contents([OcrLine("hello"), OcrLine("world")], target_exp_no=1)
        self.assertEqual(res.flags, ["no_date_rows_found"])
        self.assertIsNone(res.target_row)

    def test_missing_target_experiment(self):
        res = parse_contents([OcrLine("1) 21/7/26 test")], target_exp_no=7)
        self.assertIn("target_experiment_not_found", res.flags)


if __name__ == "__main__":
    unittest.main()
