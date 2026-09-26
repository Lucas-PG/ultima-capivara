"""Original island architecture. Every solid primitive emits its own collider.
Game coordinates: metres, Y up, +Z frontage, bottom-centred piece origin.
This module uses only Python's standard library so metadata can be built alone.
"""
from pathlib import Path
import json
import math

ROOT = Path(__file__).resolve().parents[3]
PIECES = {}


class Piece:
    def __init__(self, name, width, depth):
        self.name, self.width, self.depth = name, width, depth
        self.parts, self.colliders = [], []
        PIECES[name] = self

    def box(self, x, y, z, w, h, d, tile=0, solid=False, material='stone', bevel=.035, detail=False, yaw=0, roll=0):
        self.parts.append(dict(shape='box', center=[x, y, z], size=[w, h, d], tile=tile, bevel=bevel, detail=detail, yaw=yaw, roll=roll))
        if solid:
            assert not roll, 'Sloping decoration cannot create an axis-aligned collider'
            self.colliders.append(dict(type='box', x=x, y=y, z=z, width=w, height=h, depth=d, yaw=yaw, material=material))

    def cylinder(self, x, y, z, radius, height, tile=6, solid=False, material='stone', top=None, sides=12, detail=False, axis='y'):
        self.parts.append(dict(shape='cylinder', center=[x, y, z], radius=radius, top=radius if top is None else top, height=height, tile=tile, sides=sides, detail=detail, axis=axis))
        if solid:
            assert axis == 'y' and (top is None or top == radius)
            self.colliders.append(dict(type='cylinder', x=x, y=y, z=z, radius=radius, height=height, material=material))

    def orb(self, x, y, z, w, h, d, tile=12, detail=True):
        self.parts.append(dict(shape='orb', center=[x, y, z], size=[w, h, d], tile=tile, detail=detail))

    def beam(self, a, b, width, tile=7, depth=None, detail=False):
        self.parts.append(dict(shape='beam', a=a, b=b, width=width, depth=depth or width, tile=tile, detail=detail))

    def metadata(self):
        high = max((p['center'][1] + (max(p['radius'], p['top']) if p.get('axis', 'y') != 'y' else p.get('size', [0, p.get('height', 0), 0])[1] / 2) for p in self.parts if 'center' in p), default=0)
        return dict(footprint=[self.width, self.depth], height=round(high, 4), colliders=self.colliders)


def window(p, x, y, z, width=1.4, height=1.55, side=1, shutter=2):
    # Dark inset, projecting sill, inset frame, paired louvred shutters.
    p.box(x, y, z, width, height, .10, 10, bevel=.02)
    for dx in [-width / 2, width / 2]:
        p.box(x + dx, y, z + side * .09, .12, height + .17, .16, 15)
    for dy in [-height / 2, height / 2]:
        p.box(x, y + dy, z + side * .09, width + .24, .12, .16, 15)
    p.box(x, y, z + side * .12, .045, height, .12, 7, detail=True)
    p.box(x, y - .03, z + side * .12, width, .045, .12, 7, detail=True)
    p.box(x, y - height / 2 - .12, z + side * .19, width + .36, .13, .40, 14)
    for direction in [-1, 1]:
        xx = x + direction * (width / 2 + .30)
        p.box(xx, y, z + side * .08, .43, height, .10, shutter)
        for i in range(6):
            p.box(xx, y - height * .36 + i * height * .145, z + side * .15, .36, .06, .06, shutter, bevel=.012, detail=True)
    if side > 0:
        p.box(x, y - height / 2 - .35, z + .35, width * .86, .3, .38, 5, bevel=.03)
        p.box(x, y - height / 2 - .19, z + .35, width * .81, .02, .30, 7, bevel=0)
        for i in range(5):
            xx = x + (i - 2) * width * .15
            p.orb(xx, y - height / 2 - .08, z + .34, .27, .25, .3)
            p.orb(xx + .05, y - height / 2 + .03, z + .40, .10, .09, .10, 1 if i % 2 else 3)


