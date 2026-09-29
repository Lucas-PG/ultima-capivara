"""Waterfront pieces: quay walls, quay stairs and the town bridges.
Game coordinates: metres, Y up, bottom-centred origin, +Z toward the water
(quays) or along the crossing (bridges). Every solid emits its own collider.
"""
import math
from rocks import surface
from access import floor_record, route

# Quay geometry shared with src/shared/terrain.ts: the walls are 5 m deep so the
# 2 m height grid's step from promenade to river bed always happens under the stone.
QUAY_HEIGHT = 4.2   # from below the bed to the promenade
QUAY_DEPTH = 5.0
QUAY_TOP = 3.6      # stair landing above the river bed
WATER = 1.35        # water surface above the river bed


def quay_face(p, length, height, depth, lift=0.0, recess=0.0):
    """A cut-stone quay block: coursed face, darker waterline, coping slabs.
    Neighbouring stones overlap along a bending quay; variants lift their
    coping and set back their face a few millimetres so no two surfaces
    coincide, while every solid top stays exactly at the promenade."""
    p.box(0, height / 2, -(depth + recess) / 2, length, height, depth - recess, 6, True, bevel=.05)
    # Coping: slightly proud slabs, the walkable edge of the promenade.
    count = max(2, round(length / 1.6))
    for i in range(count):
        x = -length / 2 + (i + .5) * length / count
        p.box(x, height + .04 + lift, -depth / 2 - .04 - recess / 2, length / count - .05, .12, depth + .14 - recess, 14, bevel=.025)
    # Face courses with staggered joints, and a darker weathered waterline band.
    for row in range(4):
        y = height - .55 - row * .62
        offset = .4 if row % 2 else 0
        blocks = max(2, round(length / 1.25))
        for i in range(blocks):
            x = -length / 2 + (i + .5) * length / blocks + offset
            if abs(x) > length / 2 - .35:
                continue
            p.box(x, y, .015 - recess, length / blocks - .06, .56, .05, 14 if (i + row) % 3 == 0 else 6, bevel=.02, detail=True)
    p.box(0, height - 3.0, .02 - recess, length - .1, .5, .06, 9, bevel=.02, detail=True)


def quay_wall(Piece, name='quay_wall', length=8.0, lift=0.0, recess=0.0):
    p = Piece(name, length, QUAY_DEPTH)
    quay_face(p, length, QUAY_HEIGHT, QUAY_DEPTH, lift, recess)
    # Iron mooring ring and a drain spout on the face; a bollard on the coping.
    p.cylinder(-1.9, QUAY_HEIGHT - 1.15, .08, .17, .04, 9, sides=10, detail=True, axis='z')
    p.box(2.4, QUAY_HEIGHT - 1.6, .12, .34, .24, .3, 14, bevel=.03, detail=True)
    p.box(2.4, QUAY_HEIGHT - 1.66, .22, .22, .06, .2, 9, bevel=.01, detail=True)
    p.cylinder(1.2, QUAY_HEIGHT + .45, -.5, .17, .7, 9, True, 'metal', sides=12)
    p.orb(1.2, QUAY_HEIGHT + .82, -.5, .3, .16, .3, 9)
    return p


