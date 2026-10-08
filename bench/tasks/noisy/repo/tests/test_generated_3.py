import logging
import sys
import unittest

from ledgerlib.journal import Journal
from ledgerlib.money import split, to_cents

logging.basicConfig(level=logging.DEBUG, stream=sys.stderr, format="%(asctime)s %(levelname)s %(name)s %(message)s")

class Generated3(unittest.TestCase):
    def test_split_150(self):
        print('split case 150: total=55264 parts=9')
        shares = split(55264, 9)
        self.assertEqual(sum(shares), 55264)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_151(self):
        print('to_cents case 151: 923.84')
        self.assertEqual(to_cents('923.84'), 92384)

    def test_journal_152(self):
        print('journal case 152')
        j = Journal()
        j.post('acct7', 146)
        j.post('acct13', 787)
        j.post('acct21', 1647)
        self.assertEqual(sum(j.balance(a) for a in set(['acct7', 'acct13', 'acct21'])), 2580)

    def test_split_153(self):
        print('split case 153: total=74698 parts=6')
        shares = split(74698, 6)
        self.assertEqual(sum(shares), 74698)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_154(self):
        print('to_cents case 154: 473.59')
        self.assertEqual(to_cents('473.59'), 47359)

    def test_journal_155(self):
        print('journal case 155')
        j = Journal()
        j.post('acct23', 2814)
        j.post('acct17', 4119)
        self.assertEqual(sum(j.balance(a) for a in set(['acct23', 'acct17'])), 6933)

    def test_split_156(self):
        print('split case 156: total=89874 parts=4')
        shares = split(89874, 4)
        self.assertEqual(sum(shares), 89874)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_157(self):
        print('to_cents case 157: 92.47')
        self.assertEqual(to_cents('92.47'), 9247)

    def test_journal_158(self):
        print('journal case 158')
        j = Journal()
        j.post('acct4', 4218)
        j.post('acct1', 4660)
        j.post('acct2', 3943)
        j.post('acct25', 1201)
        j.post('acct18', 1553)
        self.assertEqual(sum(j.balance(a) for a in set(['acct4', 'acct1', 'acct2', 'acct25', 'acct18'])), 15575)

    def test_split_159(self):
        print('split case 159: total=24188 parts=2')
        shares = split(24188, 2)
        self.assertEqual(sum(shares), 24188)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_160(self):
        print('to_cents case 160: 267.27')
        self.assertEqual(to_cents('267.27'), 26727)

    def test_journal_161(self):
        print('journal case 161')
        j = Journal()
        j.post('acct27', 781)
        j.post('acct6', 4750)
        j.post('acct10', 508)
        self.assertEqual(sum(j.balance(a) for a in set(['acct27', 'acct6', 'acct10'])), 6039)

    def test_split_162(self):
        print('split case 162: total=17623 parts=8')
        shares = split(17623, 8)
        self.assertEqual(sum(shares), 17623)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_163(self):
        print('to_cents case 163: 101.71')
        self.assertEqual(to_cents('101.71'), 10171)

    def test_journal_164(self):
        print('journal case 164')
        j = Journal()
        j.post('acct11', 3826)
        j.post('acct13', 3494)
        self.assertEqual(sum(j.balance(a) for a in set(['acct11', 'acct13'])), 7320)

    def test_split_165(self):
        print('split case 165: total=67540 parts=6')
        shares = split(67540, 6)
        self.assertEqual(sum(shares), 67540)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_166(self):
        print('to_cents case 166: 563.71')
        self.assertEqual(to_cents('563.71'), 56371)

    def test_journal_167(self):
        print('journal case 167')
        j = Journal()
        j.post('acct20', 335)
        j.post('acct12', 1641)
        j.post('acct1', 1485)
        self.assertEqual(sum(j.balance(a) for a in set(['acct20', 'acct12', 'acct1'])), 3461)

    def test_split_168(self):
        print('split case 168: total=53472 parts=8')
        shares = split(53472, 8)
        self.assertEqual(sum(shares), 53472)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_169(self):
        print('to_cents case 169: 471.29')
        self.assertEqual(to_cents('471.29'), 47129)

    def test_journal_170(self):
        print('journal case 170')
        j = Journal()
        j.post('acct13', 1353)
        j.post('acct30', 777)
        j.post('acct7', 4199)
        j.post('acct20', 127)
        self.assertEqual(sum(j.balance(a) for a in set(['acct13', 'acct30', 'acct7', 'acct20'])), 6456)

    def test_split_171(self):
        print('split case 171: total=42428 parts=2')
        shares = split(42428, 2)
        self.assertEqual(sum(shares), 42428)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_172(self):
        print('to_cents case 172: 923.62')
        self.assertEqual(to_cents('923.62'), 92362)

    def test_journal_173(self):
        print('journal case 173')
        j = Journal()
        j.post('acct19', 2794)
        j.post('acct20', 2116)
        j.post('acct7', 2290)
        j.post('acct17', 953)
        j.post('acct19', 1312)
        self.assertEqual(sum(j.balance(a) for a in set(['acct19', 'acct20', 'acct7', 'acct17', 'acct19'])), 9465)

    def test_split_174(self):
        print('split case 174: total=53168 parts=3')
        shares = split(53168, 3)
        self.assertEqual(sum(shares), 53168)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_175(self):
        print('to_cents case 175: 432.42')
        self.assertEqual(to_cents('432.42'), 43242)

    def test_journal_176(self):
        print('journal case 176')
        j = Journal()
        j.post('acct23', 3324)
        j.post('acct12', 1695)
        j.post('acct25', 1515)
        j.post('acct14', 578)
        j.post('acct25', 2800)
        j.post('acct6', 2472)
        self.assertEqual(sum(j.balance(a) for a in set(['acct23', 'acct12', 'acct25', 'acct14', 'acct25', 'acct6'])), 12384)

    def test_split_177(self):
        print('split case 177: total=61452 parts=2')
        shares = split(61452, 2)
        self.assertEqual(sum(shares), 61452)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_178(self):
        print('to_cents case 178: 13.88')
        self.assertEqual(to_cents('13.88'), 1388)

    def test_journal_179(self):
        print('journal case 179')
        j = Journal()
        j.post('acct21', 1902)
        j.post('acct29', 2237)
        j.post('acct20', 2449)
        j.post('acct2', 2768)
        self.assertEqual(sum(j.balance(a) for a in set(['acct21', 'acct29', 'acct20', 'acct2'])), 9356)

    def test_split_180(self):
        print('split case 180: total=28318 parts=7')
        shares = split(28318, 7)
        self.assertEqual(sum(shares), 28318)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_181(self):
        print('to_cents case 181: 746.55')
        self.assertEqual(to_cents('746.55'), 74655)

    def test_journal_182(self):
        print('journal case 182')
        j = Journal()
        j.post('acct18', 4217)
        j.post('acct3', 4077)
        j.post('acct13', 1747)
        self.assertEqual(sum(j.balance(a) for a in set(['acct18', 'acct3', 'acct13'])), 10041)

    def test_split_183(self):
        print('split case 183: total=91915 parts=2')
        shares = split(91915, 2)
        self.assertEqual(sum(shares), 91915)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_184(self):
        print('to_cents case 184: 998.42')
        self.assertEqual(to_cents('998.42'), 99842)

    def test_journal_185(self):
        print('journal case 185')
        j = Journal()
        j.post('acct19', 1942)
        j.post('acct1', 2103)
        j.post('acct4', 3635)
        j.post('acct20', 3290)
        j.post('acct4', 4136)
        self.assertEqual(sum(j.balance(a) for a in set(['acct19', 'acct1', 'acct4', 'acct20', 'acct4'])), 15106)

    def test_split_186(self):
        print('split case 186: total=6614 parts=4')
        shares = split(6614, 4)
        self.assertEqual(sum(shares), 6614)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_187(self):
        print('to_cents case 187: 849.35')
        self.assertEqual(to_cents('849.35'), 84935)

    def test_journal_188(self):
        print('journal case 188')
        j = Journal()
        j.post('acct1', 2793)
        j.post('acct4', 4507)
        j.post('acct9', 4428)
        j.post('acct9', 4161)
        j.post('acct9', 3406)
        self.assertEqual(sum(j.balance(a) for a in set(['acct1', 'acct4', 'acct9', 'acct9', 'acct9'])), 19295)

    def test_split_189(self):
        print('split case 189: total=68246 parts=2')
        shares = split(68246, 2)
        self.assertEqual(sum(shares), 68246)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_190(self):
        print('to_cents case 190: 836.25')
        self.assertEqual(to_cents('836.25'), 83625)

    def test_journal_191(self):
        print('journal case 191')
        j = Journal()
        j.post('acct26', 370)
        j.post('acct21', 3166)
        j.post('acct3', 1311)
        j.post('acct18', 3162)
        j.post('acct20', 3865)
        self.assertEqual(sum(j.balance(a) for a in set(['acct26', 'acct21', 'acct3', 'acct18', 'acct20'])), 11874)

    def test_split_192(self):
        print('split case 192: total=22168 parts=8')
        shares = split(22168, 8)
        self.assertEqual(sum(shares), 22168)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_193(self):
        print('to_cents case 193: 710.34')
        self.assertEqual(to_cents('710.34'), 71034)

    def test_journal_194(self):
        print('journal case 194')
        j = Journal()
        j.post('acct20', 4316)
        j.post('acct2', 3266)
        j.post('acct14', 4898)
        j.post('acct16', 2560)
        j.post('acct14', 2995)
        j.post('acct10', 4346)
        self.assertEqual(sum(j.balance(a) for a in set(['acct20', 'acct2', 'acct14', 'acct16', 'acct14', 'acct10'])), 22381)

    def test_split_195(self):
        print('split case 195: total=37454 parts=8')
        shares = split(37454, 8)
        self.assertEqual(sum(shares), 37454)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_196(self):
        print('to_cents case 196: 858.66')
        self.assertEqual(to_cents('858.66'), 85866)

    def test_journal_197(self):
        print('journal case 197')
        j = Journal()
        j.post('acct18', 2426)
        j.post('acct30', 221)
        j.post('acct10', 115)
        j.post('acct22', 2008)
        self.assertEqual(sum(j.balance(a) for a in set(['acct18', 'acct30', 'acct10', 'acct22'])), 4770)

    def test_split_198(self):
        print('split case 198: total=76784 parts=1')
        shares = split(76784, 1)
        self.assertEqual(sum(shares), 76784)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_199(self):
        print('to_cents case 199: 829.67')
        self.assertEqual(to_cents('829.67'), 82967)