def portal(p, x, z, wall_h, width=2, side=1, color=5):
    for dx in [-width / 2 - .10, width / 2 + .10]:
        p.box(x + dx, 1.34, z + side * .06, .18, 2.68, .36, 15)
    p.box(x, 2.74, z + side * .07, width + .42, .18, .40, 15)
    # Door leaves stand open against the wall, never across the traversable opening.
    for direction in [-1, 1]:
        xx = x + direction * (width / 2 + .58)
        p.box(xx, 1.26, z + side * .19, .86, 2.50, .11, color)
        for yy in [.65, 1.77]:
            p.box(xx, yy, z + side * .255, .64, .83, .04, 7, bevel=.025, detail=True)
            p.box(xx, yy, z + side * .28, .53, .70, .02, color, bevel=.015, detail=True)
        p.orb(xx - direction * .29, 1.25, z + side * .29, .07, .07, .05, 3)
    p.box(x, .04, z + side * .13, width, .08, .44, 14, True)


def roof(p, width, depth, base, rise=1.7, tile=4):
    # Narrow structural bands are the visible stepped clay bed and exact collision.
    rows = max(5, math.ceil(width / 1.1))
    half = width / 2
    step = rise / rows
    for i in range(rows):
        w = width * (1 - i / rows)
        p.box(0, base + (i + .5) * step, 0, w, step, depth, tile, True, bevel=.018)
    # Barrel tile caps follow both pitches, with individually scalloped eaves.
    for sign in [-1, 1]:
        for i in range(rows):
            x = sign * (half - (i + .5) * half / rows)
            y = base + (i + 1) * step + .035
            for j in range(math.ceil(depth / .55)):
                z = -depth / 2 + (j + .5) * depth / math.ceil(depth / .55)
                p.cylinder(x, y, z, .084, half / rows + .07, tile, sides=6, detail=True, axis='x')
    p.cylinder(0, base + rise + .085, 0, .14, depth + .1, tile, sides=10, axis='z')
    for z in [-depth / 2, depth / 2]:
        p.beam((-half, base, z), (0, base + rise, z), .16, 15)
        p.beam((0, base + rise, z), (half, base, z), .16, 15)
    for x in [-half, half]:
        p.box(x, base - .045, 0, .16, .17, depth + .15, 7)


def building(name, width, depth, floors=1, color=1, roof_tile=4):
    p = Piece(name, width + .7, depth + .7)
    height = 3.2 * floors
    p.box(0, .055, 0, width, .11, depth, 14, True, bevel=.02)
    # Walls and doors share the exact solids, with an unobstructed two-exit route.
    for z, side in [(-depth / 2, -1), (depth / 2, 1)]:
        for direction in [-1, 1]:
            segment = (width - 2) / 2
            p.box(direction * (1 + segment / 2), height / 2, z, segment, height, .28, color, True)
        p.box(0, (2.65 + height) / 2, z, 2, height - 2.65, .28, color, True)
        portal(p, 0, z, height, side=side)
        for x in [-width * .32, width * .32]:
            for floor in range(floors):
                window(p, x, 1.78 + floor * 3.2, z + side * .18, side=side, width=1.1 if width < 8 else 1.45, shutter=2 if color != 2 else 1)
        for yy in [.22, height - .2] + ([3.2] if floors > 1 else []):
            # Plinth is split at doors so collision-free openings stay visually clear.
            if yy < .5:
                for direction in [-1, 1]:
                    p.box(direction * (width / 4 + .5), yy, z + side * .16, width / 2 - 1, .24, .12, 14)
            else:
                p.box(0, yy, z + side * .18, width + .18, .16, .18, 15)
    for x in [-width / 2, width / 2]:
        p.box(x, height / 2, 0, .28, height, depth, color, True)
        p.box(x, .24, 0, .37, .32, depth, 14)
        p.box(x, height - .20, 0, .39, .16, depth + .25, 15)
        for z in [-depth / 2, depth / 2]:
            p.box(x, height / 2, z, .42, height, .42, 15)
        # Rain pipe elbows and collars add scale without adding a material.
        p.cylinder(x + math.copysign(.22, x), height / 2, -depth / 2 + .4, .055, height, 8, sides=8, detail=True)
        for yy in [.6, 1.8, height - .5]:
            p.cylinder(x + math.copysign(.22, x), yy, -depth / 2 + .4, .078, .045, 9, sides=8, detail=True)
    if floors > 1:
        # Stair opening on left; landing and second room remain walkable.
        p.box(1.0, 3.13, 0, width - 2.5, .18, depth - .3, 5, True, 'wood')
        count = 20
        for i in range(count):
            top = (i + 1) * 3.04 / count
            p.box(-width / 2 + .85, top / 2, -depth / 2 + .45 + (i + .5) * (depth - 1) / count, 1.3, top, (depth - 1) / count, 5, True, 'wood', bevel=.01)
    roof(p, width + .7, depth + .7, height, 1.65 if width < 10 else 2.0, roof_tile)
    return p


