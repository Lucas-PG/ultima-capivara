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
        # Solid whitewashed end walls with a blind stone door and a high vent.
        x = side * W / 2
        p.box(x, H / 2, 0, .6, H, D - .9, WALL, True, bevel=0)
        for dz in [-.95, .95]:
            p.box(x + side * .32, 1.3, dz, .1, 2.6, .25, STONE, bevel=.02)
        p.box(x + side * .32, 2.72, 0, .1, .25, 2.2, STONE, bevel=.02)
        p.box(x + side * .31, 1.25, 0, .04, 2.4, 1.65, DARK, bevel=.01)
        p.box(x + side * .31, 4.1, 0, .04, .5, 1.0, DARK, bevel=0)
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


def add_engenho(Piece):
    engenho(Piece)
    chamine(Piece)
    cana(Piece)
