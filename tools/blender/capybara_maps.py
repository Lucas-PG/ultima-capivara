"""Paints the v6 character's maps from the bake cache (Blender's bundled python, no bpy).

    /Applications/Blender.app/Contents/Resources/5.0/python/bin/python3.11 tools/blender/capybara_maps.py

Reads output/characters/v6/bakes.npz (written by capybara_v6.py), paints with
capybara_paint.py and writes capybara_albedo.png (sRGB) and capybara_normal.png at the bake
size and capybara_orm.png (R team mask, G roughness, B metal) at half size into
output/characters/. Running outside Blender keeps the 4K paint's memory apart from the bake's.
"""
import sys
import time
import zlib
import struct
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import capy_shim
in_blender = not capy_shim.install()   # the shim is only needed outside Blender
import numpy as np
import capybara_form as C
import capybara_paint as PAINT

OUT = HERE.parents[1] / 'output/characters'
started = time.time()


def log(*a):
    print(f'[capy_maps {time.time() - started:6.1f}s]', *a, flush=True)


def write_png(path, rgb):
    """8-bit RGB PNG, top row first (Blender bakes store the bottom row first)."""
    h, w, _ = rgb.shape
    rows = np.concatenate([np.zeros((h, 1), np.uint8), rgb.reshape(h, w * 3)], 1)
    chunk = lambda kind, data: struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    body = chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows.tobytes(), 6)) + chunk(b'IEND', b'')
    Path(path).write_bytes(b'\x89PNG\r\n\x1a\n' + body)


def encode(rgb, srgb_out):
    rgb = np.clip(rgb, 0, 1)
    if srgb_out:
        rgb = np.where(rgb <= .0031308, rgb * 12.92, 1.055 * np.power(rgb, 1 / 2.4) - .055)
    return np.flipud(np.round(rgb * 255).astype(np.uint8))


# Also runs inside Blender (`blender -b --python capybara_maps.py [-- cache.npz]`, on the build
# machine): Blender's own options are not ours.
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ([] if in_blender else sys.argv[1:])
cache = np.load(argv[0] if argv else OUT / 'v6/bakes.npz')
covered = cache['covered']
root, _parts = C.build()
log('form')
N_obj = cache['N_obj'].astype(np.float32) * 2 - 1
albedo, orm, normal = PAINT.paint(root, cache['P'], np.stack([N_obj[..., 0], N_obj[..., 2], -N_obj[..., 1]], -1), cache['N_tan'].astype(np.float32),
                                  cache['AO'].astype(np.float32), cache['E'] > 1.5, covered, log=log, P_low=cache['P_low'])
del N_obj
size = covered.shape[0]; half = size // 2
write_png(OUT / 'capybara_albedo.png', encode(albedo, True)); del albedo
write_png(OUT / 'capybara_normal.png', encode(normal, False)); del normal
write_png(OUT / 'capybara_orm.png', encode(orm.reshape(half, 2, half, 2, 3).mean((1, 3)), False))
log('maps written', size)
