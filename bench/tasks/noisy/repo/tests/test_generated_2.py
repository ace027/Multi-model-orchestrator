import logging
import sys
import unittest

from ledgerlib.journal import Journal
from ledgerlib.money import split, to_cents

logging.basicConfig(level=logging.DEBUG, stream=sys.stderr, format="%(asctime)s %(levelname)s %(name)s %(message)s")

class Generated2(unittest.TestCase):
    def test_to_cents_100(self):
        print('to_cents case 100: 655.90')
        self.assertEqual(to_cents('655.90'), 65590)

    def test_journal_101(self):
        print('journal case 101')
        j = Journal()
        j.post('acct25', 1835)
        j.post('acct6', 715)
        j.post('acct13', 3363)
        j.post('acct28', 3179)
        j.post('acct26', 1065)
        j.post('acct23', 3691)
        self.assertEqual(sum(j.balance(a) for a in set(['acct25', 'acct6', 'acct13', 'acct28', 'acct26', 'acct23'])), 13848)

    def test_split_102(self):
        print('split case 102: total=59446 parts=4')
        shares = split(59446, 4)
        self.assertEqual(sum(shares), 59446)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_103(self):
        print('to_cents case 103: 819.91')
        self.assertEqual(to_cents('819.91'), 81991)

    def test_journal_104(self):
        print('journal case 104')
        j = Journal()
        j.post('acct13', 4660)
        j.post('acct18', 4118)
        self.assertEqual(sum(j.balance(a) for a in set(['acct13', 'acct18'])), 8778)

    def test_split_105(self):
        print('split case 105: total=44971 parts=8')
        shares = split(44971, 8)
        self.assertEqual(sum(shares), 44971)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_106(self):
        print('to_cents case 106: 427.90')
        self.assertEqual(to_cents('427.90'), 42790)

    def test_journal_107(self):
        print('journal case 107')
        j = Journal()
        j.post('acct4', 1012)
        j.post('acct24', 1748)
        j.post('acct28', 1985)
        self.assertEqual(sum(j.balance(a) for a in set(['acct4', 'acct24', 'acct28'])), 4745)

    def test_split_108(self):
        print('split case 108: total=51148 parts=2')
        shares = split(51148, 2)
        self.assertEqual(sum(shares), 51148)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_109(self):
        print('to_cents case 109: 406.13')
        self.assertEqual(to_cents('406.13'), 40613)

    def test_journal_110(self):
        print('journal case 110')
        j = Journal()
        j.post('acct26', 129)
        j.post('acct30', 2855)
        j.post('acct11', 4135)
        j.post('acct9', 679)
        j.post('acct30', 305)
        j.post('acct23', 3612)
        self.assertEqual(sum(j.balance(a) for a in set(['acct26', 'acct30', 'acct11', 'acct9', 'acct30', 'acct23'])), 11715)

    def test_split_111(self):
        print('split case 111: total=44834 parts=9')
        shares = split(44834, 9)
        self.assertEqual(sum(shares), 44834)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_112(self):
        print('to_cents case 112: 552.35')
        self.assertEqual(to_cents('552.35'), 55235)

    def test_journal_113(self):
        print('journal case 113')
        j = Journal()
        j.post('acct16', 525)
        j.post('acct30', 3514)
        j.post('acct1', 288)
        j.post('acct7', 1417)
        self.assertEqual(sum(j.balance(a) for a in set(['acct16', 'acct30', 'acct1', 'acct7'])), 5744)

    def test_split_114(self):
        print('split case 114: total=69878 parts=6')
        shares = split(69878, 6)
        self.assertEqual(sum(shares), 69878)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_115(self):
        print('to_cents case 115: 899.91')
        self.assertEqual(to_cents('899.91'), 89991)

    def test_journal_116(self):
        print('journal case 116')
        j = Journal()
        j.post('acct16', 4246)
        j.post('acct5', 3606)
        j.post('acct17', 4036)
        self.assertEqual(sum(j.balance(a) for a in set(['acct16', 'acct5', 'acct17'])), 11888)

    def test_split_117(self):
        print('split case 117: total=75885 parts=2')
        shares = split(75885, 2)
        self.assertEqual(sum(shares), 75885)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_118(self):
        print('to_cents case 118: 993.31')
        self.assertEqual(to_cents('993.31'), 99331)

    def test_journal_119(self):
        print('journal case 119')
        j = Journal()
        j.post('acct15', 2378)
        j.post('acct17', 4601)
        j.post('acct18', 1347)
        self.assertEqual(sum(j.balance(a) for a in set(['acct15', 'acct17', 'acct18'])), 8326)

    def test_split_120(self):
        print('split case 120: total=68523 parts=9')
        shares = split(68523, 9)
        self.assertEqual(sum(shares), 68523)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_121(self):
        print('to_cents case 121: 733.96')
        self.assertEqual(to_cents('733.96'), 73396)

    def test_journal_122(self):
        print('journal case 122')
        j = Journal()
        j.post('acct10', 4993)
        j.post('acct22', 1706)
        j.post('acct13', 2495)
        j.post('acct28', 1157)
        self.assertEqual(sum(j.balance(a) for a in set(['acct10', 'acct22', 'acct13', 'acct28'])), 10351)

    def test_split_123(self):
        print('split case 123: total=71397 parts=9')
        shares = split(71397, 9)
        self.assertEqual(sum(shares), 71397)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_124(self):
        print('to_cents case 124: 357.77')
        self.assertEqual(to_cents('357.77'), 35777)

    def test_journal_125(self):
        print('journal case 125')
        j = Journal()
        j.post('acct16', 41)
        j.post('acct7', 4959)
        j.post('acct14', 3089)
        j.post('acct18', 228)
        j.post('acct4', 4410)
        j.post('acct17', 361)
        self.assertEqual(sum(j.balance(a) for a in set(['acct16', 'acct7', 'acct14', 'acct18', 'acct4', 'acct17'])), 13088)

    def test_split_126(self):
        print('split case 126: total=67636 parts=7')
        shares = split(67636, 7)
        self.assertEqual(sum(shares), 67636)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_127(self):
        print('to_cents case 127: 713.02')
        self.assertEqual(to_cents('713.02'), 71302)

    def test_journal_128(self):
        print('journal case 128')
        j = Journal()
        j.post('acct4', 4414)
        j.post('acct16', 3760)
        j.post('acct3', 3390)
        j.post('acct23', 3311)
        j.post('acct6', 2206)
        j.post('acct3', 2018)
        self.assertEqual(sum(j.balance(a) for a in set(['acct4', 'acct16', 'acct3', 'acct23', 'acct6', 'acct3'])), 19099)

    def test_split_129(self):
        print('split case 129: total=62019 parts=8')
        shares = split(62019, 8)
        self.assertEqual(sum(shares), 62019)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_130(self):
        print('to_cents case 130: 166.41')
        self.assertEqual(to_cents('166.41'), 16641)

    def test_journal_131(self):
        print('journal case 131')
        j = Journal()
        j.post('acct14', 3904)
        j.post('acct29', 4301)
        j.post('acct27', 2599)
        j.post('acct30', 890)
        self.assertEqual(sum(j.balance(a) for a in set(['acct14', 'acct29', 'acct27', 'acct30'])), 11694)

    def test_split_132(self):
        print('split case 132: total=25094 parts=7')
        shares = split(25094, 7)
        self.assertEqual(sum(shares), 25094)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_133(self):
        print('to_cents case 133: 809.88')
        self.assertEqual(to_cents('809.88'), 80988)

    def test_journal_134(self):
        print('journal case 134')
        j = Journal()
        j.post('acct30', 1061)
        j.post('acct9', 187)
        self.assertEqual(sum(j.balance(a) for a in set(['acct30', 'acct9'])), 1248)

    def test_split_135(self):
        print('split case 135: total=4670 parts=4')
        shares = split(4670, 4)
        self.assertEqual(sum(shares), 4670)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_136(self):
        print('to_cents case 136: 203.85')
        self.assertEqual(to_cents('203.85'), 20385)

    def test_journal_137(self):
        print('journal case 137')
        j = Journal()
        j.post('acct1', 2639)
        j.post('acct22', 2912)
        j.post('acct10', 2003)
        self.assertEqual(sum(j.balance(a) for a in set(['acct1', 'acct22', 'acct10'])), 7554)

    def test_split_138(self):
        print('split case 138: total=81235 parts=8')
        shares = split(81235, 8)
        self.assertEqual(sum(shares), 81235)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_139(self):
        print('to_cents case 139: 137.47')
        self.assertEqual(to_cents('137.47'), 13747)

    def test_journal_140(self):
        print('journal case 140')
        j = Journal()
        j.post('acct24', 2053)
        j.post('acct19', 1620)
        j.post('acct4', 4345)
        j.post('acct28', 3579)
        j.post('acct17', 191)
        self.assertEqual(sum(j.balance(a) for a in set(['acct24', 'acct19', 'acct4', 'acct28', 'acct17'])), 11788)

    def test_split_141(self):
        print('split case 141: total=49249 parts=7')
        shares = split(49249, 7)
        self.assertEqual(sum(shares), 49249)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_142(self):
        print('to_cents case 142: 693.82')
        self.assertEqual(to_cents('693.82'), 69382)

    def test_journal_143(self):
        print('journal case 143')
        j = Journal()
        j.post('acct6', 1789)
        j.post('acct18', 4339)
        j.post('acct7', 1771)
        j.post('acct28', 4448)
        j.post('acct21', 4806)
        j.post('acct18', 1118)
        self.assertEqual(sum(j.balance(a) for a in set(['acct6', 'acct18', 'acct7', 'acct28', 'acct21', 'acct18'])), 18271)

    def test_split_144(self):
        print('split case 144: total=30496 parts=6')
        shares = split(30496, 6)
        self.assertEqual(sum(shares), 30496)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_145(self):
        print('to_cents case 145: 237.41')
        self.assertEqual(to_cents('237.41'), 23741)

    def test_journal_146(self):
        print('journal case 146')
        j = Journal()
        j.post('acct20', 1595)
        j.post('acct11', 1788)
        j.post('acct29', 1594)
        j.post('acct30', 794)
        self.assertEqual(sum(j.balance(a) for a in set(['acct20', 'acct11', 'acct29', 'acct30'])), 5771)

    def test_split_147(self):
        print('split case 147: total=17555 parts=4')
        shares = split(17555, 4)
        self.assertEqual(sum(shares), 17555)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_to_cents_148(self):
        print('to_cents case 148: 173.72')
        self.assertEqual(to_cents('173.72'), 17372)

    def test_journal_149(self):
        print('journal case 149')
        j = Journal()
        j.post('acct9', 795)
        j.post('acct13', 3562)
        self.assertEqual(sum(j.balance(a) for a in set(['acct9', 'acct13'])), 4357)

