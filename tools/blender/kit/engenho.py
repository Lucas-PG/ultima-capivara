"""Engenho: the old sugar mill on the upper river, west of the Lagoa.
The mill hall (stone arcades under a clay-tile roof, the three-roller cane
mill and the copper boiling pans inside), its brick chimney, and a patch of
sugar cane. Game coordinates: metres, Y up, bottom-centred origin.
"""
import math
from access import floor_record, route
from casario import spandrels, tile_sheet, voussoirs
from rocks import surface

WALL, CORAL, TEAL, YELLOW, ROOF, WOOD, BLOCK, DARK, NAVY, IRON, GLASS, CANVAS, GREEN, BRICK, STONE, TRIM = range(16)
COPPER = [.86, .5, .3]
CANE = [.6, .82, .42]


def flag(p, **values):
    p.parts[-1].update(values)


def engenho(Piece, name='engenho'):
    """The mill hall: 16 x 10 m, four round arches on each long side between
    stone piers, whitewashed gable ends with a door, a tiled roof on timber
    trusses. Inside, the moenda (three upright rollers under a beam) and a
    brick furnace bench carrying three copper tachos. Open to walk through."""
    W, D, H = 16.0, 10.0, 5.0
    p = Piece(name, W + 1.6, D + 1.6)
    p.box(0, .06, 0, W, .12, D, STONE, True, bevel=.02)
    arches = 4
    bay = W / arches
    r, spring = 1.6, 2.0
    for side in [-1, 1]:
        z = side * D / 2
        for i in range(arches + 1):
            x = -W / 2 + i * bay
            p.box(x, H / 2, z, 1.0 if i in (0, arches) else .8, H, .7, BLOCK, True, bevel=.04)
        for i in range(arches):
            x = -W / 2 + (i + .5) * bay
            # Masonry over each arch; its spandrels make the opening round.
            p.box(x, (spring + r + H) / 2, z, bay - .8, H - spring - r, .7, WALL, True, bevel=0)
            spandrels(p, x, spring, r, z - .35, z + .35, WALL)
            for face in [-1, 1]:
                voussoirs(p, x, spring, r, z + face * .37, BLOCK, width=.3, depth=.08, count=9, key=STONE)
        p.box(0, H - .15, z + side * .38, W + .2, .3, .12, TRIM, bevel=.02)
    for side in [-1, 1]:
        # Solid whitewashed end walls: a planked double door in a stone frame,
        # a shuttered window either side, a stone plinth and a round vent high
        # in the gable, so neither end reads as a blank wall from the yards.
        x = side * W / 2
        face = x + side * .3
        p.box(x, H / 2, 0, .6, H, D - .9, WALL, True, bevel=0)
        for dz in [-.95, .95]:
            p.box(face + side * .02, 1.3, dz, .1, 2.6, .25, STONE, bevel=.02)
        p.box(face + side * .02, 2.72, 0, .1, .25, 2.2, STONE, bevel=.02)
        for dz in [-.42, .42]:
            p.box(face + side * .01, 1.25, dz, .05, 2.4, .8, WOOD, bevel=.01)
            for i in range(4):
                p.box(face + side * .04, 1.25, dz - .3 + i * .2, .02, 2.3, .03, DARK, bevel=0, detail=True)
            for y in [.55, 1.95]:
                p.box(face + side * .045, y, dz, .025, .09, .72, DARK, bevel=0, detail=True)
        p.orb(face + side * .06, 1.3, -.1, .06, .06, .06, IRON, True)
        for dz in [-2.9, 2.9]:
            p.box(face + side * .01, 2.3, dz, .06, 1.2, .9, DARK, bevel=.01)
            for dy in [-.66, .66]:
                p.box(face + side * .05, 2.3 + dy, dz, .1, .12, 1.12, STONE, bevel=.02)
            for dd in [-.62, .62]:
                p.box(face + side * .05, 2.3, dz + dd, .1, 1.44, .12, STONE, bevel=.02)
            for open_side in [-1, 1]:
                # Shutters stand open against the wall, green like the Vila's.
                p.box(face + side * .06, 2.3, dz + open_side * .95, .05, 1.15, .42, GREEN, bevel=.01)
                for i in range(5):
                    p.box(face + side * .09, 1.86 + i * .22, dz + open_side * .95, .02, .05, .36, DARK, bevel=0, detail=True)
        p.box(face + side * .03, .28, 0, .12, .56, D - .9, STONE, bevel=.02)
        p.cylinder(face + side * .02, H + 1.15, 0, .5, .08, STONE, sides=14, axis='x')
        p.cylinder(face + side * .04, H + 1.15, 0, .36, .06, DARK, sides=14, axis='x')
    # Gable walls above the eaves, closing the roof ends.
    rise = 2.6
    for side in [-1, 1]:
        x = side * (W / 2 - .01)
        vertices = [(x, H, D / 2 + .35), (x, H + rise, 0), (x, H, -D / 2 - .35)]
        surface(p, vertices, [(0, 2, 1)] if side > 0 else [(0, 1, 2)], WALL, detail=False)
        flag(p, planar=True)
    tile_sheet(p, -W / 2 - .5, W / 2 + .5, D / 2 + .8, 0, H - .1, H + rise, ROOF)
    tile_sheet(p, -W / 2 - .5, W / 2 + .5, -D / 2 - .8, 0, H - .1, H + rise, ROOF)
    # Board sarking under both slopes: the roof reads solid from inside the hall.
    for side in [-1, 1]:
        p.beam((0, H - .16, side * (D / 2 + .8)), (0, H + rise - .08, 0), W + .9, WOOD, .05)
    p.cylinder(0, H + rise + .08, 0, .14, W + .9, ROOF, sides=8, axis='x')
    for i in range(1, arches):
        x = -W / 2 + i * bay
        p.box(x, H - .1, 0, .24, .24, D, DARK, bevel=.01)
        p.beam((x, H - .1, -D / 2 + .3), (x, H + rise - .3, 0), .2, DARK)
        p.beam((x, H - .1, D / 2 - .3), (x, H + rise - .3, 0), .2, DARK)
        p.box(x, H + .9, 0, .12, 1.8, .12, DARK, bevel=0)
    for side in [-1, 1]:
        p.box(side * (W / 2 - .7), .3, 0, .3, .1, D - 1, TRIM, bevel=0, detail=True)
    # The moenda at the west end: three rollers on a stone bed under a heavy
    # beam, the crushing tray beside it. The two middle bays stay clear.
    mx = -5.4
    p.box(mx, .45, 0, 2.4, .9, 3.2, BLOCK, True, bevel=.05)
    for dx in [-.62, 0, .62]:
        p.cylinder(mx + dx, 1.55, 0, .3, 1.3, DARK, True, 'wood', sides=14)
        for y in [1.05, 2.05]:
            p.cylinder(mx + dx, y, 0, .33, .08, IRON, sides=14)
    p.box(mx, 2.35, 0, 2.6, .3, .5, DARK, bevel=.02)
    for dx in [-1.25, 1.25]:
        p.box(mx + dx, 1.6, 0, .3, 1.5, .45, DARK, True, 'wood', bevel=.02)
    p.box(mx, 1.02, 1.3, 1.6, .12, .9, IRON, bevel=.02)
    # The boiling house at the east end: a brick furnace bench carrying three
    # copper tachos, its flue rising into the wall toward the chimney.
    fx = 5.6
    p.box(fx, .5, 0, 1.6, 1.0, 6.6, BRICK, True, bevel=.04)
    for i, z in enumerate([-2.2, 0, 2.2]):
        p.cylinder(fx, 1.12, z, .72, .24, CANVAS, top=.62, sides=18)
        flag(p, tint=COPPER)
        p.cylinder(fx, 1.25, z, .6, .02, DARK, sides=18, detail=True)
        p.box(fx - .82, .35, z, .06, .4, .5, DARK, bevel=.01)
    p.box(W / 2 - .75, 2.4, -3.4, .9, 4.8, .9, BRICK, True, bevel=.03)
    for i, (x, z) in enumerate([(3.4, 3.6), (3.9, 4.1), (3.0, 4.2)]):
        p.orb(x, .38, z, .8, .5, .55, CANVAS, False)
        flag(p, segments=(7, 4), tint=[.8, .68, .5])
    floor = floor_record(p, 0, 'hall')
    top = floor['y']
    entrances, routes = [], []
    for side, label in [(-1, 'north'), (1, 'south')]:
        for i in [1, 2]:
            x = -W / 2 + (i + .5) * bay
            name_ = f'{label}-{i}'
            entrances.append(dict(id=name_, point=[x, top, side * (D / 2 + .9)]))
            routes.append(route(name_, name_, 'hall', [[x, top, side * (D / 2 + .9)], [x, top, side * (D / 2 - .8)], [x, top, 0], [0, top, 0]]))
    p.traversal = dict(floors=[floor], entrances=entrances, routes=routes, stairs=[])
    return p