def quay_stair(Piece, name='quay_stair'):
    """A landing stair built against the quay face, running along the wall
    from the promenade down below the waterline. Every tread is a solid block
    standing on the river bed, so nothing floats; a swimmer steps onto the
    submerged bottom tread and walks up along the wall."""
    length, width = 8.0, 1.6
    p = Piece(name, length, width + QUAY_DEPTH)
    # The wall section this stair replaces sits 0.6 m below the promenade top of
    # a standard quay piece so both share the same coping line.
    lift = QUAY_TOP - QUAY_HEIGHT
    p.box(0, (QUAY_TOP + lift) / 2, -QUAY_DEPTH / 2, length, QUAY_TOP - lift, QUAY_DEPTH, 6, True, bevel=.05)
    for i in range(5):
        x = -length / 2 + (i + .5) * length / 5
        p.box(x, QUAY_TOP + .04, -QUAY_DEPTH / 2 - .04, length / 5 - .05, .12, QUAY_DEPTH + .14, 14, bevel=.025)
    # Top landing, level with the promenade, then fifteen 0.2 m risers.
    landing_x0, landing_x1 = -length / 2, -2.8
    p.box((landing_x0 + landing_x1) / 2, QUAY_TOP / 2, width / 2, landing_x1 - landing_x0, QUAY_TOP, width, 6, True, bevel=.03)
    p.box((landing_x0 + landing_x1) / 2, QUAY_TOP + .015, width / 2, landing_x1 - landing_x0 + .04, .05, width + .04, 14, bevel=.012)
    count, run = 15, .4
    for i in range(count):
        top = QUAY_TOP - .2 * (i + 1)
        x0 = landing_x1 + i * run
        x1 = length / 2 if i == count - 1 else x0 + run
        p.box((x0 + x1) / 2, top / 2, width / 2, x1 - x0, top, width, 6 if top > WATER else 14, True, bevel=.02)
        p.box((x0 + x1) / 2, top + .012, width / 2, x1 - x0 + .02, .04, width + .02, 14, bevel=.008, detail=True)
    # A low kerb on the water side of the landing, iron mooring rings and a bollard.
    p.box((landing_x0 + landing_x1) / 2, QUAY_TOP + .14, width - .09, landing_x1 - landing_x0, .28, .18, 14, True, bevel=.03)
    for x in [-1.5, 2.2]:
        p.cylinder(x, QUAY_TOP - 1.25 + .2 * (x > 0), .1, .16, .04, 9, sides=10, detail=True, axis='z')
    p.cylinder(-2.1, QUAY_TOP + .35, -.55, .19, .7, 9, True, 'metal', sides=12)
    p.orb(-2.1, QUAY_TOP + .72, -.55, .34, .18, .34, 9)
    return p


def quay_corner(Piece, name='quay_corner', length=5.0):
    """A square quay block for the joints of a bending quay: it covers the
    wedge that opens behind two wall runs meeting at an angle."""
    p = Piece(name, length, QUAY_DEPTH)
    quay_face(p, length, QUAY_HEIGHT, QUAY_DEPTH, .024, .05)
    return p


# Bridges: local origin 3.6 m below the deck top (the walled river bed), the
# crossing along local z. The deck ends are flush with the quay promenade.
DECK = QUAY_TOP
BRIDGE_HALF = 9.5          # half length: the abutments are as deep as the quay stones
STONE, TRIM, BLOCK, WOOD, DARK, IRON, WALL, ROOF, GREEN, CANVAS = 14, 15, 6, 5, 7, 9, 0, 4, 12, 11


def arch_prisms(p, z0, z1, spring, top, x0, x1, tile=STONE, segmental_rise=None, steps=8):
    """Solid-looking masonry over one arch opening between z0 and z1: two
    quarter spandrels whose curved inner faces form the vault soffit."""
    half = (z1 - z0) / 2
    zc = (z0 + z1) / 2
    if segmental_rise is None:
        radius, centre, start = half, spring, math.pi / 2
    else:
        radius = (half * half + segmental_rise * segmental_rise) / (2 * segmental_rise)
        centre, start = spring + segmental_rise - radius, math.asin(half / radius)
    crown = centre + radius
    for side in [-1, 1]:
        corner = (zc + side * half, top)
        arc = [(zc + side * radius * math.sin(start * (1 - i / steps)), centre + radius * math.cos(start * (1 - i / steps)))
               for i in range(steps + 1)]
        outline = [corner] + arc + [(zc, top)]
        n = len(outline)
        vertices = [(x, y, z) for x in [x0, x1] for z, y in outline]
        faces = []
        for i in range(1, n - 1):
            a, b = (i, i + 1) if side < 0 else (i + 1, i)
            faces.append((0, a, b))
            faces.append((n, n + b, n + a))
        for i in range(1, n - 2):
            a, b = (i, i + 1) if side < 0 else (i + 1, i)
            faces.append((a, n + a, n + b, b))
        surface(p, vertices, faces, tile, detail=False)
        p.parts[-1]['planar'] = True
    return crown


def arch_ring(p, z0, z1, spring, x, tile=TRIM, segmental_rise=None, count=11, width=.32, proud=.1):
    """Voussoirs proud of one bridge face (the face plane is x)."""
    half, zc = (z1 - z0) / 2, (z0 + z1) / 2
    if segmental_rise is None:
        radius, centre, start = half, spring, math.pi / 2
    else:
        radius = (half * half + segmental_rise * segmental_rise) / (2 * segmental_rise)
        centre, start = spring + segmental_rise - radius, math.asin(half / radius)
    ring = radius + width / 2
    for i in range(count):
        # Angle from the vertical: -start..start across the arch.
        t = -start + 2 * start * (i + .5) / count
        a = math.pi / 2 - t
        chord = 2 * ring * math.sin(start / count) - .03
        key = i == count // 2
        p.box(x + math.copysign(proud / 2, x), centre + ring * math.cos(t), zc + ring * math.sin(t), chord,
              width * (1.3 if key else 1), proud, STONE if key else tile, bevel=.012, yaw=-math.pi / 2, roll=math.pi / 2 - a)


