"""Waterfront pieces: quay walls, quay stairs and the town bridges.
Game coordinates: metres, Y up, bottom-centred origin, +Z toward the water
(quays) or along the crossing (bridges). Every solid emits its own collider.
"""
import math

# Quay geometry shared with src/shared/terrain.ts: the walls are 5 m deep so the
# 2 m height grid's step from promenade to river bed always happens under the stone.
QUAY_HEIGHT = 4.2   # from below the bed to the promenade
QUAY_DEPTH = 5.0
QUAY_TOP = 3.6      # stair landing above the river bed
WATER = 1.35        # water surface above the river bed


def quay_face(p, length, height, depth, x0=None):
    """A cut-stone quay block: coursed face, darker waterline, coping slabs."""
    p.box(0, height / 2, -depth / 2, length, height, depth, 6, True, bevel=.05)
    # Coping: slightly proud slabs, the walkable edge of the promenade.
    count = max(2, round(length / 1.6))
    for i in range(count):
        x = -length / 2 + (i + .5) * length / count
        p.box(x, height + .04, -depth / 2 - .04, length / count - .05, .12, depth + .14, 14, bevel=.025)
    # Face courses with staggered joints, and a darker weathered waterline band.
    for row in range(4):
        y = height - .55 - row * .62
        offset = .4 if row % 2 else 0
        blocks = max(2, round(length / 1.25))
        for i in range(blocks):
            x = -length / 2 + (i + .5) * length / blocks + offset
            if abs(x) > length / 2 - .35:
                continue
            p.box(x, y, .015, length / blocks - .06, .56, .05, 14 if (i + row) % 3 == 0 else 6, bevel=.02, detail=True)
    p.box(0, height - 3.0, .02, length - .1, .5, .06, 9, bevel=.02, detail=True)


def quay_wall(Piece, name='quay_wall', length=8.0):
    p = Piece(name, length, QUAY_DEPTH)
    quay_face(p, length, QUAY_HEIGHT, QUAY_DEPTH)
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


def add_waterfront(Piece):
    quay_wall(Piece)
    quay_stair(Piece)