def chamine(Piece, name='chamine'):
    """The mill chimney: a stone plinth and a tapering brick shaft, 18 m tall."""
    p = Piece(name, 3.4, 3.4)
    p.box(0, 1.3, 0, 3.2, 2.6, 3.2, BLOCK, True, bevel=.05)
    p.box(0, 2.7, 0, 3.4, .2, 3.4, TRIM, bevel=.03)
    p.box(0, .15, 1.62, .9, 1.2, .1, DARK, bevel=.02)
    shaft = 15.0
    # Stacked courses keep the brick at its real size up the tapering shaft.
    courses = 10
    for i in range(courses):
        r0 = 1.05 - (1.05 - .66) * i / courses
        r1 = 1.05 - (1.05 - .66) * (i + 1) / courses
        p.cylinder(0, 2.8 + (i + .5) * shaft / courses, 0, r0, shaft / courses, BRICK, top=r1, sides=10)
    # Inscribed solids so the shaft stops shots all the way up.
    for i in range(5):
        y0 = 2.8 + i * shaft / 5
        half = (1.05 - (1.05 - .66) * (i + 1) / 5) * .7
        p.box(0, y0 + shaft / 10, 0, half * 2, shaft / 5, half * 2, BRICK, True, bevel=0)
    for y, rad in [(2.8 + shaft * .45, .9), (2.8 + shaft - .6, .74)]:
        p.cylinder(0, y, 0, rad, .25, BRICK, sides=10)
    p.cylinder(0, 2.8 + shaft + .2, 0, .86, .4, BRICK, top=.8, sides=10)
    flag(p, tint=[.75, .62, .55])
    p.cylinder(0, 2.8 + shaft + .42, 0, .6, .06, DARK, sides=10)
    return p


