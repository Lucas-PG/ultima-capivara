"""Street dressing: the small things that make a street lived in. Potted
plants by the doors, plastic bar tables under a parasol, a coconut-water cart,
fishing nets, sacks and a cargo pallet. Game coordinates, bottom-centred.
Soft props carry no collision; anything a player could hide behind does.
"""
import math
from rocks import surface

WALL, CORAL, TEAL, YELLOW, ROOF, WOOD, BLOCK, DARK, NAVY, IRON, GLASS, CANVAS, GREEN, BRICK, STONE, TRIM = range(16)
RED = [.86, .22, .18]


def flag(p, **values):
    p.parts[-1].update(values)


def pot(p, x, z, radius, height, tile=ROOF, tint=None):
    """A turned terracotta pot: foot, belly, rolled rim, soil."""
    rings = [(0, radius * .7), (.12, radius * .8), (.7, radius), (.86, radius * 1.02), (.9, radius * 1.1), (1, radius * 1.08)]
    sides = 10
    vertices = [(x + r * math.cos(math.tau * i / sides), h * height, z + r * math.sin(math.tau * i / sides)) for h, r in rings for i in range(sides)]
    faces = []
    for row in range(len(rings) - 1):
        for i in range(sides):
            a, b = row * sides + i, row * sides + (i + 1) % sides
            faces.append((a, a + sides, b + sides, b))
    surface(p, vertices, faces, tile, detail=False, tint=tint)
    flag(p, smooth=True, lods=[0, 1])
    p.cylinder(x, height * .97, z, radius * .98, .04, DARK, sides=10)
    flag(p, mid=True)
    # Far: a plain six-sided pot.
    p.cylinder(x, height / 2, z, radius * .95, height, tile, top=radius * 1.08, sides=6)
    flag(p, lods=[2], tint=tint or [1, 1, 1])


def vaso(Piece, name, radius, height, spread, style):
    """A terracotta pot by a door. The kit draws the pot and its soil; the painted plant in it
    comes from the vegetation layer (anchor 'pot': rim height and radius, planting style)."""
    p = Piece(name, spread * 2.2, spread * 2.2)
    pot(p, 0, 0, radius, height)
    p.plant('pot', 0, height * .97, 0, radius=radius * 1.08, style=style)
    return p


def mesa_bar(Piece, name='mesa_bar'):
    """The Brazilian bar table: a square plastic table, four stacking chairs
    and a striped parasol on a pole. The table top is cover height only."""
    p = Piece(name, 3.2, 3.2)
    tint = [.95, .78, .2]
    p.box(0, .72, 0, .8, .05, .8, CANVAS, True, 'wood', bevel=.02)
    flag(p, tint=tint)
    for dx in [-.34, .34]:
        for dz in [-.34, .34]:
            p.box(dx, .35, dz, .05, .7, .05, CANVAS, bevel=.01)
            flag(p, tint=tint)
    for i, (dx, dz) in enumerate([(0, -.78), (0, .78), (-.78, 0), (.78, 0)]):
        c = [RED, tint][i % 2]
        ox, oz = (dx / .78, dz / .78)
        along_x = abs(dz) > 0
        p.box(dx, .44, dz, .44, .04, .42, CANVAS, bevel=.015)
        flag(p, tint=c, mid=True)
        p.box(dx + ox * .2, .72, dz + oz * .2, .44 if along_x else .04, .5, .04 if along_x else .44, CANVAS, bevel=.015)
        flag(p, tint=c, mid=True)
        for lx in [-.18, .18]:
            for lz in [-.17, .17]:
                p.box(dx + lx, .22, dz + lz, .035, .44, .035, CANVAS, bevel=0, detail=True)
                flag(p, tint=c)
    p.cylinder(0, 1.25, 0, .03, 2.5, IRON, sides=6)
    ribs = 8
    for i in range(ribs):
        a0, a1 = math.tau * i / ribs, math.tau * (i + 1) / ribs
        vertices = [(0, 2.62, 0), (1.45 * math.cos(a0), 2.18, 1.45 * math.sin(a0)), (1.45 * math.cos(a1), 2.18, 1.45 * math.sin(a1))]
        surface(p, vertices + [(v[0], v[1] - .02, v[2]) for v in vertices], [(0, 2, 1), (3, 4, 5)], CANVAS if i % 2 else CORAL, detail=False)
    return p


def carrinho(Piece, name='carrinho_coco'):
    """A coconut-water cart: green body on two wheels, a stack of coconuts, a
    chilled box and a faded parasol."""
    p = Piece(name, 2.4, 1.4)
    p.box(0, .75, 0, 1.7, .7, .9, GREEN, True, 'wood', bevel=.04)
    p.box(0, 1.12, 0, 1.8, .06, 1.0, WOOD, bevel=.02)
    for x in [-.55, .55]:
        p.cylinder(x, .35, .52, .34, .08, DARK, sides=14, axis='z')
        p.cylinder(x, .35, .56, .07, .06, IRON, sides=8, axis='z')
    p.beam((-.95, .9, 0), (-1.25, .95, 0), .05, IRON)
    for i in range(9):
        row = 0 if i < 5 else 1 if i < 8 else 2
        x = -.45 + (i - [0, 5, 8][row]) * .22 + row * .11
        p.orb(x, 1.25 + row * .16, -.15 + (i % 2) * .08, .22, .22, .22, GREEN, i > 6)
        flag(p, segments=(6, 4), tint=[.55, .8, .35])
    p.box(.5, 1.32, .1, .5, .34, .4, CANVAS, bevel=.03)
    flag(p, tint=[.35, .6, .85])
    p.cylinder(.1, 1.9, 0, .025, 1.6, IRON, sides=6)
    for i in range(6):
        a0, a1 = math.tau * i / 6, math.tau * (i + 1) / 6
        vertices = [(.1, 2.75, 0), (.1 + 1.0 * math.cos(a0), 2.42, 1.0 * math.sin(a0)), (.1 + 1.0 * math.cos(a1), 2.42, 1.0 * math.sin(a1))]
        surface(p, vertices + [(v[0], v[1] - .02, v[2]) for v in vertices], [(0, 2, 1), (3, 4, 5)], CANVAS if i % 2 else YELLOW, detail=False)
    return p


