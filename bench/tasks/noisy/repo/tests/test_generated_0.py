import logging
import sys
import unittest

from ledgerlib.journal import Journal
from ledgerlib.money import split, to_cents

logging.basicConfig(level=logging.DEBUG, stream=sys.stderr, format="%(asctime)s %(levelname)s %(name)s %(message)s")

class Generated0(unittest.TestCase):
    def test_split_0(self):
        print('split case 0: total=59295 parts=9')
        shares = split(59295, 9)
        self.assertEqual(sum(shares), 59295)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_1(self):
        print('to_cents case 1: 610.33')
        self.assertEqual(to_cents('610.33'), 61033)

    def test_journal_2(self):
        print('journal case 2')
        j = Journal()
        j.post('acct17', 4194)
        j.post('acct28', 3898)
        j.post('acct19', 1526)
        j.post('acct7', 772)
        j.post('acct6', 3659)
        self.assertEqual(sum(j.balance(a) for a in set(['acct17', 'acct28', 'acct19', 'acct7', 'acct6'])), 14049)

    def test_split_3(self):
        print('split case 3: total=39768 parts=3')
        shares = split(39768, 3)
        self.assertEqual(sum(shares), 39768)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_4(self):
        print('to_cents case 4: 118.84')
        self.assertEqual(to_cents('118.84'), 11884)

    def test_journal_5(self):
        print('journal case 5')
        j = Journal()
        j.post('acct26', 3246)
        j.post('acct29', 3711)
        j.post('acct23', 1291)
        j.post('acct21', 123)
        j.post('acct2', 4329)
        j.post('acct20', 518)
        self.assertEqual(sum(j.balance(a) for a in set(['acct26', 'acct29', 'acct23', 'acct21', 'acct2', 'acct20'])), 13218)

    def test_split_6(self):
        print('split case 6: total=7806 parts=1')
        shares = split(7806, 1)
        self.assertEqual(sum(shares), 7806)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_7(self):
        print('to_cents case 7: 249.30')
        self.assertEqual(to_cents('249.30'), 24930)

    def test_journal_8(self):
        print('journal case 8')
        j = Journal()
        j.post('acct20', 3801)
        j.post('acct1', 2673)
        j.post('acct25', 3609)
        self.assertEqual(sum(j.balance(a) for a in set(['acct20', 'acct1', 'acct25'])), 10083)

    def test_split_9(self):
        print('split case 9: total=77459 parts=4')
        shares = split(77459, 4)
        self.assertEqual(sum(shares), 77459)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_10(self):
        print('to_cents case 10: 680.42')
        self.assertEqual(to_cents('680.42'), 68042)

    def test_journal_11(self):
        print('journal case 11')
        j = Journal()
        j.post('acct21', 38)
        j.post('acct10', 697)
        j.post('acct16', 3747)
        self.assertEqual(sum(j.balance(a) for a in set(['acct21', 'acct10', 'acct16'])), 4482)

    def test_split_12(self):
        print('split case 12: total=85827 parts=5')
        shares = split(85827, 5)
        self.assertEqual(sum(shares), 85827)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_13(self):
        print('to_cents case 13: 533.17')
        self.assertEqual(to_cents('533.17'), 53317)

    def test_journal_14(self):
        print('journal case 14')
        j = Journal()
        j.post('acct30', 1882)
        j.post('acct27', 4202)
        j.post('acct3', 2368)
        j.post('acct23', 244)
        j.post('acct9', 576)
        j.post('acct11', 4614)
        self.assertEqual(sum(j.balance(a) for a in set(['acct30', 'acct27', 'acct3', 'acct23', 'acct9', 'acct11'])), 13886)

    def test_split_15(self):
        print('split case 15: total=14147 parts=7')
        shares = split(14147, 7)
        self.assertEqual(sum(shares), 14147)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_16(self):
        print('to_cents case 16: 141.29')
        self.assertEqual(to_cents('141.29'), 14129)

    def test_journal_17(self):
        print('journal case 17')
        j = Journal()
        j.post('acct13', 5)
        j.post('acct3', 1750)
        j.post('acct1', 1719)
        j.post('acct28', 429)
        self.assertEqual(sum(j.balance(a) for a in set(['acct13', 'acct3', 'acct1', 'acct28'])), 3903)

    def test_split_18(self):
        print('split case 18: total=61603 parts=7')
        shares = split(61603, 7)
        self.assertEqual(sum(shares), 61603)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_19(self):
        print('to_cents case 19: 929.16')
        self.assertEqual(to_cents('929.16'), 92916)

    def test_journal_20(self):
        print('journal case 20')
        j = Journal()
        j.post('acct14', 2211)
        j.post('acct3', 2760)
        j.post('acct19', 714)
        j.post('acct21', 2550)
        j.post('acct7', 2725)
        self.assertEqual(sum(j.balance(a) for a in set(['acct14', 'acct3', 'acct19', 'acct21', 'acct7'])), 10960)

    def test_split_21(self):
        print('split case 21: total=1986 parts=7')
        shares = split(1986, 7)
        self.assertEqual(sum(shares), 1986)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_22(self):
        print('to_cents case 22: 993.57')
        self.assertEqual(to_cents('993.57'), 99357)

    def test_journal_23(self):
        print('journal case 23')
        j = Journal()
        j.post('acct5', 828)
        j.post('acct8', 90)
        self.assertEqual(sum(j.balance(a) for a in set(['acct5', 'acct8'])), 918)

    def test_split_24(self):
        print('split case 24: total=7851 parts=8')
        shares = split(7851, 8)
        self.assertEqual(sum(shares), 7851)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_25(self):
        print('to_cents case 25: 638.08')
        self.assertEqual(to_cents('638.08'), 63808)

    def test_journal_26(self):
        print('journal case 26')
        j = Journal()
        j.post('acct22', 3666)
        j.post('acct18', 4169)
        j.post('acct7', 1563)
        self.assertEqual(sum(j.balance(a) for a in set(['acct22', 'acct18', 'acct7'])), 9398)

    def test_split_27(self):
        print('split case 27: total=95931 parts=3')
        shares = split(95931, 3)
        self.assertEqual(sum(shares), 95931)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_28(self):
        print('to_cents case 28: 549.49')
        self.assertEqual(to_cents('549.49'), 54949)

    def test_journal_29(self):
        print('journal case 29')
        j = Journal()
        j.post('acct4', 2211)
        j.post('acct13', 4856)
        j.post('acct14', 2492)
        j.post('acct7', 161)
        j.post('acct1', 1727)
        self.assertEqual(sum(j.balance(a) for a in set(['acct4', 'acct13', 'acct14', 'acct7', 'acct1'])), 11447)

    def test_split_30(self):
        print('split case 30: total=24551 parts=7')
        shares = split(24551, 7)
        self.assertEqual(sum(shares), 24551)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_31(self):
        print('to_cents case 31: 789.07')
        self.assertEqual(to_cents('789.07'), 78907)

    def test_journal_32(self):
        print('journal case 32')
        j = Journal()
        j.post('acct4', 79)
        j.post('acct2', 5000)
        j.post('acct5', 2695)
        j.post('acct7', 2428)
        j.post('acct15', 3164)
        j.post('acct9', 602)
        self.assertEqual(sum(j.balance(a) for a in set(['acct4', 'acct2', 'acct5', 'acct7', 'acct15', 'acct9'])), 13968)

    def test_split_33(self):
        print('split case 33: total=9737 parts=2')
        shares = split(9737, 2)
        self.assertEqual(sum(shares), 9737)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_34(self):
        print('to_cents case 34: 273.59')
        self.assertEqual(to_cents('273.59'), 27359)

    def test_journal_35(self):
        print('journal case 35')
        j = Journal()
        j.post('acct21', 3713)
        j.post('acct8', 1043)
        j.post('acct1', 4811)
        j.post('acct20', 3963)
        j.post('acct12', 4707)
        j.post('acct12', 1112)
        self.assertEqual(sum(j.balance(a) for a in set(['acct21', 'acct8', 'acct1', 'acct20', 'acct12', 'acct12'])), 19349)

    def test_split_36(self):
        print('split case 36: total=50607 parts=3')
        shares = split(50607, 3)
        self.assertEqual(sum(shares), 50607)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_37(self):
        print('to_cents case 37: 822.14')
        self.assertEqual(to_cents('822.14'), 82214)

    def test_journal_38(self):
        print('journal case 38')
        j = Journal()
        j.post('acct10', 2044)
        j.post('acct30', 1555)
        j.post('acct8', 1299)
        self.assertEqual(sum(j.balance(a) for a in set(['acct10', 'acct30', 'acct8'])), 4898)

    def test_split_39(self):
        print('split case 39: total=96918 parts=9')
        shares = split(96918, 9)
        self.assertEqual(sum(shares), 96918)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_40(self):
        print('to_cents case 40: 257.67')
        self.assertEqual(to_cents('257.67'), 25767)

    def test_journal_41(self):
        print('journal case 41')
        j = Journal()
        j.post('acct29', 389)
        j.post('acct16', 851)
        j.post('acct20', 894)
        j.post('acct3', 318)
        j.post('acct14', 4198)
        self.assertEqual(sum(j.balance(a) for a in set(['acct29', 'acct16', 'acct20', 'acct3', 'acct14'])), 6650)

    def test_split_42(self):
        print('split case 42: total=33447 parts=4')
        shares = split(33447, 4)
        self.assertEqual(sum(shares), 33447)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_43(self):
        print('to_cents case 43: 969.70')
        self.assertEqual(to_cents('969.70'), 96970)

    def test_journal_44(self):
        print('journal case 44')
        j = Journal()
        j.post('acct9', 4023)
        j.post('acct14', 2404)
        j.post('acct27', 4261)
        j.post('acct29', 1438)
        j.post('acct20', 564)
        self.assertEqual(sum(j.balance(a) for a in set(['acct9', 'acct14', 'acct27', 'acct29', 'acct20'])), 12690)

    def test_split_45(self):
        print('split case 45: total=16568 parts=4')
        shares = split(16568, 4)
        self.assertEqual(sum(shares), 16568)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_46(self):
        print('to_cents case 46: 628.22')
        self.assertEqual(to_cents('628.22'), 62822)

    def test_journal_47(self):
        print('journal case 47')
        j = Journal()
        j.post('acct21', 1740)
        j.post('acct28', 1671)
        j.post('acct20', 136)
        j.post('acct20', 567)
        j.post('acct3', 2206)
        j.post('acct9', 3371)
        self.assertEqual(sum(j.balance(a) for a in set(['acct21', 'acct28', 'acct20', 'acct20', 'acct3', 'acct9'])), 9691)

    def test_split_48(self):
        print('split case 48: total=58420 parts=4')
        shares = split(58420, 4)
        self.assertEqual(sum(shares), 58420)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_49(self):
        print('to_cents case 49: 79.24')
        self.assertEqual(to_cents('79.24'), 7924)

