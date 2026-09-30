"""Fast look at the SDF sculpt without Blender: mesh it and write a coloured PLY.

Blender's bundled python: python3.11 tools/blender/capy_preview.py <out.ply> [voxel]
View it with tools/blender/sculpt-preview.html?ply=<url>.
"""
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import capy_shim
capy_shim.install()
import numpy as np
import capy_sdf as S
import capybara_form as C

COLORS = {'fur': 'B0663A', 'muzzle': '9A7A60', 'nose': '4A3C38', 'pad': '4C3E38', 'claw': '2A211D', 'shirt': 'E6DAC4',
          'denim': '3F4E66', 'scarf': 'D9644E', 'leather': '6B4A30', 'pack': '7A5135', 'canvas': '8A6A48', 'trouser': '6E6B4A',
          'brass': 'C79A48', 'eye': '1A1210', 'ear_in': '6A4535', 'hipcloth': 'D9644E', 'lip': '3A2A26', 'button': 'D8CFBE',
          'strap': '5A3A24', 'sole': '3A302C', 'denim_pocket': '4A5A76', 'trouser_pocket': '7A7752', 'pouch': '7A5335', 'pack_flap': '704A30'}

out = sys.argv[1]; voxel = float(sys.argv[2]) if len(sys.argv) > 2 else .004
t0 = time.time()
root, parts = C.build()
root = S.Union([root, C.eyes()])
print('built', time.time() - t0, flush=True)
verts, quads = S.mesh(root, *C.BOUNDS, voxel)
print('meshed', verts.shape, quads.shape, time.time() - t0, flush=True)
d, mat = S.evaluate(root, verts)
cols = np.array([[int(COLORS[n][i:i + 2], 16) for i in (0, 2, 4)] for n in C.MATERIALS], np.uint8)
rgb = cols[mat]
tris = np.concatenate([quads[:, [0, 1, 2]], quads[:, [0, 2, 3]]])
with open(out, 'wb') as f:
    f.write(f'ply\nformat binary_little_endian 1.0\nelement vertex {len(verts)}\nproperty float x\nproperty float y\nproperty float z\n'
            f'property uchar red\nproperty uchar green\nproperty uchar blue\nelement face {len(tris)}\nproperty list uchar int vertex_indices\nend_header\n'.encode())
    rec = np.zeros(len(verts), dtype=[('p', '<f4', 3), ('c', 'u1', 3)])
    rec['p'] = verts; rec['c'] = rgb
    f.write(rec.tobytes())
    face = np.zeros(len(tris), dtype=[('n', 'u1'), ('i', '<i4', 3)])
    face['n'] = 3; face['i'] = tris[:, ::-1]
    f.write(face.tobytes())
print('wrote', out, time.time() - t0)
