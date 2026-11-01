"""Architecture boundary test for WriteAssist Modular Monolith.

Enforces:
1. Public boundary rule: modules meet strictly via their package roots (`writeassist.modules.<x>`).
   Importing `.infrastructure` or `.application` from outside `<x>` is forbidden.
2. Inward dependency rule: `domain.py` has ZERO I/O (no urllib, socket, http, subprocess, etc.).
3. Composition root isolation: No module imports `bootstrap` or `app`.
"""

import ast
from pathlib import Path
import sys

SRC = Path(__file__).resolve().parents[1] / "src" / "writeassist"
MODULES_DIR = SRC / "modules"
MODULES = sorted(p.name for p in MODULES_DIR.iterdir() if (p / "__init__.py").exists())


def owner(path: Path) -> str | None:
    parts = path.relative_to(SRC).parts
    return parts[1] if parts[0] == "modules" and len(parts) > 2 else None


def resolve_import_from(path: Path, node: ast.ImportFrom) -> str:
    if node.level == 0:
        return node.module or ""
    # Relative import resolution
    package = list(path.relative_to(SRC.parent).with_suffix("").parts)[:-1]
    if path.name == "__init__.py":
        package = list(path.relative_to(SRC.parent).parts)[:-1]
    base = package[: len(package) - node.level + 1]
    return ".".join(base + ([node.module] if node.module else []))


def test_boundaries() -> list[str]:
    violations: list[str] = []
    forbidden_domain_io = {"urllib", "http", "socket", "subprocess", "os", "sys", "shutil", "requests"}

    for path in SRC.rglob("*.py"):
        mine = owner(path)
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))

        # Check domain purity
        if path.name == "domain.py":
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        top = alias.name.split(".")[0]
                        if top in forbidden_domain_io:
                            violations.append(f"{path.relative_to(SRC)}:{node.lineno} domain imports I/O module {top}")
                elif isinstance(node, ast.ImportFrom):
                    top = (node.module or "").split(".")[0]
                    if top in forbidden_domain_io:
                        violations.append(f"{path.relative_to(SRC)}:{node.lineno} domain imports I/O module {top}")

        # Check module boundary violations
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                target = resolve_import_from(path, node).split(".")
                # Check cross-module reaching
                if len(target) >= 3 and target[:2] == ["writeassist", "modules"] and target[2] in MODULES:
                    other = target[2]
                    if other != mine and len(target) > 3:
                        violations.append(
                            f"{path.relative_to(SRC)}:{node.lineno} cross-module reach: {'.'.join(target)}"
                        )

                # Check module importing composition root
                if mine and len(target) >= 2 and target[0] == "writeassist" and target[1] in ("app", "bootstrap"):
                    violations.append(
                        f"{path.relative_to(SRC)}:{node.lineno} module imports composition root: {'.'.join(target)}"
                    )

    return violations


def main() -> int:
    bad = test_boundaries()
    if bad:
        print("Architecture Boundary Test FAILED:\n  " + "\n  ".join(bad))
        return 1
    print(f"Architecture Boundary Test PASSED ({len(MODULES)} bounded modules: {', '.join(MODULES)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
