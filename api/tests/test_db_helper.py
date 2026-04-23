import os
import tempfile
import unittest

db_file = tempfile.NamedTemporaryFile(prefix="opd-test-", suffix=".db", delete=False)
db_file.close()
os.environ["DATABASE_URL"] = f"sqlite:///{db_file.name}"

from app.db.database import create_tables
from app.db.db_helper import get_cloud_token_db, get_credentials, save_credentials, save_token


class DbHelperTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        create_tables()

    def test_get_credentials_returns_none_when_not_set(self):
        self.assertEqual(get_credentials(), {"email": None, "password": None})

    def test_save_credentials_updates_existing_values(self):
        save_credentials("first@example.com", "first")
        save_credentials("second@example.com", "second")
        self.assertEqual(
            get_credentials(),
            {"email": "second@example.com", "password": "second"},
        )

    def test_save_token_updates_existing_value(self):
        save_token("token-1")
        save_token("token-2")
        self.assertEqual(get_cloud_token_db(), "token-2")


if __name__ == "__main__":
    unittest.main()