def balustrade(p, x, z0, z1, pedestals, height=1.05, lanterns=()):
    """Stone balustrade along one bridge side: plinth, turned balusters,
    coping rail and pedestals; iron lanterns on some pedestals."""
    length = z1 - z0
    p.box(x, DECK + .12, (z0 + z1) / 2, .42, .24, length, TRIM, True, bevel=.02)
    p.box(x, DECK + height - .06, (z0 + z1) / 2, .46, .12, length, TRIM, True, bevel=.02)
    count = round(length / .3)
    for i in range(count):
        z = z0 + (i + .5) * length / count
        if any(abs(z - zp) < .45 for zp in pedestals):
            continue
        p.cylinder(x, DECK + .24 + (height - .36) / 2, z, .085, height - .36, STONE, top=.055, sides=5, detail=True)
    p.box(x, DECK + .3 + (height - .5) / 2, (z0 + z1) / 2, .12, height - .5, length, STONE, bevel=0, detail=False)
    p.parts[-1]['lods'] = [1, 2]
    for zp in pedestals:
        p.box(x, DECK + (height + .15) / 2, zp, .6, height + .15, .6, STONE, True, bevel=.03)
        p.box(x, DECK + height + .15, zp, .7, .1, .7, TRIM, bevel=.02)
        if zp in lanterns:
            p.cylinder(x, DECK + height + 1.25, zp, .07, 2.2, IRON, sides=8)
            p.box(x, DECK + height + 2.45, zp, .3, .4, .3, CANVAS, bevel=.01)
            p.parts[-1]['tint'] = [1, .93, .72]
            p.cylinder(x, DECK + height + 2.75, zp, .24, .22, IRON, top=.02, sides=4)
            for dz in [-.15, .15]:
                for dx in [-.15, .15]:
                    p.box(x + dx, DECK + height + 2.45, zp + dz, .035, .42, .035, IRON, bevel=0, detail=True)


def bridge_deck(p, width, tile=STONE, joints=True):
    index = len(p.colliders)
    p.box(0, DECK - .2, 0, width, .4, BRIDGE_HALF * 2, tile, True, bevel=.02)
    if joints:
        for i in range(24):
            z = -BRIDGE_HALF + (i + .5) * BRIDGE_HALF * 2 / 24
            p.box(0, DECK + .004, z, width - .3, .008, .05, BLOCK, bevel=0, detail=True)
    return index


def bridge_traversal(p, deck_index):
    floor = floor_record(p, deck_index, 'deck')
    top, half = floor['y'], BRIDGE_HALF
    p.traversal = dict(floors=[floor],
        entrances=[dict(id='back', point=[0, top, -half - .7]), dict(id='front', point=[0, top, half + .7])],
        routes=[route('back-entry', 'back', 'deck', [[0, top, -half + .5], [0, top, 0]]),
                route('front-entry', 'front', 'deck', [[0, top, half - .5], [0, top, 0]])], stairs=[])


def abutments(p, face, width, tile=BLOCK):
    """Masonry from the water face back to the deck ends, standing on the bed."""
    for side in [-1, 1]:
        z = side * (face + BRIDGE_HALF) / 2
        p.box(0, (DECK - .4 - .6) / 2, z, width, DECK - .4 + .6, BRIDGE_HALF - face, tile, True, bevel=.04)
        # Coursed ashlar on both faces, as on the quays.
        for row in range(3):
            y = 1.9 + row * .55
            for i in range(4):
                zz = side * (face + (i + .5 + (row % 2) * .5) * (BRIDGE_HALF - face) / 4.5)
                if abs(zz) > BRIDGE_HALF - .3:
                    continue
                for x in [-width / 2 - .015, width / 2 + .015]:
                    p.box(x, y, zz, .05, .48, (BRIDGE_HALF - face) / 4.5 - .06, STONE if (i + row) % 3 == 0 else BLOCK, bevel=.015, detail=True)


