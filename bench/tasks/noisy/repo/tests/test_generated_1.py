import logging
import sys
import unittest

from ledgerlib.journal import Journal
from ledgerlib.money import split, to_cents

logging.basicConfig(level=logging.DEBUG, stream=sys.stderr, format="%(asctime)s %(levelname)s %(name)s %(message)s")

class Generated1(unittest.TestCase):
    def test_journal_50(self):
        print('journal case 50')
        j = Journal()
        j.post('acct6', 3022)
        j.post('acct10', 4350)
        self.assertEqual(sum(j.balance(a) for a in set(['acct6', 'acct10'])), 7372)

    def test_split_51(self):
        print('split case 51: total=74996 parts=3')
        shares = split(74996, 3)
        self.assertEqual(sum(shares), 74996)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_52(self):
        print('to_cents case 52: 120.83')
        self.assertEqual(to_cents('120.83'), 12083)

    def test_journal_53(self):
        print('journal case 53')
        j = Journal()
        j.post('acct5', 4276)
        j.post('acct29', 4788)
        j.post('acct15', 1150)
        j.post('acct11', 4833)
        self.assertEqual(sum(j.balance(a) for a in set(['acct5', 'acct29', 'acct15', 'acct11'])), 15047)

    def test_split_54(self):
        print('split case 54: total=4599 parts=1')
        shares = split(4599, 1)
        self.assertEqual(sum(shares), 4599)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_55(self):
        print('to_cents case 55: 622.32')
        self.assertEqual(to_cents('622.32'), 62232)

    def test_journal_56(self):
        print('journal case 56')
        j = Journal()
        j.post('acct23', 4902)
        j.post('acct10', 614)
        j.post('acct2', 3951)
        j.post('acct1', 552)
        self.assertEqual(sum(j.balance(a) for a in set(['acct23', 'acct10', 'acct2', 'acct1'])), 10019)

    def test_split_57(self):
        print('split case 57: total=95748 parts=5')
        shares = split(95748, 5)
        self.assertEqual(sum(shares), 95748)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_58(self):
        print('to_cents case 58: 417.99')
        self.assertEqual(to_cents('417.99'), 41799)

    def test_journal_59(self):
        print('journal case 59')
        j = Journal()
        j.post('acct3', 4474)
        j.post('acct3', 3013)
        j.post('acct15', 365)
        self.assertEqual(sum(j.balance(a) for a in set(['acct3', 'acct3', 'acct15'])), 7852)

    def test_split_60(self):
        print('split case 60: total=96612 parts=3')
        shares = split(96612, 3)
        self.assertEqual(sum(shares), 96612)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_61(self):
        print('to_cents case 61: 447.76')
        self.assertEqual(to_cents('447.76'), 44776)

    def test_journal_62(self):
        print('journal case 62')
        j = Journal()
        j.post('acct3', 637)
        j.post('acct22', 3418)
        j.post('acct16', 248)
        j.post('acct29', 4096)
        self.assertEqual(sum(j.balance(a) for a in set(['acct3', 'acct22', 'acct16', 'acct29'])), 8399)

    def test_split_63(self):
        print('split case 63: total=75080 parts=1')
        shares = split(75080, 1)
        self.assertEqual(sum(shares), 75080)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_64(self):
        print('to_cents case 64: 819.14')
        self.assertEqual(to_cents('819.14'), 81914)

    def test_journal_65(self):
        print('journal case 65')
        j = Journal()
        j.post('acct13', 658)
        j.post('acct19', 743)
        j.post('acct1', 947)
        j.post('acct20', 2108)
        j.post('acct3', 3410)
        self.assertEqual(sum(j.balance(a) for a in set(['acct13', 'acct19', 'acct1', 'acct20', 'acct3'])), 7866)

    def test_split_66(self):
        print('split case 66: total=95448 parts=6')
        shares = split(95448, 6)
        self.assertEqual(sum(shares), 95448)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_67(self):
        print('to_cents case 67: 509.13')
        self.assertEqual(to_cents('509.13'), 50913)

    def test_journal_68(self):
        print('journal case 68')
        j = Journal()
        j.post('acct15', 4250)
        j.post('acct15', 4216)
        j.post('acct15', 245)
        j.post('acct27', 2542)
        j.post('acct18', 4926)
        j.post('acct3', 719)
        self.assertEqual(sum(j.balance(a) for a in set(['acct15', 'acct15', 'acct15', 'acct27', 'acct18', 'acct3'])), 16898)

    def test_split_69(self):
        print('split case 69: total=63040 parts=1')
        shares = split(63040, 1)
        self.assertEqual(sum(shares), 63040)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_70(self):
        print('to_cents case 70: 301.75')
        self.assertEqual(to_cents('301.75'), 30175)

    def test_journal_71(self):
        print('journal case 71')
        j = Journal()
        j.post('acct16', 3984)
        j.post('acct25', 2096)
        self.assertEqual(sum(j.balance(a) for a in set(['acct16', 'acct25'])), 6080)

    def test_split_72(self):
        print('split case 72: total=1483 parts=6')
        shares = split(1483, 6)
        self.assertEqual(sum(shares), 1483)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_73(self):
        print('to_cents case 73: 394.56')
        self.assertEqual(to_cents('394.56'), 39456)

    def test_journal_74(self):
        print('journal case 74')
        j = Journal()
        j.post('acct22', 4247)
        j.post('acct20', 1390)
        j.post('acct7', 2806)
        self.assertEqual(sum(j.balance(a) for a in set(['acct22', 'acct20', 'acct7'])), 8443)

    def test_split_75(self):
        print('split case 75: total=86507 parts=8')
        shares = split(86507, 8)
        self.assertEqual(sum(shares), 86507)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_76(self):
        print('to_cents case 76: 653.14')
        self.assertEqual(to_cents('653.14'), 65314)

    def test_journal_77(self):
        print('journal case 77')
        j = Journal()
        j.post('acct11', 2053)
        j.post('acct13', 1627)
        j.post('acct22', 3530)
        self.assertEqual(sum(j.balance(a) for a in set(['acct11', 'acct13', 'acct22'])), 7210)

    def test_split_78(self):
        print('split case 78: total=98911 parts=4')
        shares = split(98911, 4)
        self.assertEqual(sum(shares), 98911)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_79(self):
        print('to_cents case 79: 280.74')
        self.assertEqual(to_cents('280.74'), 28074)

    def test_journal_80(self):
        print('journal case 80')
        j = Journal()
        j.post('acct8', 1116)
        j.post('acct19', 1103)
        j.post('acct30', 4068)
        j.post('acct11', 2874)
        j.post('acct7', 333)
        self.assertEqual(sum(j.balance(a) for a in set(['acct8', 'acct19', 'acct30', 'acct11', 'acct7'])), 9494)

    def test_split_81(self):
        print('split case 81: total=93221 parts=2')
        shares = split(93221, 2)
        self.assertEqual(sum(shares), 93221)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_82(self):
        print('to_cents case 82: 362.80')
        self.assertEqual(to_cents('362.80'), 36280)

    def test_journal_83(self):
        print('journal case 83')
        j = Journal()
        j.post('acct4', 2255)
        j.post('acct15', 1754)
        j.post('acct16', 3392)
        self.assertEqual(sum(j.balance(a) for a in set(['acct4', 'acct15', 'acct16'])), 7401)

    def test_split_84(self):
        print('split case 84: total=50142 parts=9')
        shares = split(50142, 9)
        self.assertEqual(sum(shares), 50142)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_85(self):
        print('to_cents case 85: 647.33')
        self.assertEqual(to_cents('647.33'), 64733)

    def test_journal_86(self):
        print('journal case 86')
        j = Journal()
        j.post('acct23', 3707)
        j.post('acct27', 2625)
        j.post('acct27', 612)
        j.post('acct20', 258)
        self.assertEqual(sum(j.balance(a) for a in set(['acct23', 'acct27', 'acct27', 'acct20'])), 7202)

    def test_split_87(self):
        print('split case 87: total=36455 parts=1')
        shares = split(36455, 1)
        self.assertEqual(sum(shares), 36455)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_88(self):
        print('to_cents case 88: 889.00')
        self.assertEqual(to_cents('889.00'), 88900)

    def test_journal_89(self):
        print('journal case 89')
        j = Journal()
        j.post('acct19', 4621)
        j.post('acct12', 157)
        j.post('acct10', 1114)
        j.post('acct21', 3320)
        self.assertEqual(sum(j.balance(a) for a in set(['acct19', 'acct12', 'acct10', 'acct21'])), 9212)

    def test_split_90(self):
        print('split case 90: total=59616 parts=4')
        shares = split(59616, 4)
        self.assertEqual(sum(shares), 59616)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_91(self):
        print('to_cents case 91: 32.40')
        self.assertEqual(to_cents('32.40'), 3240)

    def test_journal_92(self):
        print('journal case 92')
        j = Journal()
        j.post('acct8', 385)
        j.post('acct25', 945)
        j.post('acct5', 3658)
        j.post('acct26', 894)
        self.assertEqual(sum(j.balance(a) for a in set(['acct8', 'acct25', 'acct5', 'acct26'])), 5882)

    def test_split_93(self):
        print('split case 93: total=82571 parts=9')
        shares = split(82571, 9)
        self.assertEqual(sum(shares), 82571)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_94(self):
        print('to_cents case 94: 858.57')
        self.assertEqual(to_cents('858.57'), 85857)

    def test_journal_95(self):
        print('journal case 95')
        j = Journal()
        j.post('acct3', 3893)
        j.post('acct22', 2098)
        j.post('acct7', 1464)
        j.post('acct7', 89)
        self.assertEqual(sum(j.balance(a) for a in set(['acct3', 'acct22', 'acct7', 'acct7'])), 7544)

    def test_split_96(self):
        print('split case 96: total=98967 parts=8')
        shares = split(98967, 8)
        self.assertEqual(sum(shares), 98967)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_97(self):
        print('to_cents case 97: 701.03')
        self.assertEqual(to_cents('701.03'), 70103)

    def test_journal_98(self):
        print('journal case 98')
        j = Journal()
        j.post('acct6', 2232)
        j.post('acct8', 2833)
        self.assertEqual(sum(j.balance(a) for a in set(['acct6', 'acct8'])), 5065)

    def test_split_99(self):
        print('split case 99: total=70739 parts=9')
        shares = split(70739, 9)
        self.assertEqual(sum(shares), 70739)
        self.assertLessEqual(max(shares) - min(shares), 1)