def cana(Piece, name='canavial', width=6.0, depth=4.0, seed=3):
    """A patch of sugar cane: jointed stalks leaning a little, long leaves
    arching off the tops. Soft cover: it hides you but stops nothing."""
    p = Piece(name, width, depth)
    rows = 5
    for r in range(rows):
        z = -depth / 2 + (r + .5) * depth / rows
        count = round(width / .45)
        for i in range(count):
            h = 2.3 + ((i * 7 + r * 3 + seed) % 5) * .14
            x = -width / 2 + (i + .5) * width / count + ((i + r) % 3 - 1) * .08
            lean = ((i * 5 + r) % 7 - 3) * .03
            p.beam((x, 0, z), (x + lean * h, h, z + lean * h * .5), .05, GREEN)
            flag(p, tint=[.7, .78, .45])
            # Long arching blades from the upper joints, drooping at the tips.
            for k, side in enumerate([-1, 1, -1]):
                a = (i + r) * 1.3 + side + k
                y0 = h - .35 - k * .45
                mid = (x + lean * h + math.cos(a) * .45, y0 + .35, z + lean * h * .5 + math.sin(a) * .35)
                tip = (x + lean * h + math.cos(a) * .95, y0 - .15, z + lean * h * .5 + math.sin(a) * .7)
                p.beam((x + lean * y0, y0, z + lean * y0 * .5), mid, .16, GREEN, .015, detail=k == 2)
                flag(p, tint=CANE)
                p.beam(mid, tip, .12, GREEN, .015, detail=k > 0)
                flag(p, tint=[.66, .84, .44])
    return p


CUT_CANE = [.78, .76, .44]
CANE_TOP = [.55, .78, .4]


