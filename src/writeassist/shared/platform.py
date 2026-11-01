"""Operating system and packaging platform flags."""

import sys

IS_WINDOWS = sys.platform.startswith("win32")
IS_MAC = sys.platform == "darwin"
IS_LINUX = sys.platform.startswith("linux")
FROZEN = getattr(sys, "frozen", False)
