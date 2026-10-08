import logging
import sys
import unittest

from ledgerlib.journal import Journal
from ledgerlib.money import split, to_cents

logging.basicConfig(level=logging.DEBUG, stream=sys.stderr, format="%(asctime)s %(levelname)s %(name)s %(message)s")

class Generated6(unittest.TestCase):
    def test_split_300(self):
        print('split case 300: total=1619 parts=7')
        shares = split(1619, 7)
        self.assertEqual(sum(shares), 1619)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_301(self):
        print('to_cents case 301: 932.91')
        self.assertEqual(to_cents('932.91'), 93291)

    def test_journal_302(self):
        print('journal case 302')
        j = Journal()
        j.post('acct8', 86)
        j.post('acct10', 1694)
        j.post('acct19', 1247)
        j.post('acct4', 2379)
        j.post('acct15', 3081)
        self.assertEqual(sum(j.balance(a) for a in set(['acct8', 'acct10', 'acct19', 'acct4', 'acct15'])), 8487)

    def test_split_303(self):
        print('split case 303: total=70749 parts=5')
        shares = split(70749, 5)
        self.assertEqual(sum(shares), 70749)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_304(self):
        print('to_cents case 304: 442.22')
        self.assertEqual(to_cents('442.22'), 44222)

    def test_journal_305(self):
        print('journal case 305')
        j = Journal()
        j.post('acct18', 1638)
        j.post('acct22', 3085)
        j.post('acct3', 898)
        j.post('acct9', 2699)
        j.post('acct7', 2538)
        self.assertEqual(sum(j.balance(a) for a in set(['acct18', 'acct22', 'acct3', 'acct9', 'acct7'])), 10858)

    def test_split_306(self):
        print('split case 306: total=35889 parts=8')
        shares = split(35889, 8)
        self.assertEqual(sum(shares), 35889)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_307(self):
        print('to_cents case 307: 948.68')
        self.assertEqual(to_cents('948.68'), 94868)

    def test_journal_308(self):
        print('journal case 308')
        j = Journal()
        j.post('acct15', 835)
        j.post('acct27', 1154)
        j.post('acct13', 774)
        j.post('acct3', 1077)
        self.assertEqual(sum(j.balance(a) for a in set(['acct15', 'acct27', 'acct13', 'acct3'])), 3840)

    def test_split_309(self):
        print('split case 309: total=88827 parts=3')
        shares = split(88827, 3)
        self.assertEqual(sum(shares), 88827)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_310(self):
        print('to_cents case 310: 235.76')
        self.assertEqual(to_cents('235.76'), 23576)

    def test_journal_311(self):
        print('journal case 311')
        j = Journal()
        j.post('acct13', 3795)
        j.post('acct2', 4856)
        j.post('acct27', 739)
        self.assertEqual(sum(j.balance(a) for a in set(['acct13', 'acct2', 'acct27'])), 9390)

    def test_split_312(self):
        print('split case 312: total=13164 parts=4')
        shares = split(13164, 4)
        self.assertEqual(sum(shares), 13164)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_313(self):
        print('to_cents case 313: 42.41')
        self.assertEqual(to_cents('42.41'), 4241)

    def test_journal_314(self):
        print('journal case 314')
        j = Journal()
        j.post('acct4', 596)
        j.post('acct14', 2799)
        j.post('acct14', 3499)
        self.assertEqual(sum(j.balance(a) for a in set(['acct4', 'acct14', 'acct14'])), 6894)

    def test_split_315(self):
        print('split case 315: total=67052 parts=3')
        shares = split(67052, 3)
        self.assertEqual(sum(shares), 67052)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_316(self):
        print('to_cents case 316: 848.36')
        self.assertEqual(to_cents('848.36'), 84836)

    def test_journal_317(self):
        print('journal case 317')
        j = Journal()
        j.post('acct25', 3162)
        j.post('acct5', 3955)
        j.post('acct27', 2715)
        self.assertEqual(sum(j.balance(a) for a in set(['acct25', 'acct5', 'acct27'])), 9832)

    def test_split_318(self):
        print('split case 318: total=54021 parts=1')
        shares = split(54021, 1)
        self.assertEqual(sum(shares), 54021)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_319(self):
        print('to_cents case 319: 952.81')
        self.assertEqual(to_cents('952.81'), 95281)

    def test_journal_320(self):
        print('journal case 320')
        j = Journal()
        j.post('acct20', 2008)
        j.post('acct23', 4986)
        j.post('acct11', 4341)
        j.post('acct26', 152)
        j.post('acct26', 2136)
        self.assertEqual(sum(j.balance(a) for a in set(['acct20', 'acct23', 'acct11', 'acct26', 'acct26'])), 13623)

    def test_split_321(self):
        print('split case 321: total=43387 parts=4')
        shares = split(43387, 4)
        self.assertEqual(sum(shares), 43387)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_322(self):
        print('to_cents case 322: 448.57')
        self.assertEqual(to_cents('448.57'), 44857)

    def test_journal_323(self):
        print('journal case 323')
        j = Journal()
        j.post('acct21', 3094)
        j.post('acct15', 1679)
        j.post('acct4', 4173)
        j.post('acct18', 2726)
        self.assertEqual(sum(j.balance(a) for a in set(['acct21', 'acct15', 'acct4', 'acct18'])), 11672)

    def test_split_324(self):
        print('split case 324: total=38467 parts=2')
        shares = split(38467, 2)
        self.assertEqual(sum(shares), 38467)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_325(self):
        print('to_cents case 325: 801.42')
        self.assertEqual(to_cents('801.42'), 80142)

    def test_journal_326(self):
        print('journal case 326')
        j = Journal()
        j.post('acct9', 2446)
        j.post('acct25', 4492)
        j.post('acct18', 1917)
        self.assertEqual(sum(j.balance(a) for a in set(['acct9', 'acct25', 'acct18'])), 8855)

    def test_split_327(self):
        print('split case 327: total=46211 parts=9')
        shares = split(46211, 9)
        self.assertEqual(sum(shares), 46211)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_328(self):
        print('to_cents case 328: 672.98')
        self.assertEqual(to_cents('672.98'), 67298)

    def test_journal_329(self):
        print('journal case 329')
        j = Journal()
        j.post('acct19', 4228)
        j.post('acct23', 1616)
        j.post('acct7', 4648)
        self.assertEqual(sum(j.balance(a) for a in set(['acct19', 'acct23', 'acct7'])), 10492)

    def test_split_330(self):
        print('split case 330: total=3501 parts=4')
        shares = split(3501, 4)
        self.assertEqual(sum(shares), 3501)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_331(self):
        print('to_cents case 331: 109.10')
        self.assertEqual(to_cents('109.10'), 10910)

    def test_journal_332(self):
        print('journal case 332')
        j = Journal()
        j.post('acct8', 3421)
        j.post('acct16', 2733)
        j.post('acct19', 2697)
        self.assertEqual(sum(j.balance(a) for a in set(['acct8', 'acct16', 'acct19'])), 8851)

    def test_split_333(self):
        print('split case 333: total=12027 parts=6')
        shares = split(12027, 6)
        self.assertEqual(sum(shares), 12027)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_334(self):
        print('to_cents case 334: 348.87')
        self.assertEqual(to_cents('348.87'), 34887)

    def test_journal_335(self):
        print('journal case 335')
        j = Journal()
        j.post('acct29', 1955)
        j.post('acct4', 4664)
        j.post('acct15', 4452)
        j.post('acct24', 4475)
        j.post('acct5', 4594)
        self.assertEqual(sum(j.balance(a) for a in set(['acct29', 'acct4', 'acct15', 'acct24', 'acct5'])), 20140)

    def test_split_336(self):
        print('split case 336: total=8335 parts=9')
        shares = split(8335, 9)
        self.assertEqual(sum(shares), 8335)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_337(self):
        print('to_cents case 337: 346.51')
        self.assertEqual(to_cents('346.51'), 34651)

    def test_journal_338(self):
        print('journal case 338')
        j = Journal()
        j.post('acct30', 2742)
        j.post('acct24', 4928)
        j.post('acct29', 1194)
        self.assertEqual(sum(j.balance(a) for a in set(['acct30', 'acct24', 'acct29'])), 8864)

    def test_split_339(self):
        print('split case 339: total=16077 parts=1')
        shares = split(16077, 1)
        self.assertEqual(sum(shares), 16077)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_340(self):
        print('to_cents case 340: 378.24')
        self.assertEqual(to_cents('378.24'), 37824)

    def test_journal_341(self):
        print('journal case 341')
        j = Journal()
        j.post('acct8', 1359)
        j.post('acct25', 1521)
        j.post('acct19', 4896)
        j.post('acct12', 4489)
        self.assertEqual(sum(j.balance(a) for a in set(['acct8', 'acct25', 'acct19', 'acct12'])), 12265)

    def test_split_342(self):
        print('split case 342: total=9998 parts=8')
        shares = split(9998, 8)
        self.assertEqual(sum(shares), 9998)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_343(self):
        print('to_cents case 343: 41.97')
        self.assertEqual(to_cents('41.97'), 4197)

    def test_journal_344(self):
        print('journal case 344')
        j = Journal()
        j.post('acct6', 2521)
        j.post('acct26', 3127)
        j.post('acct30', 4849)
        j.post('acct22', 134)
        j.post('acct5', 1299)
        self.assertEqual(sum(j.balance(a) for a in set(['acct6', 'acct26', 'acct30', 'acct22', 'acct5'])), 11930)

    def test_split_345(self):
        print('split case 345: total=26154 parts=7')
        shares = split(26154, 7)
        self.assertEqual(sum(shares), 26154)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_346(self):
        print('to_cents case 346: 613.44')
        self.assertEqual(to_cents('613.44'), 61344)

    def test_journal_347(self):
        print('journal case 347')
        j = Journal()
        j.post('acct5', 3166)
        j.post('acct17', 969)
        self.assertEqual(sum(j.balance(a) for a in set(['acct5', 'acct17'])), 4135)

    def test_split_348(self):
        print('split case 348: total=74648 parts=7')
        shares = split(74648, 7)
        self.assertEqual(sum(shares), 74648)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_349(self):
        print('to_cents case 349: 227.65')
        self.assertEqual(to_cents('227.65'), 22765)

