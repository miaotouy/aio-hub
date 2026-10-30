"""Protect the guest input batch contract before any desktop action is sent."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("mutter_input", Path(__file__).with_name("mutter-input.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BatchContract(unittest.TestCase):
    def test_native_operations_use_monitor_local_coordinates(self):
        actions = [{"op": "click", "x": 639, "y": 479, "button": "right"},
                   {"op": "drag", "x": 0, "y": 0, "toX": 100, "toY": 120},
                   {"op": "key", "key": "Escape"}]
        self.assertEqual(module.validate({"actions": actions}, (640, 480)), actions)

    def test_invalid_later_operation_rejects_the_entire_batch(self):
        request = {"actions": [{"op": "click", "x": 10, "y": 10},
                               {"op": "move", "x": 640, "y": 10}]}
        with self.assertRaisesRegex(ValueError, "x must be"):
            module.validate(request, (640, 480))
        request["actions"][1] = {"op": "move", "x": float("nan"), "y": 10}
        with self.assertRaises(ValueError):
            module.validate(request)

    def test_existing_screenshot_is_preserved(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "capture.png"
            output.write_bytes(b"existing capture")
            with self.assertRaisesRegex(ValueError, "new file"):
                module.validate({"screenshot": str(output)})
            self.assertEqual(output.read_bytes(), b"existing capture")


if __name__ == "__main__":
    unittest.main()