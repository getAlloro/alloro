#!/usr/bin/env python3
"""
Codemod: catch (X: any) → catch (X: unknown)
  - replaces catch binding :any with :unknown
  - replaces X?.message with getErrorMessage(X)
  - replaces X.message (non-chained) with getErrorMessage(X)
  - adds import { getErrorMessage } from "...lib/errorMessage" when used

Skips PMS-protected files.
"""
import os
import re

SKIP_PATTERNS = [
    'api/pms.ts',
    'PMSVisualPillars.tsx',
    'PmsDashboardSurface.tsx',
    'PmsHubSurface.tsx',
    'PmsController.ts',
]

SRC_ROOT = '/Users/rustinedave/Desktop/alloro/frontend/src'


def should_skip(path):
    return any(s in path for s in SKIP_PATTERNS)


def calc_rel_import(file_path):
    """Return relative import string for lib/errorMessage from file_path."""
    file_dir = os.path.dirname(file_path)
    lib_dir = os.path.join(SRC_ROOT, 'lib')
    rel = os.path.relpath(lib_dir, file_dir)
    # Normalize to forward slashes
    rel = rel.replace('\\', '/')
    if not rel.startswith('.'):
        rel = './' + rel
    return f'{rel}/errorMessage'


def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    # Find all distinct catch variable names bound as :any
    catch_vars = set(re.findall(r'catch\s*\(\s*(\w+)\s*:\s*any\s*\)', content))
    if not catch_vars:
        return False

    # 1. Replace catch (X: any) → catch (X: unknown)
    content = re.sub(
        r'(catch\s*\(\s*\w+\s*:\s*)any(\s*\))',
        r'\1unknown\2',
        content
    )

    # 2. For each catch var replace .message access
    needs_err_import = False
    for var in sorted(catch_vars):  # sorted for determinism
        v = re.escape(var)

        # var?.message → getErrorMessage(var)
        new = re.sub(rf'\b{v}\?\.message\b', f'getErrorMessage({var})', content)
        if new != content:
            needs_err_import = True
        content = new

        # var.message (not followed by another .) → getErrorMessage(var)
        new = re.sub(rf'\b{v}\.message\b(?!\.)', f'getErrorMessage({var})', content)
        if new != content:
            needs_err_import = True
        content = new

    # 3. Add getErrorMessage import if needed and not already present
    if needs_err_import and 'getErrorMessage' not in content:
        rel = calc_rel_import(filepath)
        import_stmt = f'import {{ getErrorMessage }} from "{rel}";'

        # Insert after last import line
        last_import = None
        for m in re.finditer(r'^import\s.+;$', content, re.MULTILINE):
            last_import = m
        if last_import:
            pos = last_import.end()
            content = content[:pos] + '\n' + import_stmt + content[pos:]
        else:
            content = import_stmt + '\n' + content

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False


def main():
    changed = []
    for root, dirs, files in os.walk(SRC_ROOT):
        dirs[:] = [d for d in dirs if d != 'node_modules']
        for fname in files:
            if not (fname.endswith('.ts') or fname.endswith('.tsx')):
                continue
            fpath = os.path.join(root, fname)
            if should_skip(fpath):
                continue
            if process_file(fpath):
                rel = fpath[len(SRC_ROOT) + 1:]
                changed.append(rel)

    print(f'Modified {len(changed)} files:')
    for f in sorted(changed):
        print(f'  {f}')


if __name__ == '__main__':
    main()
