import logging
import sys
import unittest

from ledgerlib.journal import Journal
from ledgerlib.money import split, to_cents

logging.basicConfig(level=logging.DEBUG, stream=sys.stderr, format="%(asctime)s %(levelname)s %(name)s %(message)s")

class Generated7(unittest.TestCase):
    def test_journal_350(self):
        print('journal case 350')
        j = Journal()
        j.post('acct17', 4654)
        j.post('acct5', 2721)
        j.post('acct9', 439)
        j.post('acct8', 311)
        self.assertEqual(sum(j.balance(a) for a in set(['acct17', 'acct5', 'acct9', 'acct8'])), 8125)

    def test_split_351(self):
        print('split case 351: total=94586 parts=3')
        shares = split(94586, 3)
        self.assertEqual(sum(shares), 94586)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_352(self):
        print('to_cents case 352: 528.45')
        self.assertEqual(to_cents('528.45'), 52845)

    def test_journal_353(self):
        print('journal case 353')
        j = Journal()
        j.post('acct20', 4627)
        j.post('acct4', 3334)
        j.post('acct16', 2307)
        j.post('acct12', 3980)
        j.post('acct14', 3798)
        self.assertEqual(sum(j.balance(a) for a in set(['acct20', 'acct4', 'acct16', 'acct12', 'acct14'])), 18046)

    def test_split_354(self):
        print('split case 354: total=90477 parts=7')
        shares = split(90477, 7)
        self.assertEqual(sum(shares), 90477)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_355(self):
        print('to_cents case 355: 568.79')
        self.assertEqual(to_cents('568.79'), 56879)

    def test_journal_356(self):
        print('journal case 356')
        j = Journal()
        j.post('acct19', 4309)
        j.post('acct4', 2707)
        self.assertEqual(sum(j.balance(a) for a in set(['acct19', 'acct4'])), 7016)

    def test_split_357(self):
        print('split case 357: total=68813 parts=9')
        shares = split(68813, 9)
        self.assertEqual(sum(shares), 68813)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_358(self):
        print('to_cents case 358: 566.52')
        self.assertEqual(to_cents('566.52'), 56652)

    def test_journal_359(self):
        print('journal case 359')
        j = Journal()
        j.post('acct29', 2426)
        j.post('acct1', 3549)
        j.post('acct11', 3085)
        j.post('acct30', 4895)
        j.post('acct2', 2638)
        self.assertEqual(sum(j.balance(a) for a in set(['acct29', 'acct1', 'acct11', 'acct30', 'acct2'])), 16593)

    def test_split_360(self):
        print('split case 360: total=98552 parts=5')
        shares = split(98552, 5)
        self.assertEqual(sum(shares), 98552)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_361(self):
        print('to_cents case 361: 777.83')
        self.assertEqual(to_cents('777.83'), 77783)

    def test_journal_362(self):
        print('journal case 362')
        j = Journal()
        j.post('acct8', 3662)
        j.post('acct4', 1986)
        self.assertEqual(sum(j.balance(a) for a in set(['acct8', 'acct4'])), 5648)

    def test_split_363(self):
        print('split case 363: total=65882 parts=7')
        shares = split(65882, 7)
        self.assertEqual(sum(shares), 65882)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_364(self):
        print('to_cents case 364: 68.11')
        self.assertEqual(to_cents('68.11'), 6811)

    def test_journal_365(self):
        print('journal case 365')
        j = Journal()
        j.post('acct23', 4465)
        j.post('acct4', 2510)
        j.post('acct17', 3241)
        j.post('acct30', 1933)
        j.post('acct8', 561)
        self.assertEqual(sum(j.balance(a) for a in set(['acct23', 'acct4', 'acct17', 'acct30', 'acct8'])), 12710)

    def test_split_366(self):
        print('split case 366: total=95788 parts=6')
        shares = split(95788, 6)
        self.assertEqual(sum(shares), 95788)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_367(self):
        print('to_cents case 367: 715.85')
        self.assertEqual(to_cents('715.85'), 71585)

    def test_journal_368(self):
        print('journal case 368')
        j = Journal()
        j.post('acct19', 3454)
        j.post('acct26', 4644)
        j.post('acct6', 1005)
        j.post('acct8', 588)
        j.post('acct21', 808)
        self.assertEqual(sum(j.balance(a) for a in set(['acct19', 'acct26', 'acct6', 'acct8', 'acct21'])), 10499)

    def test_split_369(self):
        print('split case 369: total=68111 parts=3')
        shares = split(68111, 3)
        self.assertEqual(sum(shares), 68111)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_370(self):
        print('to_cents case 370: 162.26')
        self.assertEqual(to_cents('162.26'), 16226)

    def test_journal_371(self):
        print('journal case 371')
        j = Journal()
        j.post('acct19', 2452)
        j.post('acct15', 196)
        j.post('acct1', 2661)
        j.post('acct10', 1410)
        j.post('acct8', 514)
        j.post('acct24', 3611)
        self.assertEqual(sum(j.balance(a) for a in set(['acct19', 'acct15', 'acct1', 'acct10', 'acct8', 'acct24'])), 10844)

    def test_split_372(self):
        print('split case 372: total=58988 parts=9')
        shares = split(58988, 9)
        self.assertEqual(sum(shares), 58988)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_373(self):
        print('to_cents case 373: 520.68')
        self.assertEqual(to_cents('520.68'), 52068)

    def test_journal_374(self):
        print('journal case 374')
        j = Journal()
        j.post('acct12', 1891)
        j.post('acct23', 376)
        j.post('acct19', 2509)
        self.assertEqual(sum(j.balance(a) for a in set(['acct12', 'acct23', 'acct19'])), 4776)

    def test_split_375(self):
        print('split case 375: total=4081 parts=8')
        shares = split(4081, 8)
        self.assertEqual(sum(shares), 4081)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_376(self):
        print('to_cents case 376: 411.28')
        self.assertEqual(to_cents('411.28'), 41128)

    def test_journal_377(self):
        print('journal case 377')
        j = Journal()
        j.post('acct11', 3872)
        j.post('acct16', 1692)
        j.post('acct5', 1661)
        j.post('acct30', 2420)
        self.assertEqual(sum(j.balance(a) for a in set(['acct11', 'acct16', 'acct5', 'acct30'])), 9645)

    def test_split_378(self):
        print('split case 378: total=90771 parts=1')
        shares = split(90771, 1)
        self.assertEqual(sum(shares), 90771)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_379(self):
        print('to_cents case 379: 256.25')
        self.assertEqual(to_cents('256.25'), 25625)

    def test_journal_380(self):
        print('journal case 380')
        j = Journal()
        j.post('acct27', 3871)
        j.post('acct28', 132)
        j.post('acct12', 1409)
        j.post('acct29', 4587)
        self.assertEqual(sum(j.balance(a) for a in set(['acct27', 'acct28', 'acct12', 'acct29'])), 9999)

    def test_split_381(self):
        print('split case 381: total=26478 parts=9')
        shares = split(26478, 9)
        self.assertEqual(sum(shares), 26478)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_382(self):
        print('to_cents case 382: 828.89')
        self.assertEqual(to_cents('828.89'), 82889)

    def test_journal_383(self):
        print('journal case 383')
        j = Journal()
        j.post('acct7', 870)
        j.post('acct29', 2508)
        j.post('acct2', 2564)
        self.assertEqual(sum(j.balance(a) for a in set(['acct7', 'acct29', 'acct2'])), 5942)

    def test_split_384(self):
        print('split case 384: total=35900 parts=7')
        shares = split(35900, 7)
        self.assertEqual(sum(shares), 35900)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_385(self):
        print('to_cents case 385: 934.73')
        self.assertEqual(to_cents('934.73'), 93473)

    def test_journal_386(self):
        print('journal case 386')
        j = Journal()
        j.post('acct11', 3647)
        j.post('acct23', 3402)
        j.post('acct25', 648)
        self.assertEqual(sum(j.balance(a) for a in set(['acct11', 'acct23', 'acct25'])), 7697)

    def test_split_387(self):
        print('split case 387: total=22203 parts=4')
        shares = split(22203, 4)
        self.assertEqual(sum(shares), 22203)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_388(self):
        print('to_cents case 388: 402.60')
        self.assertEqual(to_cents('402.60'), 40260)

    def test_journal_389(self):
        print('journal case 389')
        j = Journal()
        j.post('acct23', 1610)
        j.post('acct23', 2204)
        self.assertEqual(sum(j.balance(a) for a in set(['acct23', 'acct23'])), 3814)

    def test_split_390(self):
        print('split case 390: total=23727 parts=4')
        shares = split(23727, 4)
        self.assertEqual(sum(shares), 23727)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_391(self):
        print('to_cents case 391: 657.23')
        self.assertEqual(to_cents('657.23'), 65723)

    def test_journal_392(self):
        print('journal case 392')
        j = Journal()
        j.post('acct26', 4296)
        j.post('acct9', 949)
        j.post('acct12', 4833)
        j.post('acct26', 4227)
        self.assertEqual(sum(j.balance(a) for a in set(['acct26', 'acct9', 'acct12', 'acct26'])), 14305)

    def test_split_393(self):
        print('split case 393: total=30015 parts=5')
        shares = split(30015, 5)
        self.assertEqual(sum(shares), 30015)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_394(self):
        print('to_cents case 394: 236.66')
        self.assertEqual(to_cents('236.66'), 23666)

    def test_journal_395(self):
        print('journal case 395')
        j = Journal()
        j.post('acct9', 738)
        j.post('acct5', 3791)
        j.post('acct21', 625)
        self.assertEqual(sum(j.balance(a) for a in set(['acct9', 'acct5', 'acct21'])), 5154)

    def test_split_396(self):
        print('split case 396: total=57717 parts=9')
        shares = split(57717, 9)
        self.assertEqual(sum(shares), 57717)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_397(self):
        print('to_cents case 397: 96.74')
        self.assertEqual(to_cents('96.74'), 9674)

    def test_journal_398(self):
        print('journal case 398')
        j = Journal()
        j.post('acct30', 4402)
        j.post('acct2', 2056)
        j.post('acct1', 3469)
        j.post('acct20', 4658)
        j.post('acct19', 715)
        j.post('acct10', 1348)
        self.assertEqual(sum(j.balance(a) for a in set(['acct30', 'acct2', 'acct1', 'acct20', 'acct19', 'acct10'])), 16648)

    def test_split_399(self):
        print('split case 399: total=37376 parts=4')
        shares = split(37376, 4)
        self.assertEqual(sum(shares), 37376)
        self.assertLessEqual(max(shares) - min(shares), 1)

