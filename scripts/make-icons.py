"""Regenerate the simple magnifier artwork (requires Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw
import json

root = Path(__file__).resolve().parent.parent
scale = 8
image = Image.new("RGBA", (128 * scale, 128 * scale))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((0, 0, 128 * scale - 1, 128 * scale - 1), radius=28 * scale, fill="#164e63")
draw.ellipse((27 * scale, 27 * scale, 81 * scale, 81 * scale), outline="white", width=10 * scale)
for points in [(75, 75, 101, 101), (40, 54, 68, 54), (54, 40, 54, 68)]:
    draw.line(tuple(v * scale for v in points), fill="white", width=10 * scale)
    for x, y in [points[:2], points[2:]]:
        draw.ellipse(((x - 5) * scale, (y - 5) * scale, (x + 5) * scale, (y + 5) * scale), fill="white")
for size in [48, 128]:
    image.resize((size, size), Image.Resampling.LANCZOS).save(root / f"extension/icons/search-{size}.png")
app = root / "safari/Proper Search/Proper Search"
if app.exists():
    assets = app / "Assets.xcassets/AppIcon.appiconset"
    for entry in json.loads((assets / "Contents.json").read_text())["images"]:
        if "filename" not in entry:
            continue
        size = int(float(entry["size"].split("x")[0]) * float(entry["scale"].removesuffix("x")))
        image.resize((size, size), Image.Resampling.LANCZOS).save(assets / entry["filename"])
    image.resize((256, 256), Image.Resampling.LANCZOS).save(app / "Resources/Icon.png")