def bridge_arch(Piece, name='bridge_arch'):
    """Ponte da Matriz: a two-arch limestone bridge on the praça axis, with a
    cutwater pier, voussoirs, a moulded string course, a balustrade with
    pedestals and four lanterns."""
    width, face = 7.0, 4.5
    p = Piece(name, width, BRIDGE_HALF * 2)
    deck = bridge_deck(p, width - .2)
    abutments(p, face, width)
    pier = .7
    p.box(0, (DECK - .4 - .6) / 2, 0, width, DECK - .4 + .6, pier * 2, BLOCK, True, bevel=.04)
    for side in [-1, 1]:
        # Pointed cutwaters upstream and downstream, capped just above the water.
        x = side * width / 2
        tip = (x + side * 1.1, 0)
        vertices = [(x, -.6, -pier), (x, -.6, pier), (tip[0], -.6, 0), (x, 2.0, -pier), (x, 2.0, pier), (tip[0], 2.0, 0)]
        faces = [(0, 2, 1), (3, 4, 5), (0, 3, 5, 2), (2, 5, 4, 1)] if side > 0 else [(0, 1, 2), (3, 5, 4), (0, 2, 5, 3), (2, 1, 4, 5)]
        surface(p, vertices, faces, BLOCK, detail=False)
        p.parts[-1]['planar'] = True
        p.cylinder(x + side * .4, 2.1, 0, .75, .2, TRIM, top=.35, sides=4)
    spring = 1.2
    for z0, z1 in [(-face, -pier), (pier, face)]:
        arch_prisms(p, z0, z1, spring, DECK - .4, -width / 2, width / 2)
        for x in [-width / 2, width / 2]:
            arch_ring(p, z0, z1, spring, x)
    for x in [-width / 2 - .06, width / 2 + .06]:
        p.box(x, DECK - .3, 0, .14, .22, BRIDGE_HALF * 2, TRIM, bevel=.02)
    ped = [-BRIDGE_HALF + .3, -face, 0, face, BRIDGE_HALF - .3]
    for x in [-width / 2 + .21, width / 2 - .21]:
        balustrade(p, x, -BRIDGE_HALF, BRIDGE_HALF, ped, lanterns=(-face, face))
    bridge_traversal(p, deck)
    return p


def bridge_chapel(Piece, name='bridge_chapel'):
    """Ponte da Capelinha: one whitewashed segmental arch with a solid
    parapet, and a little oratório with a tiled hood over the downstream side."""
    width, face = 6.4, 5.0
    p = Piece(name, width, BRIDGE_HALF * 2)
    deck = bridge_deck(p, width - .2)
    abutments(p, face, width, WALL)
    rise, spring = 1.85, 1.25
    arch_prisms(p, -face, face, spring, DECK - .4, -width / 2, width / 2, WALL, segmental_rise=rise, steps=10)
    for x in [-width / 2, width / 2]:
        arch_ring(p, -face, face, spring, x, TRIM, segmental_rise=rise, count=15, width=.36)
        p.box(x + math.copysign(.05, x), DECK - .3, 0, .12, .2, BRIDGE_HALF * 2, TRIM, bevel=.02)
    for x in [-width / 2 + .15, width / 2 - .15]:
        p.box(x, DECK + .5, 0, .3, 1.0, BRIDGE_HALF * 2, WALL, True, bevel=.03)
        p.box(x, DECK + 1.05, 0, .42, .1, BRIDGE_HALF * 2 + .1, TRIM, True, bevel=.02)
        for z in [-BRIDGE_HALF + .35, BRIDGE_HALF - .35]:
            p.box(x, DECK + .7, z, .5, 1.4, .6, TRIM, True, bevel=.03)
            p.orb(x, DECK + 1.55, z, .34, .34, .34, TRIM, False)
    # The oratório: a niche on corbels over the parapet, a saint's tile, flowers.
    x = width / 2 + .2
    p.box(x, DECK + 1.7, 0, .6, 2.2, 1.5, WALL, bevel=.03)
    p.box(x + .05, DECK + 1.75, 0, .52, 1.3, .9, 8, bevel=.02)
    p.box(x + .27, DECK + 1.75, 0, .04, 1.1, .7, 2, bevel=.01)
    p.box(x + .3, DECK + 2.1, 0, .03, .5, .08, TRIM, bevel=0)
    p.box(x + .3, DECK + 2.2, 0, .03, .08, .3, TRIM, bevel=0)
    p.beam((x - .2, DECK + 2.95, -.95), (x + .55, DECK + 2.7, -.95), .2, ROOF)
    for z in [-.85, -.5, -.15, .15, .5, .85]:
        p.beam((x - .25, DECK + 3.05, z), (x + .6, DECK + 2.75, z), .36, ROOF, .08)
    p.box(x + .1, DECK + 2.83, 0, .9, .12, 1.8, ROOF, bevel=.02)
    for dz in [-.35, .35]:
        p.orb(x + .32, DECK + 1.15, dz, .28, .25, .28, GREEN, False)
        p.orb(x + .38, DECK + 1.25, dz, .14, .12, .14, CANVAS, True)
        p.parts[-1]['tint'] = [.86, .2, .35]
    for dy in [0, .45]:
        p.box(x - .05, DECK + 1.05 + dy, 0, .5, .3, .4, TRIM, bevel=.02)
    bridge_traversal(p, deck)
    return p


