import unittest

from shop.cart import Cart


class CartTest(unittest.TestCase):
    def test_total_sums_items(self):
        cart = Cart()
        cart.add("apple", 120, 3)
        cart.add("pear", 200)
        self.assertEqual(cart.total_cents(), 560)

    def test_rejects_bad_quantity(self):
        with self.assertRaises(ValueError):
            Cart().add("apple", 120, 0)


if __name__ == "__main__":
    unittest.main()
