"""Cut the approved F1 original and remove the glint matte specified by Pincel.

Run from the repository root:
  uv run --with pillow python tools/assets/prepare-render-atlas.py
The generated source PNG is retained unchanged. No generative repainting occurs.
"""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[2]
textures = root / "public" / "textures"
source = Image.open(textures / "sky-water-storm-additive.png").convert("RGBA")
if source.width != source.height or source.width % 2:
    raise ValueError("F1 must have four equal square quadrants")
# The generator returned straight alpha. Flatten over its intended additive black.
source = Image.alpha_composite(Image.new("RGBA", source.size, (0, 0, 0, 255)), source).convert("RGB")
side = source.width // 2
names = ("painted-sun", "storm-wisps", "shore-foam", "water-glints")
for index, name in enumerate(names):
    x, y = index % 2 * side, index // 2 * side
    tile = source.crop((x, y, x + side, y + side))
    if name == "water-glints":
        # Pincel final-art review: luminance below70 is a grey diamond matte,
        # not emitted light. Map70..255 to0..255 while retaining the warm hue.
        pixels = []
        for rgb in tile.get_flattened_data():
            value = .299 * rgb[0] + .587 * rgb[1] + .114 * rgb[2]
            gain = max(0, (value - 70) / 185) * 255 / max(value, 1)
            pixels.append(tuple(min(255, round(channel * gain)) for channel in rgb))
        tile.putdata(pixels)
    output = textures / f"{name}.png"
    tile.save(output, optimize=True)
    print(f"{output.relative_to(root)}: {tile.width}x{tile.height}, {output.stat().st_size} bytes")
