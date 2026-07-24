import os

for root, dirs, files in os.walk("src"):
    for file in files:
        if file.endswith((".js", ".jsx")):
            path = os.path.join(root, file)
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
                if "qr" in content.lower() or "qrcode" in content.lower():
                    print(f"FOUND in {path}")
                    # find all lines with qr or qrcode
                    lines = content.splitlines()
                    for idx, line in enumerate(lines):
                        if "qr" in line.lower() or "qrcode" in line.lower():
                            print(f"  {idx+1}: {line.strip()}")
