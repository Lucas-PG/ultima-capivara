"""Capela do Morro: the hill chapel's stone stair and its cruzeiro.
The escadaria climbs 11.4 m in one straight 20 m flight between whitewashed cheek
walls with a stone coping, lantern pillars at the foot and ball finials at the
top. Game coordinates: metres, Y up, bottom-centred origin, the foot at +Z.
The ground under the flight is cut to it (src/shared/terrain.ts), so every
tread stands on the hillside instead of floating over it.
"""
from access import floor_record, route
from rocks import surface

WALL, CORAL, TEAL, YELLOW, ROOF, WOOD, BLOCK, DARK, NAVY, IRON, GLASS, CANVAS, GREEN, BRICK, STONE, TRIM = range(16)
# Keep in step with CAPELA_STAIR in src/shared/layout.ts.
# Its 20 m run spans ten 2 m terrain cells exactly, foot and head on grid lines.
RISERS, RISE, RUN, WALK = 40, .285, .5, 3.4
CHEEK = .45
LAMP = [1, .9, .66]


def flag(p, **values):
    p.parts[-1].update(values)


def prism(p, x0, x1, bottom, top, z0, z1, tile, underside=False):
    """A sloping wall slab between x0 < x1 from z0 (foot) to z1 (top end):
    bottom(z) and top(z) are its lower and upper edges. Outward faces only;
    the underside only where it overhangs and can be seen."""
    v = [(x0, bottom(z0), z0), (x0, top(z0), z0), (x0, top(z1), z1), (x0, bottom(z1), z1),
         (x1, bottom(z0), z0), (x1, top(z0), z0), (x1, top(z1), z1), (x1, bottom(z1), z1)]
    faces = [(0, 1, 2, 3), (4, 7, 6, 5), (1, 5, 6, 2), (0, 4, 5, 1), (3, 2, 6, 7)]
    if underside:
        faces.append((0, 3, 7, 4))
    surface(p, v, faces, tile, detail=False)
    flag(p, planar=True)


def post_lantern(p, x, y, z):
    """A cast-iron post lantern standing on a pillar cap."""
    p.cylinder(x, y + .35, z, .05, .7, IRON, sides=6)
    p.box(x, y + .86, z, .3, .36, .3, CANVAS, bevel=.012)
    flag(p, tint=LAMP)
    for dx in [-.14, .14]:
        for dz in [-.14, .14]:
            p.box(x + dx, y + .86, z + dz, .035, .4, .035, IRON, bevel=0, detail=True)
    p.cylinder(x, y + 1.13, z, .24, .16, IRON, top=.03, sides=4)
    p.box(x, y + .66, z, .34, .05, .34, IRON, bevel=0)


