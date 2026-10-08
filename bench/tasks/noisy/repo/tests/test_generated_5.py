import logging
import sys
import unittest

from ledgerlib.journal import Journal
from ledgerlib.money import split, to_cents

logging.basicConfig(level=logging.DEBUG, stream=sys.stderr, format="%(asctime)s %(levelname)s %(name)s %(message)s")

class Generated5(unittest.TestCase):
    def test_to_cents_250(self):
        print('to_cents case 250: 29.28')
        self.assertEqual(to_cents('29.28'), 2928)

    def test_journal_251(self):
        print('journal case 251')
        j = Journal()
        j.post('acct3', 4469)
        j.post('acct19', 689)
        j.post('acct18', 2741)
        j.post('acct10', 670)
        j.post('acct26', 2242)
        self.assertEqual(sum(j.balance(a) for a in set(['acct3', 'acct19', 'acct18', 'acct10', 'acct26'])), 10811)

    def test_split_252(self):
        print('split case 252: total=96608 parts=2')
        shares = split(96608, 2)
        self.assertEqual(sum(shares), 96608)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_253(self):
        print('to_cents case 253: 411.31')
        self.assertEqual(to_cents('411.31'), 41131)

    def test_journal_254(self):
        print('journal case 254')
        j = Journal()
        j.post('acct1', 1179)
        j.post('acct21', 799)
        self.assertEqual(sum(j.balance(a) for a in set(['acct1', 'acct21'])), 1978)

    def test_split_255(self):
        print('split case 255: total=97753 parts=7')
        shares = split(97753, 7)
        self.assertEqual(sum(shares), 97753)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_256(self):
        print('to_cents case 256: 321.71')
        self.assertEqual(to_cents('321.71'), 32171)

    def test_journal_257(self):
        print('journal case 257')
        j = Journal()
        j.post('acct16', 4273)
        j.post('acct25', 2771)
        j.post('acct30', 3761)
        self.assertEqual(sum(j.balance(a) for a in set(['acct16', 'acct25', 'acct30'])), 10805)

    def test_split_258(self):
        print('split case 258: total=51693 parts=6')
        shares = split(51693, 6)
        self.assertEqual(sum(shares), 51693)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_259(self):
        print('to_cents case 259: 442.77')
        self.assertEqual(to_cents('442.77'), 44277)

    def test_journal_260(self):
        print('journal case 260')
        j = Journal()
        j.post('acct22', 4402)
        j.post('acct5', 594)
        j.post('acct16', 379)
        j.post('acct16', 3364)
        self.assertEqual(sum(j.balance(a) for a in set(['acct22', 'acct5', 'acct16', 'acct16'])), 8739)

    def test_split_261(self):
        print('split case 261: total=99228 parts=6')
        shares = split(99228, 6)
        self.assertEqual(sum(shares), 99228)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_262(self):
        print('to_cents case 262: 5.07')
        self.assertEqual(to_cents('5.07'), 507)

    def test_journal_263(self):
        print('journal case 263')
        j = Journal()
        j.post('acct27', 200)
        j.post('acct3', 4292)
        j.post('acct29', 2966)
        j.post('acct15', 84)
        j.post('acct18', 901)
        self.assertEqual(sum(j.balance(a) for a in set(['acct27', 'acct3', 'acct29', 'acct15', 'acct18'])), 8443)

    def test_split_264(self):
        print('split case 264: total=55262 parts=7')
        shares = split(55262, 7)
        self.assertEqual(sum(shares), 55262)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_265(self):
        print('to_cents case 265: 191.61')
        self.assertEqual(to_cents('191.61'), 19161)

    def test_journal_266(self):
        print('journal case 266')
        j = Journal()
        j.post('acct24', 3077)
        j.post('acct6', 1374)
        j.post('acct21', 2629)
        self.assertEqual(sum(j.balance(a) for a in set(['acct24', 'acct6', 'acct21'])), 7080)

    def test_split_267(self):
        print('split case 267: total=26787 parts=7')
        shares = split(26787, 7)
        self.assertEqual(sum(shares), 26787)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_268(self):
        print('to_cents case 268: 556.98')
        self.assertEqual(to_cents('556.98'), 55698)

    def test_journal_269(self):
        print('journal case 269')
        j = Journal()
        j.post('acct10', 941)
        j.post('acct9', 2487)
        j.post('acct29', 1274)
        j.post('acct2', 1470)
        j.post('acct16', 511)
        j.post('acct10', 3759)
        self.assertEqual(sum(j.balance(a) for a in set(['acct10', 'acct9', 'acct29', 'acct2', 'acct16', 'acct10'])), 10442)

    def test_split_270(self):
        print('split case 270: total=2251 parts=8')
        shares = split(2251, 8)
        self.assertEqual(sum(shares), 2251)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_271(self):
        print('to_cents case 271: 47.67')
        self.assertEqual(to_cents('47.67'), 4767)

    def test_journal_272(self):
        print('journal case 272')
        j = Journal()
        j.post('acct4', 1781)
        j.post('acct7', 4820)
        j.post('acct6', 1929)
        j.post('acct12', 4916)
        self.assertEqual(sum(j.balance(a) for a in set(['acct4', 'acct7', 'acct6', 'acct12'])), 13446)

    def test_split_273(self):
        print('split case 273: total=94011 parts=8')
        shares = split(94011, 8)
        self.assertEqual(sum(shares), 94011)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_274(self):
        print('to_cents case 274: 779.59')
        self.assertEqual(to_cents('779.59'), 77959)

    def test_journal_275(self):
        print('journal case 275')
        j = Journal()
        j.post('acct8', 1414)
        j.post('acct15', 2554)
        j.post('acct6', 4492)
        j.post('acct29', 4509)
        j.post('acct9', 3928)
        j.post('acct13', 2134)
        self.assertEqual(sum(j.balance(a) for a in set(['acct8', 'acct15', 'acct6', 'acct29', 'acct9', 'acct13'])), 19031)

    def test_split_276(self):
        print('split case 276: total=63539 parts=7')
        shares = split(63539, 7)
        self.assertEqual(sum(shares), 63539)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_277(self):
        print('to_cents case 277: 448.36')
        self.assertEqual(to_cents('448.36'), 44836)

    def test_journal_278(self):
        print('journal case 278')
        j = Journal()
        j.post('acct25', 408)
        j.post('acct3', 1782)
        j.post('acct16', 1101)
        j.post('acct28', 3154)
        j.post('acct8', 4322)
        j.post('acct13', 4226)
        self.assertEqual(sum(j.balance(a) for a in set(['acct25', 'acct3', 'acct16', 'acct28', 'acct8', 'acct13'])), 14993)

    def test_split_279(self):
        print('split case 279: total=35986 parts=1')
        shares = split(35986, 1)
        self.assertEqual(sum(shares), 35986)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_280(self):
        print('to_cents case 280: 861.86')
        self.assertEqual(to_cents('861.86'), 86186)

    def test_journal_281(self):
        print('journal case 281')
        j = Journal()
        j.post('acct29', 3872)
        j.post('acct1', 3044)
        j.post('acct28', 3687)
        self.assertEqual(sum(j.balance(a) for a in set(['acct29', 'acct1', 'acct28'])), 10603)

    def test_split_282(self):
        print('split case 282: total=32317 parts=7')
        shares = split(32317, 7)
        self.assertEqual(sum(shares), 32317)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_283(self):
        print('to_cents case 283: 794.39')
        self.assertEqual(to_cents('794.39'), 79439)

    def test_journal_284(self):
        print('journal case 284')
        j = Journal()
        j.post('acct14', 2637)
        j.post('acct6', 1186)
        j.post('acct25', 2126)
        self.assertEqual(sum(j.balance(a) for a in set(['acct14', 'acct6', 'acct25'])), 5949)

    def test_split_285(self):
        print('split case 285: total=67650 parts=3')
        shares = split(67650, 3)
        self.assertEqual(sum(shares), 67650)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_286(self):
        print('to_cents case 286: 834.88')
        self.assertEqual(to_cents('834.88'), 83488)

    def test_journal_287(self):
        print('journal case 287')
        j = Journal()
        j.post('acct9', 1461)
        j.post('acct17', 12)
        j.post('acct18', 1674)
        j.post('acct2', 1221)
        j.post('acct5', 1052)
        j.post('acct19', 676)
        self.assertEqual(sum(j.balance(a) for a in set(['acct9', 'acct17', 'acct18', 'acct2', 'acct5', 'acct19'])), 6096)

    def test_split_288(self):
        print('split case 288: total=46102 parts=5')
        shares = split(46102, 5)
        self.assertEqual(sum(shares), 46102)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_289(self):
        print('to_cents case 289: 805.91')
        self.assertEqual(to_cents('805.91'), 80591)

    def test_journal_290(self):
        print('journal case 290')
        j = Journal()
        j.post('acct4', 4806)
        j.post('acct29', 4452)
        j.post('acct16', 4145)
        j.post('acct23', 2488)
        j.post('acct15', 156)
        j.post('acct3', 1539)
        self.assertEqual(sum(j.balance(a) for a in set(['acct4', 'acct29', 'acct16', 'acct23', 'acct15', 'acct3'])), 17586)

    def test_split_291(self):
        print('split case 291: total=54654 parts=4')
        shares = split(54654, 4)
        self.assertEqual(sum(shares), 54654)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_292(self):
        print('to_cents case 292: 894.21')
        self.assertEqual(to_cents('894.21'), 89421)

    def test_journal_293(self):
        print('journal case 293')
        j = Journal()
        j.post('acct26', 3607)
        j.post('acct27', 1708)
        self.assertEqual(sum(j.balance(a) for a in set(['acct26', 'acct27'])), 5315)

    def test_split_294(self):
        print('split case 294: total=4879 parts=9')
        shares = split(4879, 9)
        self.assertEqual(sum(shares), 4879)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_295(self):
        print('to_cents case 295: 541.52')
        self.assertEqual(to_cents('541.52'), 54152)

    def test_journal_296(self):
        print('journal case 296')
        j = Journal()
        j.post('acct16', 3322)
        j.post('acct6', 623)
        j.post('acct27', 4558)
        j.post('acct10', 2505)
        j.post('acct11', 3828)
        j.post('acct10', 550)
        self.assertEqual(sum(j.balance(a) for a in set(['acct16', 'acct6', 'acct27', 'acct10', 'acct11', 'acct10'])), 15386)

    def test_split_297(self):
        print('split case 297: total=47148 parts=2')
        shares = split(47148, 2)
        self.assertEqual(sum(shares), 47148)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_298(self):
        print('to_cents case 298: 900.58')
        self.assertEqual(to_cents('900.58'), 90058)

    def test_journal_299(self):
        print('journal case 299')
        j = Journal()
        j.post('acct4', 3783)
        j.post('acct22', 999)
        j.post('acct13', 3648)
        self.assertEqual(sum(j.balance(a) for a in set(['acct4', 'acct22', 'acct13'])), 8430)

