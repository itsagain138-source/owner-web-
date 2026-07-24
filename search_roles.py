import os

for root, dirs, files in os.walk(r"e:\complete demo\owner_web\src"):
    for file in files:
        if file.endswith((".js", ".jsx")):
            path = os.path.join(root, file)
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
                if "role" in content.lower() or "admin" in content.lower():
                    print(f"FOUND in {path}")
                    lines = content.splitlines()
                    for idx, line in enumerate(lines):
                        if "<select" in line.lower() or 'value="guard"' in line.lower() or "option" in line.lower():
                            if len(line.strip()) < 120:
                                print(f"  {idx+1}: {line.strip()}")
