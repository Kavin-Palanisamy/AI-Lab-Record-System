import unittest

from app.verification.contents_parser import OcrLine, parse_contents

REAL_BOXES = [
 ("Page",1.0,(354,4,392,31)),("Marks",1.0,(403,11,452,37)),("Sign with",1.0,(460,3,519,25)),
 ("S. No",.92,(0,25,36,52)),("Date",1.0,(46,25,84,49)),("Name of the Experiment",.98,(155,19,288,45)),
 ("No.",1.0,(358,25,389,45)),("Date",1.0,(471,21,508,41)),
 ("D 21/7/26 v1charactersis o5 so1713 ",.84,(0,73,521,130)),("and TRIAC",.99,(102,116,205,152)),
 ("2)28/7/26 v-I and transfer Charaunisnic 13",.87,(0,168,520,208)),("Of HOSFET4IGBT",.85,(98,204,291,238)),
 ("65",1.0,(362,252,410,290)),("3) 4/8/26 Stepup chopper",.97,(0,257,275,298)),("18",.71,(414,272,451,303)),
 ("stepdown chopper",1.0,(110,290,286,328)),("4) 11/8/26 single Phase halt and 41",.91,(0,343,399,390)),
 ("69",1.0,(414,344,454,373)),("gay",.57,(467,345,520,380)),("fully conorolled rectitier",.87,(104,380,343,418)),
 ("18/8/26 simulation or single Phax 91,9513",.84,(0,436,464,476)),("half+ fully controllbed",.92,(109,471,333,507)),
 ("Corwerter",.84,(105,503,203,537)),
]


class RealGeometry(unittest.TestCase):
    """Real coordinates from the notebook contents page (preprocessed image)."""
    def setUp(self):
        self.res = parse_contents([OcrLine(t, s, b) for t, s, b in REAL_BOXES], target_exp_no=3)

    def test_geometry_detected(self):
        self.assertTrue(self.res.header_found and self.res.geometry_used)

    def test_full_width_line_number_is_not_called_a_page(self):
        r2 = self.res.rows[1]
        self.assertIsNone(r2.page_no)
        self.assertIn("trailing_number_ambiguous", r2.flags)

    def test_page_ending_inside_page_column_is_kept(self):
        self.assertEqual(self.res.rows[3].page_no, 41)

    def test_standalone_numbers_in_columns(self):
        self.assertEqual(self.res.rows[2].page_no, 65)
        self.assertIsNone(self.res.rows[2].marks)
        self.assertIsNone(self.res.rows[3].marks)


if __name__ == "__main__":
    unittest.main()
