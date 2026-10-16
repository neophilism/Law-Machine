import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('status_validator', ROOT / 'scripts/validate_e2eesa_status.py')
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)

class SecurityStatusTests(unittest.TestCase):
    def setUp(self):
        self.status = json.loads((ROOT / 'security/e2eesa-status.json').read_text())

    def test_pending_independent_review_is_accepted(self):
        self.assertFalse(self.status['independentReview']['complete'])
        validator.validate(ROOT, self.status)

    def test_completed_testing_requires_implemented_source(self):
        self.status['testing']['complete'] = True
        with self.assertRaises(ValueError):
            validator.validate(ROOT, self.status)

    def test_completed_expert_review_requires_tested_source(self):
        self.status['independentReview']['complete'] = True
        with self.assertRaises(ValueError):
            validator.validate(ROOT, self.status)

    def test_evidence_path_cannot_escape_repository(self):
        self.status['testing']['evidence'] = ['../private']
        with self.assertRaises(ValueError):
            validator.validate(ROOT, self.status)

    def test_unpinned_standard_rejected(self):
        self.status['standard']['commit'] = 'main'
        with self.assertRaises(ValueError):
            validator.validate(ROOT, self.status)

if __name__ == '__main__':
    unittest.main()