def stalks(p, x0, x1, y, z, count, spread, rows=1, seed=0):
    """Cut cane lying along x: jointed stalks in a loose heap, their leafy tops at +x."""
    for r in range(rows):
        n = count - r
        for i in range(n):
            zz = z + (i - (n - 1) / 2) * spread * 2 / max(1, count - 1) + ((i * 7 + seed) % 3 - 1) * .015
            yy = y + r * .085 + ((i + seed) % 2) * .01
            jitter = ((i * 5 + r * 3 + seed) % 7 - 3) * .02
            p.beam((x0 + jitter, yy, zz), (x1 + jitter, yy + ((i + r) % 3 - 1) * .02, zz + jitter * .5), .045, GREEN, detail=i % 3 == 2)
            flag(p, tint=CUT_CANE)
            if i % 2 == 0:
                p.orb(x1 + .18 + jitter, yy + .05, zz, .42, .16, .22, GREEN, i % 4 == 2)
                flag(p, segments=(5, 3), tint=CANE_TOP)


def carro_boi(Piece, name='carro_boi'):
    """The ox cart that hauls cane to the mill: two solid timber wheels on one
    axle, a plank bed ringed with stakes, heaped with cut cane, the long shaft
    resting on its forked prop. The bed is waist-high cover."""
    p = Piece(name, 5.6, 2.2)
    bx, length = -.9, 3.0
    p.box(bx, .95, 0, length, .16, 1.45, WOOD, True, 'wood', bevel=.02)
    for z in [-.7, .7]:
        p.box(bx, .82, z, length + .1, .14, .12, DARK, bevel=.015)
        for i in range(7):
            x = bx - length / 2 + .15 + i * (length - .3) / 6
            p.beam((x, .9, z), (x + (i % 2 - .5) * .04, 1.75, z * 1.04), .07, WOOD)
        p.beam((bx - length / 2 + .15, 1.55, z * 1.03), (bx + length / 2 - .15, 1.55, z * 1.03), .05, DARK, detail=True)
    for z in [-.92, .92]:
        p.cylinder(bx, .78, z, .78, .14, WOOD, sides=18, axis='z')
        p.cylinder(bx, .78, z * 1.03, .8, .06, DARK, sides=18, axis='z', detail=True)
        p.cylinder(bx, .78, z * 1.1, .14, .16, IRON, sides=10, axis='z')
        for dy in [-.4, 0, .4]:
            p.box(bx, .78 + dy, z * 1.08, .95 - abs(dy) * .9, .06, .02, DARK, bevel=0, detail=True)
    p.cylinder(bx, .78, 0, .09, 2.0, DARK, sides=8, axis='z')
    stalks(p, bx - length / 2 + .1, bx + length / 2 - .25, 1.1, 0, 13, .6, rows=4, seed=3)
    # The shaft (cabecalho) and its yoke, propped on a forked stick.
    p.beam((bx + length / 2 - .2, .92, 0), (2.5, .62, 0), .14, WOOD)
    p.box(2.55, .66, 0, .14, .12, 1.7, DARK, bevel=.02)
    for dz in [-.35, .35]:
        p.beam((2.55, .7, dz), (2.55, .95, dz * 1.2), .05, DARK, detail=True)
    p.beam((2.25, 0, -.12), (2.25, .6, 0), .07, DARK)
    p.beam((2.25, 0, .12), (2.25, .6, 0), .07, DARK)
    return p


def feixe_cana(Piece, name='feixe_cana'):
    """Cut cane waiting for the mill: bundles tied with straw bands, stacked in
    a low pyramid on the yard. Crouch cover."""
    p = Piece(name, 2.8, 1.6)
    p.box(-.1, .42, 0, 2.2, .84, 1.1, GREEN, True, 'wood', bevel=.2)
    flag(p, tint=CUT_CANE, lods=[2])
    for (z, y) in [(-.38, .19), (0, .19), (.38, .19), (-.19, .5), (.19, .5), (0, .8)]:
        stalks(p, -1.2, .95, y - .12, z, 7, .16, rows=3, seed=int(z * 10 + y * 7))
        for x in [-.65, .45]:
            p.cylinder(x, y, z, .2, .07, CANVAS, sides=10, axis='x', detail=True)
            flag(p, tint=[.72, .6, .38])
    return p


