import os, re

for root, dirs, files in os.walk('/home/evan/projects/Garden-website/components'):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            path = os.path.join(root, file)
            with open(path, 'r') as f:
                content = f.read()
            
            # Very crude: if 'disabled' or 'is-paused' in file, try to append is-disabled-hatch
            # But the prompt might just be okay with doing it in CSS if we do it smartly.
            pass