def bridge_wood(Piece, name='bridge_wood'):
    """Ponte da Feira: timber deck on stringers over two braced trestle bents,
    between masonry abutments; rails with X-bracing and lantern posts."""
    width, face = 6.0, 5.7
    p = Piece(name, width, BRIDGE_HALF * 2)
    deck = len(p.colliders)
    p.box(0, DECK - .15, 0, width - .1, .3, BRIDGE_HALF * 2, WOOD, True, 'wood', bevel=.015)
    for i in range(38):
        z = -BRIDGE_HALF + (i + .5) * BRIDGE_HALF * 2 / 38
        p.box(0, DECK + .012, z, width - .2, .03, BRIDGE_HALF * 2 / 38 - .04, WOOD if i % 3 else DARK, bevel=.006, detail=True)
    for x in [-width / 2 + .4, -.9, .9, width / 2 - .4]:
        p.box(x, DECK - .5, 0, .24, .4, BRIDGE_HALF * 2 - .2, DARK, bevel=.02)
    for side in [-1, 1]:
        z = side * (face + BRIDGE_HALF) / 2
        p.box(0, (DECK - .7 - .6) / 2, z, width + .4, DECK - .7 + .6, BRIDGE_HALF - face, BLOCK, True, bevel=.04)
        p.box(0, DECK - .64, side * (face + .25), width + .5, .14, .5, STONE, bevel=.02)
    for zb in [-face / 3, face / 3]:
        for x in [-width / 2 + .45, -1.0, 1.0, width / 2 - .45]:
            p.cylinder(x, (DECK - .7 - .8) / 2, zb, .16, DECK - .7 + .8, DARK, True, 'wood', sides=8)
        p.box(0, DECK - .78, zb, width - .4, .18, .28, DARK, bevel=.015)
        p.beam((-width / 2 + .45, .2, zb), (width / 2 - .45, DECK - .9, zb), .1, DARK, .1)
        p.beam((width / 2 - .45, .2, zb), (-width / 2 + .45, DECK - .9, zb), .1, DARK, .1)
    for x in [-width / 2 + .12, width / 2 - .12]:
        posts = 9
        for i in range(posts):
            z = -BRIDGE_HALF + .15 + i * (BRIDGE_HALF * 2 - .3) / (posts - 1)
            p.box(x, DECK + .6, z, .16, 1.2, .16, DARK, True, 'wood', bevel=.02)
            if i < posts - 1:
                z2 = -BRIDGE_HALF + .15 + (i + 1) * (BRIDGE_HALF * 2 - .3) / (posts - 1)
                p.beam((x, DECK + .15, z + .08), (x, DECK + 1.0, z2 - .08), .06, WOOD, .06)
                p.beam((x, DECK + 1.0, z + .08), (x, DECK + .15, z2 - .08), .06, WOOD, .06)
        p.box(x, DECK + 1.15, 0, .2, .1, BRIDGE_HALF * 2, WOOD, True, 'wood', bevel=.015)
        p.box(x, DECK + .6, 0, .08, .08, BRIDGE_HALF * 2, WOOD, bevel=.01)
        for z in [-BRIDGE_HALF + .15, BRIDGE_HALF - .15]:
            p.box(x, DECK + 1.3, z, .22, 2.6, .22, DARK, True, 'wood', bevel=.02)
            p.beam((x, DECK + 2.45, z), (x - math.copysign(.55, x), DECK + 2.55, z), .06, IRON)
            p.box(x - math.copysign(.6, x), DECK + 2.3, z, .24, .32, .24, CANVAS, bevel=.01)
            p.parts[-1]['tint'] = [1, .93, .72]
            p.cylinder(x - math.copysign(.6, x), DECK + 2.52, z, .2, .16, IRON, top=.02, sides=4)
    bridge_traversal(p, deck)
    return p


def add_waterfront(Piece):
    quay_wall(Piece)
    quay_wall(Piece, 'quay_wall_b', lift=.012, recess=.025)
    quay_stair(Piece)
    quay_corner(Piece)
    bridge_arch(Piece)
    bridge_chapel(Piece)
    bridge_wood(Piece)
