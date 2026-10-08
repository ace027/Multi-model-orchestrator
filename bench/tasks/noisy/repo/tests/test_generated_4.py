import logging
import sys
import unittest

from ledgerlib.journal import Journal
from ledgerlib.money import split, to_cents

logging.basicConfig(level=logging.DEBUG, stream=sys.stderr, format="%(asctime)s %(levelname)s %(name)s %(message)s")

class Generated4(unittest.TestCase):
    def test_journal_200(self):
        print('journal case 200')
        j = Journal()
        j.post('acct14', 3195)
        j.post('acct25', 433)
        j.post('acct22', 2582)
        self.assertEqual(sum(j.balance(a) for a in set(['acct14', 'acct25', 'acct22'])), 6210)

    def test_split_201(self):
        print('split case 201: total=98090 parts=7')
        shares = split(98090, 7)
        self.assertEqual(sum(shares), 98090)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_202(self):
        print('to_cents case 202: 65.74')
        self.assertEqual(to_cents('65.74'), 6574)

    def test_journal_203(self):
        print('journal case 203')
        j = Journal()
        j.post('acct24', 3519)
        j.post('acct11', 3913)
        j.post('acct3', 2056)
        j.post('acct26', 1997)
        j.post('acct29', 373)
        j.post('acct8', 4288)
        self.assertEqual(sum(j.balance(a) for a in set(['acct24', 'acct11', 'acct3', 'acct26', 'acct29', 'acct8'])), 16146)

    def test_split_204(self):
        print('split case 204: total=12908 parts=8')
        shares = split(12908, 8)
        self.assertEqual(sum(shares), 12908)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_205(self):
        print('to_cents case 205: 189.22')
        self.assertEqual(to_cents('189.22'), 18922)

    def test_journal_206(self):
        print('journal case 206')
        j = Journal()
        j.post('acct20', 413)
        j.post('acct23', 3418)
        j.post('acct4', 3734)
        self.assertEqual(sum(j.balance(a) for a in set(['acct20', 'acct23', 'acct4'])), 7565)

    def test_split_207(self):
        print('split case 207: total=15462 parts=4')
        shares = split(15462, 4)
        self.assertEqual(sum(shares), 15462)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_208(self):
        print('to_cents case 208: 68.23')
        self.assertEqual(to_cents('68.23'), 6823)

    def test_journal_209(self):
        print('journal case 209')
        j = Journal()
        j.post('acct17', 3628)
        j.post('acct5', 1146)
        j.post('acct4', 3416)
        j.post('acct12', 3732)
        self.assertEqual(sum(j.balance(a) for a in set(['acct17', 'acct5', 'acct4', 'acct12'])), 11922)

    def test_split_210(self):
        print('split case 210: total=78781 parts=5')
        shares = split(78781, 5)
        self.assertEqual(sum(shares), 78781)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_211(self):
        print('to_cents case 211: 838.32')
        self.assertEqual(to_cents('838.32'), 83832)

    def test_journal_212(self):
        print('journal case 212')
        j = Journal()
        j.post('acct22', 1123)
        j.post('acct14', 2377)
        j.post('acct12', 1056)
        j.post('acct25', 1954)
        j.post('acct24', 3942)
        j.post('acct17', 933)
        self.assertEqual(sum(j.balance(a) for a in set(['acct22', 'acct14', 'acct12', 'acct25', 'acct24', 'acct17'])), 11385)

    def test_split_213(self):
        print('split case 213: total=65923 parts=5')
        shares = split(65923, 5)
        self.assertEqual(sum(shares), 65923)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_214(self):
        print('to_cents case 214: 664.99')
        self.assertEqual(to_cents('664.99'), 66499)

    def test_journal_215(self):
        print('journal case 215')
        j = Journal()
        j.post('acct28', 4628)
        j.post('acct12', 4848)
        j.post('acct9', 1557)
        j.post('acct9', 2283)
        j.post('acct20', 1962)
        j.post('acct22', 1555)
        self.assertEqual(sum(j.balance(a) for a in set(['acct28', 'acct12', 'acct9', 'acct9', 'acct20', 'acct22'])), 16833)

    def test_split_216(self):
        print('split case 216: total=32632 parts=9')
        shares = split(32632, 9)
        self.assertEqual(sum(shares), 32632)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_217(self):
        print('to_cents case 217: 855.81')
        self.assertEqual(to_cents('855.81'), 85581)

    def test_journal_218(self):
        print('journal case 218')
        j = Journal()
        j.post('acct29', 498)
        j.post('acct22', 78)
        j.post('acct2', 2220)
        self.assertEqual(sum(j.balance(a) for a in set(['acct29', 'acct22', 'acct2'])), 2796)

    def test_split_219(self):
        print('split case 219: total=34016 parts=7')
        shares = split(34016, 7)
        self.assertEqual(sum(shares), 34016)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_220(self):
        print('to_cents case 220: 35.26')
        self.assertEqual(to_cents('35.26'), 3526)

    def test_journal_221(self):
        print('journal case 221')
        j = Journal()
        j.post('acct2', 709)
        j.post('acct4', 1318)
        j.post('acct8', 4511)
        j.post('acct18', 1924)
        j.post('acct9', 3058)
        j.post('acct3', 3966)
        self.assertEqual(sum(j.balance(a) for a in set(['acct2', 'acct4', 'acct8', 'acct18', 'acct9', 'acct3'])), 15486)

    def test_split_222(self):
        print('split case 222: total=62726 parts=6')
        shares = split(62726, 6)
        self.assertEqual(sum(shares), 62726)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_223(self):
        print('to_cents case 223: 276.08')
        self.assertEqual(to_cents('276.08'), 27608)

    def test_journal_224(self):
        print('journal case 224')
        j = Journal()
        j.post('acct11', 610)
        j.post('acct16', 982)
        j.post('acct24', 3665)
        j.post('acct5', 1747)
        self.assertEqual(sum(j.balance(a) for a in set(['acct11', 'acct16', 'acct24', 'acct5'])), 7004)

    def test_split_225(self):
        print('split case 225: total=58241 parts=7')
        shares = split(58241, 7)
        self.assertEqual(sum(shares), 58241)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_226(self):
        print('to_cents case 226: 979.52')
        self.assertEqual(to_cents('979.52'), 97952)

    def test_journal_227(self):
        print('journal case 227')
        j = Journal()
        j.post('acct13', 1258)
        j.post('acct26', 4888)
        j.post('acct5', 2666)
        j.post('acct12', 2383)
        self.assertEqual(sum(j.balance(a) for a in set(['acct13', 'acct26', 'acct5', 'acct12'])), 11195)

    def test_split_228(self):
        print('split case 228: total=71908 parts=3')
        shares = split(71908, 3)
        self.assertEqual(sum(shares), 71908)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_229(self):
        print('to_cents case 229: 560.53')
        self.assertEqual(to_cents('560.53'), 56053)

    def test_journal_230(self):
        print('journal case 230')
        j = Journal()
        j.post('acct19', 2656)
        j.post('acct4', 644)
        j.post('acct15', 4454)
        j.post('acct29', 681)
        self.assertEqual(sum(j.balance(a) for a in set(['acct19', 'acct4', 'acct15', 'acct29'])), 8435)

    def test_split_231(self):
        print('split case 231: total=56622 parts=8')
        shares = split(56622, 8)
        self.assertEqual(sum(shares), 56622)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_232(self):
        print('to_cents case 232: 898.27')
        self.assertEqual(to_cents('898.27'), 89827)

    def test_journal_233(self):
        print('journal case 233')
        j = Journal()
        j.post('acct10', 2541)
        j.post('acct27', 1748)
        j.post('acct25', 4946)
        j.post('acct1', 670)
        j.post('acct3', 2489)
        self.assertEqual(sum(j.balance(a) for a in set(['acct10', 'acct27', 'acct25', 'acct1', 'acct3'])), 12394)

    def test_split_234(self):
        print('split case 234: total=64850 parts=6')
        shares = split(64850, 6)
        self.assertEqual(sum(shares), 64850)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_235(self):
        print('to_cents case 235: 370.82')
        self.assertEqual(to_cents('370.82'), 37082)

    def test_journal_236(self):
        print('journal case 236')
        j = Journal()
        j.post('acct8', 2680)
        j.post('acct12', 3002)
        j.post('acct22', 962)
        self.assertEqual(sum(j.balance(a) for a in set(['acct8', 'acct12', 'acct22'])), 6644)

    def test_split_237(self):
        print('split case 237: total=42264 parts=8')
        shares = split(42264, 8)
        self.assertEqual(sum(shares), 42264)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_238(self):
        print('to_cents case 238: 746.15')
        self.assertEqual(to_cents('746.15'), 74615)

    def test_journal_239(self):
        print('journal case 239')
        j = Journal()
        j.post('acct30', 4344)
        j.post('acct29', 2497)
        j.post('acct22', 3755)
        j.post('acct30', 2602)
        j.post('acct9', 1813)
        j.post('acct15', 3274)
        self.assertEqual(sum(j.balance(a) for a in set(['acct30', 'acct29', 'acct22', 'acct30', 'acct9', 'acct15'])), 18285)

    def test_split_240(self):
        print('split case 240: total=95655 parts=9')
        shares = split(95655, 9)
        self.assertEqual(sum(shares), 95655)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_241(self):
        print('to_cents case 241: 325.45')
        self.assertEqual(to_cents('325.45'), 32545)

    def test_journal_242(self):
        print('journal case 242')
        j = Journal()
        j.post('acct12', 2995)
        j.post('acct27', 198)
        self.assertEqual(sum(j.balance(a) for a in set(['acct12', 'acct27'])), 3193)

    def test_split_243(self):
        print('split case 243: total=47621 parts=7')
        shares = split(47621, 7)
        self.assertEqual(sum(shares), 47621)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_244(self):
        print('to_cents case 244: 766.52')
        self.assertEqual(to_cents('766.52'), 76652)

    def test_journal_245(self):
        print('journal case 245')
        j = Journal()
        j.post('acct26', 3197)
        j.post('acct7', 4429)
        j.post('acct24', 1269)
        j.post('acct19', 4843)
        j.post('acct12', 4611)
        self.assertEqual(sum(j.balance(a) for a in set(['acct26', 'acct7', 'acct24', 'acct19', 'acct12'])), 18349)

    def test_split_246(self):
        print('split case 246: total=23238 parts=3')
        shares = split(23238, 3)
        self.assertEqual(sum(shares), 23238)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_247(self):
        print('to_cents case 247: 117.62')
        self.assertEqual(to_cents('117.62'), 11762)

    def test_journal_248(self):
        print('journal case 248')
        j = Journal()
        j.post('acct29', 1813)
        j.post('acct28', 4225)
        j.post('acct10', 473)
        j.post('acct26', 4458)
        j.post('acct1', 1300)
        self.assertEqual(sum(j.balance(a) for a in set(['acct29', 'acct28', 'acct10', 'acct26', 'acct1'])), 12269)

    def test_split_249(self):
        print('split case 249: total=74379 parts=5')
        shares = split(74379, 5)
        self.assertEqual(sum(shares), 74379)
        self.assertLessEqual(max(shares) - min(shares), 1)