def escadaria(Piece, name='escadaria'):
    L = RISERS * RUN
    p = Piece(name, WALK + 2 * CHEEK + .5, L + 1.4)
    nose = lambda z: RISE + (L / 2 - z) / RUN * RISE
    treads, points = [], [[0, 0, L / 2 + .8]]
    for i in range(RISERS):
        z, top = L / 2 - (i + .5) * RUN, (i + 1) * RISE
        treads.append(len(p.colliders))
        # Each tread is a stone block reaching well under the cut ground.
        p.box(0, top - .45, z, WALK + .02, .9, RUN, STONE, True, bevel=.02)
        points.append([0, top, z])
    for side in [-1, 1]:
        x0, x1 = sorted([side * WALK / 2, side * (WALK / 2 + CHEEK)])
        z0, z1 = L / 2 + .3, -L / 2 - .15
        # Whitewashed cheek walls 0.85 m above the nosing line, buried 2.8 m below it.
        prism(p, x0, x1, lambda z: nose(z) - 2.8, lambda z: nose(z) + .85, z0, z1, WALL)
        # A limestone coping rides the whole wall, proud on both faces.
        xm = side * (WALK / 2 + CHEEK / 2)
        prism(p, xm - .31, xm + .31, lambda z: nose(z) + .83, lambda z: nose(z) + .95, z0, z1, STONE, underside=True)
        # Stepped solids inside the sloping wall, one per two treads.
        for k in range(RISERS // 2):
            zc = L / 2 - (k + .5) * 2 * RUN
            top = nose(zc) + .9
            p.colliders.append(dict(type='box', x=xm, y=top - 1.8, z=zc, width=CHEEK, height=3.6, depth=2 * RUN, yaw=0, material='stone'))
        # Pillars: two with lanterns at the foot, one breaking each third of
        # the flight, and two with stone finials at the top.
        px = side * (WALK / 2 + CHEEK / 2)
        p.box(px, .75, L / 2 + .2, .72, 1.5, .72, WALL, True, bevel=.03)
        p.box(px, 1.56, L / 2 + .2, .84, .12, .84, STONE, bevel=.02)
        post_lantern(p, px, 1.62, L / 2 + .2)
        for k in [13, 27]:
            z = L / 2 - k * RUN
            p.box(px, nose(z) + .55, z, .62, 1.3, .62, WALL, bevel=.03)
            flag(p, mid=True)
            p.box(px, nose(z) + 1.23, z, .72, .1, .72, STONE, bevel=.02)
            flag(p, mid=True)
        top = RISERS * RISE
        # Rooted a metre into the adro edge, where the ground rolls off the cut.
        p.box(px, top + .2, -L / 2 - .3, .72, 2.4, .72, WALL, True, bevel=.03)
        p.box(px, top + 1.46, -L / 2 - .3, .84, .12, .84, STONE, bevel=.02)
        p.cylinder(px, top + 1.57, -L / 2 - .3, .13, .14, STONE, top=.09, sides=12)
        p.orb(px, top + 1.8, -L / 2 - .3, .4, .44, .4, STONE, False)
        flag(p, segments=(14, 9), smooth=True)
    top = RISERS * RISE
    floor = floor_record(p, treads[-1], 'adro')
    p.traversal = dict(floors=[floor],
        entrances=[dict(id='foot', point=points[0]), dict(id='top', point=[0, top, -L / 2 - .8])],
        routes=[route('climb', 'foot', 'adro', points),
                route('arrive', 'top', 'adro', [[0, top, -L / 2 - .8], [0, top, -L / 2 + RUN / 2]])],
        stairs=[dict(id='escadaria', **{'from': 'foot', 'to': 'adro'}, colliderIndices=treads)])
    return p


def cruzeiro(Piece, name='cruzeiro'):
    """The churchyard cross: a timber cross over a whitewashed pedestal on
    three stone steps, a white sudario hanging from its arms."""
    p = Piece(name, 2.6, 2.6)
    for i, size in enumerate([2.6, 2.0, 1.4]):
        p.box(0, i * .3 + .15, 0, size, .3, size, STONE, True, bevel=.03)
    p.box(0, 1.45, 0, .8, 1.1, .8, WALL, True, bevel=.03)
    p.box(0, 2.06, 0, .96, .12, .96, STONE, bevel=.02)
    p.box(0, .98, 0, .9, .1, .9, STONE, bevel=.02)
    p.box(0, 4.72, 0, .26, 5.2, .26, DARK, True, 'wood', bevel=.02)
    p.box(0, 6.0, 0, 2.3, .24, .24, DARK, True, 'wood', bevel=.02)
    p.box(0, 7.36, 0, .34, .1, .34, IRON, bevel=0)
    p.box(0, 6.62, .15, .46, .2, .04, CANVAS, bevel=.005, detail=True)
    flag(p, tint=[.92, .88, .76])
    # The sudario: white cloth over the arm, falling on both sides of the post.
    for side in [-1, 1]:
        x = side * .62
        v = [(x - .2, 6.12, .15), (x + .2, 6.12, .15), (x + .23, 4.9, .19), (x - .17, 4.95, .19)]
        surface(p, v + [(a, b, c - .03) for a, b, c in v], [(0, 3, 2, 1), (4, 5, 6, 7)], CANVAS, detail=False)
        flag(p, tint=[1, .98, .94])
    v = [(-.45, 6.12, .15), (.45, 6.12, .15), (.3, 5.72, .2), (-.3, 5.72, .2)]
    surface(p, v + [(a, b, c - .03) for a, b, c in v], [(0, 3, 2, 1), (4, 5, 6, 7)], CANVAS, detail=False)
    flag(p, tint=[1, .98, .94])
    return p


def add_capela(Piece):
    escadaria(Piece)
    cruzeiro(Piece)