def rede(Piece, name='rede_pesca'):
    """A heaped fishing net with floats and a coil of rope; walkable over."""
    p = Piece(name, 2.2, 1.6)
    for i in range(7):
        a = i * 2.1
        p.orb(math.cos(a) * .45, .2 + (i % 3) * .07, math.sin(a) * .3, .95, .45, .75, CANVAS, False)
        flag(p, segments=(7, 4), tint=[.32, .45, .42] if i % 2 else [.42, .36, .26])
    for i in range(6):
        a = i * 1.1
        p.orb(math.cos(a) * .7, .22, math.sin(a) * .45, .14, .12, .14, CANVAS, True)
        flag(p, segments=(5, 3), tint=[.95, .45, .2])
    p.cylinder(.75, .1, -.45, .28, .2, CANVAS, sides=12)
    flag(p, tint=[.8, .7, .5])
    return p


def sacos(Piece, name='sacos'):
    """Stacked jute sacks of sugar and flour: low cover on the quays."""
    p = Piece(name, 1.8, 1.2)
    # The solid core sits inside the sacks; only their rounded jute shows.
    p.box(0, .35, 0, 1.2, .7, .7, CANVAS, True, 'wood', bevel=.1)
    flag(p, tint=[.74, .62, .46])
    for i, (x, y, z) in enumerate([(-.4, .22, -.24), (.4, .22, -.24), (-.4, .22, .24), (.4, .22, .24), (-.2, .62, 0), (.26, .62, .02)]):
        p.orb(x, y, z, .86, .46, .56, CANVAS, False)
        flag(p, segments=(7, 4), tint=[.82, .7, .52] if i % 2 else [.74, .62, .46])
    for x in [-.4, .4]:
        p.box(x, .24, -.52, .1, .06, .04, CANVAS, bevel=0, detail=True)
        flag(p, tint=[.5, .38, .28])
    return p


MURO_H, MURO_T = 1.35, .3
BARRA = [.4, .54, .66]


def coping(p, x0, x1, y):
    """Clay-tile coping: a shallow ridge over the wall, overhanging both faces."""
    v = [(x0, y, -.2), (x0, y + .13, 0), (x0, y, .2), (x1, y, -.2), (x1, y + .13, 0), (x1, y, .2)]
    surface(p, v, [(0, 1, 4, 3), (1, 2, 5, 4), (0, 2, 1), (3, 4, 5), (0, 3, 5, 2)], ROOF, detail=False)
    flag(p, planar=True)


def pillar(p, x, solid=True):
    p.box(x, .8, 0, .42, 1.6, .42, WALL, solid, bevel=.025)
    p.box(x, 1.64, 0, .5, .08, .5, STONE, bevel=.015)


def muro(Piece, name='muro', length=3.0, kind='plain'):
    """A whitewashed quintal wall at chest height, cover for a crouching
    player: a painted barra, a clay-tile coping and a pillar at its +x end, so
    walls chain along a yard line. 'gate' leaves a 1.2 m opening with its
    timber leaf swung open into the yard (-z); 'flor' spills bougainvillea
    over the lane side (+z)."""
    p = Piece(name, length + .45, 1.0 if kind == 'flor' else .5)
    spans = [(-length / 2, -.6), (.6, length / 2)] if kind == 'gate' else [(-length / 2, length / 2)]
    for x0, x1 in spans:
        p.box((x0 + x1) / 2, MURO_H / 2, 0, x1 - x0, MURO_H, MURO_T, WALL, True, bevel=.02)
        for side in [-1, 1]:
            p.box((x0 + x1) / 2, .21, side * (MURO_T / 2 + .006), x1 - x0, .42, .012, CANVAS, bevel=0)
            flag(p, tint=BARRA, mid=True)
        coping(p, x0, x1, MURO_H)
    pillar(p, length / 2)
    if kind == 'gate':
        for x in [-.8, .8]:
            pillar(p, x)
        p.box(-.57, .72, -.62, .05, 1.2, 1.1, WOOD, True, 'wood', bevel=.01)
        for z in [-.3, -.62, -.94]:
            p.box(-.54, .72, z, .012, 1.16, .03, DARK, bevel=0, detail=True)
    if kind == 'flor':
        # Bougainvillea from the yard (anchors for the painted vegetation layer): a bush behind the
        # wall and its cascade spilling over the coping down the lane face.
        p.plant('bush', 0, 0, -.85, species='bougainvillea', height=1.9)
        p.plant('drape', -.1, MURO_H + .12, MURO_T / 2 + .05, width=2.5, drop=.85)
    return p


def add_dressing(Piece):
    vaso(Piece, 'vaso', .32, .55, .45, 'flower')
    vaso(Piece, 'vaso_alto', .26, .8, .38, 'tall')
    vaso(Piece, 'vaso_flor', .22, .38, .32, 'flower')
    mesa_bar(Piece)
    carrinho(Piece)
    rede(Piece)
    sacos(Piece)
    muro(Piece)
    muro(Piece, 'muro_portao', kind='gate')
    muro(Piece, 'muro_flor', kind='flor')
    p = Piece('muro_pilar', .5, .5)
    pillar(p, 0)
