import re
import sys

def process_file(filepath, replacements, is_server=False, prefix=""):
    with open(filepath, 'r') as f:
        content = f.read()

    # Add imports
    if is_server:
        if "import { getT }" not in content:
            content = content.replace('import', 'import { getT } from "@/lib/serverI18n";\nimport', 1)
    else:
        if "import { useI18n }" not in content:
            content = content.replace('import', 'import { useI18n } from "@/components/I18nProvider";\nimport', 1)

    # Add hook/getT
    if is_server:
        if "const t = getT();" not in content:
            content = re.sub(r'(export default function [a-zA-Z0-9_]+\s*\([^)]*\)\s*\{)', r'\1\n  const t = getT();', content)
    else:
        if "const { t } = useI18n();" not in content:
            content = re.sub(r'(export default function [a-zA-Z0-9_]+\s*\([^)]*\)\s*\{)', r'\1\n  const { t } = useI18n();', content)

    for old, new_val in replacements:
        content = content.replace(old, new_val)

    with open(filepath, 'w') as f:
        f.write(content)