building('house_small', 7, 6, color=1)
building('house_tall', 8, 7, floors=2, color=2)
p = building('church', 10, 16, color=0)
# Campanile offset from the nave, with a real hollow lower passage.
for x in [-3.95, -2.05]:
    p.box(x, 5.4, 5.8, .38, 10.8, 2.6, 0, True)
for z in [4.5, 7.1]:
    p.box(-3, 4.45, z, 2.2, 8.9, .35, 0, True)
    p.box(-3, 10.6, z, 2.2, .5, .35, 0, True)
for yy in [3.2, 8.9, 10.9]:
    p.box(-3, yy, 5.8, 2.55, .22, 2.9, 15)
p.cylinder(-3, 9.6, 5.8, .43, .60, 3, top=.20, sides=16)
p.cylinder(-3, 9.27, 5.8, .46, .08, 9, sides=16)
p.box(-3, 11.2, 5.8, 2.65, .3, 3, 4, True)
p.cylinder(-3, 11.8, 5.8, 1.8, 1.0, 4, top=0, sides=4)
p.box(-3, 12.85, 5.8, .12, 1.2, .14, 15)
p.box(-3, 13.08, 5.8, .7, .12, .14, 15)
p = building('market_hall', 16, 12, color=3)
# Covered arcade front, with broad timber trusses and fabric valance.
for x in [-7.7, -4.0, 4.0, 7.7]:
    p.box(x, 1.45, 7.0, .22, 2.9, .22, 5, True, 'wood')
    p.beam((x, 2.0, 7), (x + .55, 2.75, 7), .12, 7)
p.box(0, 2.92, 6.95, 16.2, .16, 2.1, 11)
for i in range(24):
    p.box((i - 11.5) * .675, 2.65, 8, .675, .35, .08, 1 if i % 2 else 11, bevel=.045)
p = Piece('fort_wall', 8, 2)
p.box(0, 1.55, 0, 8, 3.1, 2, 6, True, bevel=.075)
p.box(0, 3.14, 0, 8.2, .24, 2.2, 14, True, bevel=.07)
for x in [-3.5, -2.1, -.7, .7, 2.1, 3.5]:
    p.box(x, 3.75, -.70, .82, 1.0, .62, 6, True, bevel=.07)
    p.box(x, 4.23, -.70, .92, .12, .73, 14, bevel=.04)
for x in [-3.0, 0, 3.0]:
    p.box(x, 1.4, .96, .75, 2.8, .30, 14)
# Masonry courses keep large fort faces readable as stone at player distance.
for row in range(6):
    for block in range(6):
        xx = (block - 2.5) * 1.28 + (.3 if row % 2 else 0)
        if abs(xx) > 3.5:
            continue
        for side in [-1, 1]:
            p.box(xx, .28 + row * .49, side * 1.02, 1.22, .43, .075, 6 if (row + block) % 4 else 14, bevel=.025, detail=True)