def garapeira(Piece, name='garapeira'):
    """A cane-juice press on a timber stand: three iron rollers under a cap,
    the big crank wheel, a spout over a bucket. Sold by the glass at the gate."""
    p = Piece(name, 1.6, 1.1)
    p.box(0, .45, 0, 1.0, .9, .7, WOOD, True, 'wood', bevel=.03)
    for dx in [-.45, .45]:
        for dz in [-.3, .3]:
            p.box(dx, .45, dz, .1, .9, .1, DARK, bevel=.01)
    p.box(0, .93, 0, .7, .06, .5, IRON, bevel=.01)
    for dx in [-.16, 0, .16]:
        p.cylinder(dx, 1.18, 0, .075, .44, IRON, sides=10)
        p.cylinder(dx, 1.18, 0, .085, .05, DARK, sides=10, detail=True)
    p.box(0, 1.44, 0, .6, .08, .34, DARK, bevel=.01)
    p.cylinder(.62, 1.15, 0, .42, .05, IRON, sides=16, axis='x')
    p.cylinder(.64, 1.15, 0, .07, .12, DARK, sides=8, axis='x')
    for a in range(4):
        ang = a * math.pi / 4
        p.box(.63, 1.15, 0, .03, .8 * abs(math.cos(ang)) + .04, .8 * abs(math.sin(ang)) + .04, IRON, bevel=0, detail=True)
    p.beam((.66, 1.5, 0), (.9, 1.5, 0), .05, WOOD)
    p.beam((0, .95, .25), (0, .82, .5), .06, IRON)
    p.cylinder(0, .2, .55, .17, .4, WOOD, sides=12)
    p.cylinder(0, .39, .55, .15, .02, GREEN, sides=12, detail=True)
    flag(p, tint=[.72, .8, .45])
    stalks(p, -.7, .2, .95, -.1, 3, .08, seed=5)
    return p


def lenha(Piece, name='lenha'):
    """Firewood for the furnace, split logs stacked between posts under a
    board lean-to. Standing cover."""
    p = Piece(name, 3.4, 1.4)
    p.box(0, .65, 0, 3.0, 1.3, .9, WOOD, True, 'wood', bevel=.05)
    flag(p, lods=[2])
    for r in range(6):
        for i in range(12):
            x = -1.38 + i * .25 + (r % 2) * .12
            if x > 1.42:
                continue
            p.cylinder(x, .12 + r * .21, 0, .1 + ((i + r) % 3) * .012, .9, WOOD if (i + r) % 3 else DARK, sides=7, axis='z', detail=r % 2 == 1)
            flag(p, tint=[.86, .68, .5] if (i * 3 + r) % 4 else [.7, .54, .4])
    for x in [-1.55, 1.55]:
        for z in [-.5, .5]:
            p.box(x, (1.9 if z < 0 else 1.55) / 2, z, .1, 1.9 if z < 0 else 1.55, .1, DARK, bevel=.01)
    for i in range(8):
        x = -1.6 + (i + .5) * 3.2 / 8
        p.beam((x, 1.95, -.65), (x, 1.6, .7), .4, WOOD, .04)
        flag(p, tint=[.8, .66, .5] if i % 2 else [.7, .58, .44])
    return p


def cocho(Piece, name='cocho'):
    """A hollowed-log water trough on two blocks, for the oxen."""
    p = Piece(name, 2.2, .8)
    p.box(0, .28, 0, 2.0, .56, .6, WOOD, True, 'wood', bevel=.06)
    flag(p, lods=[2])
    p.cylinder(0, .4, 0, .3, 2.0, WOOD, sides=10, axis='x', top=.3)
    flag(p, lods=[0, 1])
    p.box(0, .6, 0, 1.85, .03, .4, GLASS, bevel=0)
    flag(p, tint=[.5, .75, .8], lods=[0, 1])
    for x in [-.75, .75]:
        p.box(x, .1, 0, .3, .2, .7, BLOCK, bevel=.03)
    return p


def add_engenho(Piece):
    engenho(Piece)
    chamine(Piece)
    cana(Piece)
    carro_boi(Piece)
    feixe_cana(Piece)
    garapeira(Piece)
    lenha(Piece)
    cocho(Piece)
