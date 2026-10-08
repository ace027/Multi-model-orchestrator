import unittest

from ingest.records import ingest, parse_record


class RecordsTest(unittest.TestCase):
    def test_offset_timestamp(self):
        r = parse_record('{"source": "s1", "at": "2026-09-30T12:00:00+02:00", "value": 1.5}')
        self.assertEqual(r.at.utcoffset().total_seconds(), 7200)

    def test_rejects_bad_json(self):
        self.assertEqual(ingest(["{nope"])[1], 1)


if __name__ == "__main__":
    unittest.main()