p = Piece('fort_tower', 6, 6)
# Octagonal drum. Cylinder collision matches the same outer radius.
p.cylinder(0, 3.2, 0, 2.6, 6.4, 6, True, sides=24)
# Fine stone joints and staggered quoins replace the barrel-like broad bands.
for row in range(12):
    p.cylinder(0, .29 + row * .50, 0, 2.64, .45, 6, sides=32, detail=True)
    for i in range(8):
        angle = math.tau * (i + (row % 2) * .5) / 8
        p.box(math.sin(angle) * 2.655, .29 + row * .50, math.cos(angle) * 2.655,
              .64, .39, .055, 14 if (i + row) % 4 == 0 else 6, bevel=.02, detail=True, yaw=angle)
for yy in [.22, 3.4, 6.35]:
    p.cylinder(0, yy, 0, 2.72, .26, 14, True, sides=24)
for i in range(12):
    a = math.tau * i / 12
    p.box(math.sin(a) * 2.55, 7.0, math.cos(a) * 2.55, .80, 1.2, .64, 6, True, yaw=a)
    p.box(math.sin(a) * 2.55, 7.62, math.cos(a) * 2.55, .92, .16, .73, 14, yaw=a)
for a in [0, math.pi / 2, math.pi, 3 * math.pi / 2]:
    p.box(math.sin(a) * 2.63, 4.6, math.cos(a) * 2.63, .35, 1.35, .08, 9, yaw=a)
p = Piece('bridge_stone', 7, 16)
p.box(0, .225, 0, 7, .45, 16, 6, True, bevel=.055)
# Deck origin is its underside. Mapa sets Y from the river crossing elevation.
for x in [-3.25, 3.25]:
    p.box(x, .93, 0, .48, .98, 16, 6, True)
    p.box(x, 1.49, 0, .68, .16, 16.2, 14, True)
    for z in [-7.6, -4, 0, 4, 7.6]:
        p.box(x, 1.2, z, .78, 1.5, .78, 14, True)
        p.box(x, 2, z, .88, .16, .88, 14)
for i in range(30):
    p.box(0, .46, (i - 14.5) * .52, 6.1, .026, .48, 14 if i % 3 else 6, bevel=.01, detail=True)
p = Piece('dock_wood', 6, 12)
p.box(0, .18, 0, 6, .36, 12, 5, True, 'wood')
for i in range(30):
    p.box(0, .38, (i - 14.5) * .40, 6, .06, .37, 5 if i % 4 else 7, bevel=.02, detail=True)
for x in [-2.8, 2.8]:
    for z in [-5.7, 0, 5.7]:
        p.cylinder(x, .75, z, .18, 1.5, 7, True, 'wood', sides=10)
        for yy in [1.12, 1.20, 1.28]:
            p.cylinder(x, yy, z, .20, .045, 11, sides=10, detail=True)
p = Piece('container', 6, 2.8)
p.box(0, 1.4, 0, 6, 2.8, 2.8, 8, True, 'metal', bevel=.08)
for z in [-1.43, 1.43]:
    for i in range(24):
        p.box((i - 11.5) * .244, 1.4, z, .055, 2.6, .08, 8, bevel=.016, detail=True)
    for yy in [.12, 2.68]:
        p.box(0, yy, z, 6.1, .15, .14, 9)
for x in [-2.92, 2.92]:
    for z in [-1.42, 1.42]:
        p.box(x, 1.4, z, .18, 2.8, .15, 9)
for z in [-.65, .65]:
    p.box(3.06, 1.4, z, .1, 2.55, 1.22, 8)
    p.box(3.13, 1.4, z, .06, 2.3, .04, 15, detail=True)
p = Piece('crate', 1.2, 1.2)
p.box(0, .6, 0, 1.16, 1.2, 1.16, 5, True, 'wood')
for side in [-1, 1]:
    for yy in [.10, 1.1]:
        p.box(0, yy, side * .6, 1.2, .15, .10, 7)
        p.box(side * .6, yy, 0, .10, .15, 1.2, 7)
    p.beam((-.48, .2, side * .62), (.48, 1.0, side * .62), .12, 7)


from extensions import extend
extend(Piece, building, roof, window)


def write_metadata():
    path = ROOT / 'src/shared/kit-pieces.json'
    path.write_text(json.dumps({name: piece.metadata() for name, piece in PIECES.items()}, indent=2) + '\n')


if __name__ == '__main__':
    write_metadata()
