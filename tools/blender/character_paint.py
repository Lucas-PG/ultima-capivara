"""Original painted fur, canvas and patterned cloth, matching character-atlas.ts."""
import numpy as np

FUR = [0, 1, 2, 4, 14]
math_tau = np.pi * 2


def samples(tile, u, v):
    shade = .97 + .025 * np.sin(u * 13 + np.sin(v * 11) * 1.2) + .018 * np.cos(v * 23 + u * 8)
    height = np.zeros_like(u)
    printed = np.zeros_like(u)
    if tile in FUR:
        x = (u + .012 * np.sin(v * 9)) * 78
        stagger = np.sin(np.floor(x) * 73.13) * 39.2
        y = v * 26 + stagger - np.floor(stagger)
        seed = np.sin(np.floor(x) * 12.9898 + np.floor(y) * 78.233) * 43758.5453
        seed -= np.floor(seed)
        along = y - np.floor(y)
        across = x - np.floor(x) - (.23 + seed * .5 + .08 * np.sin(along * math_tau))
        strand = np.exp(-(across / .17) ** 2) * np.maximum(0, np.sin(along * np.pi)) ** 1.2
        shade = .97 + .022 * np.sin(u * 13 + v * 8) + strand * np.where(seed > .42, .16, -.10)
        height = strand * .035
    elif tile in [5, 6, 7, 13]:
        height = np.sin(u * 420) * np.cos(v * 420) * .025
        shade *= .96 + height * .88
        if tile in [5, 6]:
            a = (u * 3 + (np.floor(v * 4) % 2) * .5) % 1 - .5
            b = (v * 4) % 1 - .5
            stem = (np.abs(a - b * .48) < .014) & (np.abs(b) < .38)
            leaf = ((a - b * .48 - np.sign(b) * .065) / .115) ** 2 + (((b + .5) % .22 - .11) / .075) ** 2 < 1
            printed = np.where(stem | (leaf & (np.abs(b) < .32)), .43, 0)
    elif tile == 8:
        shade *= .92 + .035 * np.sin(u * 155 + np.sin(v * 31))
        height = np.sin(u * 155 + np.sin(v * 31)) * .012
    elif tile == 15:
        height = np.sin(u * 110) * np.cos(v * 98) * .012
        shade *= .96 + height * 1.5
    if tile in [3, 9, 10]:
        shade = np.ones_like(u)
    return shade, printed, height


def atlas_arrays(palette, size=1024):
    color = np.ones((size, size, 4), dtype=np.float32)
    normal = np.ones_like(color)
    rough = np.ones_like(color)
    step = size // 4
    u, v = np.meshgrid((np.arange(step) + .5) / step, (np.arange(step) + .5) / step)
    for tile, hex_color in enumerate(palette):
        shade, printed, height = samples(tile, u, v)
        rgb = np.array([int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)])
        rgb = np.minimum(1, rgb * shade[:, :, None] * (1 - printed[:, :, None]) + np.array([244, 232, 189]) / 255 * printed[:, :, None])
        # Blender pixel rows begin at the bottom; exported glTF UVs begin at top.
        x, y = tile % 4 * step, (3 - tile // 4) * step
        color[y:y + step, x:x + step, :3] = rgb[::-1]
        dv, du = np.gradient(height)
        vector = np.stack((-du * 4, dv * 4, np.ones_like(u)), axis=2)
        vector /= np.linalg.norm(vector, axis=2)[:, :, None]
        normal[y:y + step, x:x + step, :3] = (vector[::-1] + 1) * .5
        value = .91 if tile in FUR else .88 if tile in [5, 6, 7, 13] else .63 if tile == 8 else .26 if tile in [9, 15] else .47 if tile == 12 else .92
        rough[y:y + step, x:x + step, :3] = value
    return color, normal, rough


def semantic_array(kind, size=64):
    image = np.ones((size, size, 4), dtype=np.float32)
    step = size // 4
    for tile in range(16):
        x, y = tile % 4 * step, (3 - tile // 4) * step
        image[y:y + step, x:x + step] = [1, 1, 1, .22 if tile in [9, 15] else 0] if kind == 'specular' else [0, 0, 0, 1]
        if kind == 'emission' and tile == 10:
            # Upper half is the eye catchlight, lower half is non-emissive ivory.
            image[y + step // 2:y + step, x:x + step] = [1, 1, 1, 1]
    return image
