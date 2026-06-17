#!/usr/bin/env python3
"""
Add `import { getErrorMessage } from "...lib/errorMessage"` to files
that use getErrorMessage but don't yet import it.
"""
import os
import re

SRC_ROOT = '/Users/rustinedave/Desktop/alloro/frontend/src'


def calc_rel_import(file_path):
    file_dir = os.path.dirname(file_path)
    lib_dir = os.path.join(SRC_ROOT, 'lib')
    rel = os.path.relpath(lib_dir, file_dir).replace('\\', '/')
    if not rel.startswith('.'):
        rel = './' + rel
    return f'{rel}/errorMessage'


def process(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    if 'getErrorMessage' not in content:
        return False
    if re.search(r'import\s*\{[^}]*getErrorMessage[^}]*\}', content):
        return False  # already imported

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

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    return True


def main():
    changed = []
    for root, dirs, files in os.walk(SRC_ROOT):
        dirs[:] = [d for d in dirs if d != 'node_modules']
        for fname in files:
            if not (fname.endswith('.ts') or fname.endswith('.tsx')):
                continue
            fpath = os.path.join(root, fname)
            if process(fpath):
                changed.append(fpath[len(SRC_ROOT) + 1:])

    print(f'Added imports to {len(changed)} files:')
    for f in sorted(changed):
        print(f'  {f}')


if __name__ == '__main__':
    main()
