"""Casario: the solid terraced houses that make continuous colonial street fronts.

They are not enterable: a real masonry body with recessed doors, shop arches
and windows on the street face, balconies, lanterns, bougainvillea and either a
tiled eave (beiral with rafter ends) or a platibanda parapet. Game coordinates:
metres, Y up, bottom-centred origin, the street face at +Z.
Wall plaster is authored on tile 0 so every placement can repaint it.
"""
import math
import random
from rocks import surface

WALL, CORAL, TEAL, YELLOW, ROOF, WOOD, BLOCK, DARK, NAVY, IRON, GLASS, CANVAS, GREEN, BRICK, STONE, TRIM = range(16)
RECESS = .3          # depth of every street-face opening
MAGENTA = [.76, .1, .44]
LEAF = [.62, .86, .6]


def flag(p, **values):
    p.parts[-1].update(values)


def finish(p):
    """Distance simplification for a terraced house. Past 32 m every box loses
    its bevel; past 90 m only the masonry, glass, door leaves, balcony slabs,
    cornice and the plain roof slabs remain."""
    for part in p.parts:
        if part['shape'] == 'box':
            part.setdefault('farBevel', 0)
        if 'lods' in part or part.get('solid') or part.get('far'):
            continue
        if part['tile'] not in (WALL, GLASS):
            part['mid'] = True
    return p


def wall_strip(p, x0, x1, y0, y1, z, depth, openings, tile=WALL, solid=True):
    """The street wall between x0..x1 and y0..y1, with rectangular holes."""
    xs = sorted({x0, x1, *[o[0] for o in openings], *[o[1] for o in openings]})
    xs = [x for x in xs if x0 - 1e-6 <= x <= x1 + 1e-6]
    columns = []
    for a, b in zip(xs, xs[1:]):
        if b - a < 1e-3:
            continue
        mid = (a + b) / 2
        spans, y = [], y0
        for h0, h1 in sorted((o[2], o[3]) for o in openings if o[0] < mid < o[1]):
            if h0 > y + 1e-3:
                spans.append((y, h0))
            y = max(y, h1)
        if y1 > y + 1e-3:
            spans.append((y, y1))
        if columns and columns[-1][2] == spans and abs(columns[-1][1] - a) < 1e-6:
            columns[-1] = (columns[-1][0], b, spans)
        else:
            columns.append((a, b, spans))
    for a, b, spans in columns:
        for s0, s1 in spans:
            p.box((a + b) / 2, (s0 + s1) / 2, z, b - a, s1 - s0, depth, tile, solid, bevel=0)


def spandrels(p, cx, spring, r, z0, z1, tile=WALL, steps=7):
    """Fill the two top corners of a rectangular opening so it reads as a round arch."""
    for side in [-1, 1]:
        corner = (cx + side * r, spring + r)
        arc = [(cx + side * r * math.cos(t), spring + r * math.sin(t))
               for t in [i * (math.pi / 2) / steps for i in range(steps + 1)]]
        # Fan from the corner: arc runs from the springing (outer) to the crown.
        outline = [corner] + arc
        vertices = [(x, y, z) for z in [z0, z1] for x, y in outline]
        n = len(outline)
        faces = []
        for i in range(1, n - 1):
            a, b = (i, i + 1) if side > 0 else (i + 1, i)
            faces.append((0, a, b))
            faces.append((n, n + b, n + a))
            # The intrados faces into the opening.
            faces.append((a, n + a, n + b, b))
        surface(p, vertices, faces, tile, detail=False)
        flag(p, planar=True)


def voussoirs(p, cx, spring, r, z, tile=TRIM, width=.26, depth=.12, count=9, key=STONE, mid=False):
    """A stone arch ring proud of the wall, with a larger keystone."""
    ring = r + width / 2
    for i in range(count):
        a = math.pi * (i + .5) / count
        chord = 2 * ring * math.sin(math.pi / count / 2) - .03
        crown = i == count // 2
        p.box(cx + ring * math.cos(a), spring + ring * math.sin(a), z, chord, width * (1.35 if crown else 1),
              depth + (.03 if crown else 0), key if crown else tile, bevel=.012, roll=math.pi / 2 - a)
        if mid:
            flag(p, mid=True)


def surround(p, x0, x1, y0, y1, zf, tile=TRIM, width=.16, proud=.07, head=True, mid=True):
    """Moulded frame proud of the street face around a rectangular opening."""
    for x in [x0 - width / 2, x1 + width / 2]:
        p.box(x, (y0 + y1) / 2, zf + proud / 2, width, y1 - y0, proud, tile, bevel=.012)
        if mid:
            flag(p, mid=True)
    if head:
        p.box((x0 + x1) / 2, y1 + width / 2, zf + proud / 2 + .01, x1 - x0 + width * 2 + .1, width, proud + .02, tile, bevel=.015)
        p.box((x0 + x1) / 2, y1 + width + .03, zf + proud / 2 + .03, x1 - x0 + width * 2 + .22, .06, proud + .06, tile, bevel=.01)


def shutters(p, x, y0, y1, w, zf, tile, closed=False, slats=4):
    """Paired louvred leaves: open against the wall, or closed over the opening."""
    leaf = w / 2 + .03
    for side in [-1, 1]:
        cx = x + side * (w / 4) if closed else x + side * (w / 2 + .1 + leaf / 2)
        z = zf - RECESS + .09 if closed else zf + .03
        p.box(cx, (y0 + y1) / 2, z, leaf - .02, y1 - y0, .05, tile, bevel=.008)
        flag(p, mid=True)
        for i in range(slats):
            yy = y0 + (y1 - y0) * (i + .7) / (slats + .4)
            p.box(cx, yy, z + .035, leaf - .1, .05, .03, tile, bevel=0, detail=True)


def sash(p, x, sill, w, h, zf, shutter=TEAL, closed=False, grille=False, flowers=False, head=True, arch=False):
    """A street window in a recess: glass and bars, frame, shutters, sill, flower box."""
    zb = zf - RECESS
    p.box(x, sill + h / 2, zb + .02, w, h, .04, GLASS, bevel=0)
    if not closed:
        p.box(x, sill + h / 2, zb + .05, .05, h, .03, TRIM, bevel=0, detail=True)
        p.box(x, sill + h * .64, zb + .05, w, .05, .03, TRIM, bevel=0, detail=True)
    if grille:
        for i in range(5):
            p.box(x - w / 2 + (i + .5) * w / 5, sill + h / 2, zf - .06, .035, h, .035, IRON, bevel=0, detail=True)
        p.box(x, sill + h * .5, zf - .06, w, .035, .035, IRON, bevel=0, detail=True)
    shutters(p, x, sill, sill + h, w, zf, shutter, closed)
    surround(p, x - w / 2, x + w / 2, sill, sill + h, zf, head=head and not arch)
    if arch:
        voussoirs(p, x, sill + h - w / 2, w / 2, zf + .05, count=7, width=.18, depth=.1, mid=True)
    p.box(x, sill - .06, zf + .1, w + .36, .12, .26, TRIM, bevel=.015)
    if flowers:
        p.box(x, sill + .08, zf + .26, w + .1, .26, .28, ROOF, bevel=.02)
        flag(p, mid=True)
        for i in range(4):
            xx = x + (i - 1.5) * w / 4
            p.orb(xx, sill + .3, zf + .27, .38, .3, .32, GREEN, False)
            flag(p, segments=(7, 4), tint=LEAF, mid=True)
            p.orb(xx + .08, sill + .42, zf + .33, .16, .14, .16, CANVAS, True)
            flag(p, segments=(6, 3), tint=MAGENTA if i % 2 else [.93, .45, .3])


def arched_door(p, x, r, spring, zf, paint, step=True, fanlight=True):
    """A recessed round-arched door with a stone surround, fanlight and step."""
    zb = zf - RECESS
    spandrels(p, x, spring, r, zb, zf)
    for side in [-1, 1]:
        p.box(x + side * r / 2, spring / 2, zb + .04, r - .03, spring, .07, paint, bevel=.01)
        flag(p, far=True)
        for yy in [.55, 1.5]:
            p.box(x + side * r / 2, yy + .35, zb + .09, r * .62, .62, .03, paint, bevel=.01, detail=True)
        p.orb(x + side * .09, 1.1, zb + .11, .06, .06, .05, YELLOW)
    if fanlight:
        # Half-disc glass with radial glazing bars above the leaves.
        steps = 8
        outline = [(x + r * math.cos(math.pi * i / steps), spring + r * math.sin(math.pi * i / steps)) for i in range(steps + 1)]
        vertices = [(x, spring, zb + .03)] + [(px, py, zb + .03) for px, py in outline]
        vertices += [(x, spring, zb + .07)] + [(px, py, zb + .07) for px, py in outline]
        n = steps + 2
        faces = [(0, i + 1, i + 2) for i in range(steps)] + [(n, n + i + 2, n + i + 1) for i in range(steps)]
        surface(p, vertices, faces, GLASS, detail=False)
        flag(p, planar=True)
        for i in range(1, 4):
            a = math.pi * i / 4
            p.beam((x, spring, zb + .08), (x + r * math.cos(a), spring + r * math.sin(a), zb + .08), .035, TRIM, detail=True)
        p.box(x, spring, zb + .08, r * 2, .06, .04, TRIM, bevel=0)
    for side in [-1, 1]:
        p.box(x + side * (r + .09), spring / 2, zf + .035, .18, spring, .07, TRIM, bevel=.012)
        flag(p, mid=True)
    voussoirs(p, x, spring, r, zf + .05)
    if step:
        p.box(x, .07, zf + .2, r * 2 + .5, .14, .5, STONE, True, bevel=.02)


def lantern(p, x, y, zf):
    """Wall bracket lantern (iron frame, frosted panes, pyramid cap)."""
    p.beam((x, y + .05, zf), (x, y + .12, zf + .42), .05, IRON)
    flag(p, mid=True)
    p.box(x, y - .12, zf + .45, .22, .3, .22, CANVAS, bevel=.01)
    flag(p, tint=[1, .93, .72])
    for dx in [-.11, .11]:
        for dz in [-.11, .11]:
            p.box(x + dx, y - .12, zf + .45 + dz, .03, .32, .03, IRON, bevel=0, detail=True)
    p.cylinder(x, y + .08, zf + .45, .19, .14, IRON, top=.02, sides=4)
    p.box(x, y - .29, zf + .45, .26, .04, .26, IRON, bevel=0)


def downpipe(p, x, top, zf):
    p.cylinder(x, top / 2, zf + .1, .055, top, IRON, sides=6, detail=True)
    p.box(x, top - .08, zf + .05, .16, .16, .2, IRON, bevel=0, detail=True)


def bougainvillea(p, anchors, seed=0):
    """Cascading magenta masses: a curtain of faceted flower heads over leaf
    blobs, dense at the top and thinning as it drops down the wall.
    Each anchor is (x, y_top, z_wall, width[, drop])."""
    rng = random.Random(seed)
    for anchor in anchors:
        x, y, z, width = anchor[:4]
        drop = anchor[4] if len(anchor) > 4 else width * 1.4
        shape = lambda v: width / 2 * (1 - .6 * v / drop)
        for i in range(max(4, round(width * drop * 2.2))):
            v = drop * rng.random() ** 1.3 * .85
            u = (rng.random() * 2 - 1) * shape(v) * .8
            size = .5 + rng.random() * .25
            p.orb(x + u, y - v, z + .1, size, size * .8, size * .5, GREEN, False)
            flag(p, segments=(6, 4), tint=LEAF)
        heads = max(12, min(44, round(width * drop * 15)))
        for i in range(heads):
            v = drop * rng.random() ** 1.6
            u = (rng.random() * 2 - 1) * shape(v)
            size = .17 + rng.random() * .15
            depth = (1 - v / drop) * .18 + rng.random() * .1
            p.orb(x + u, y - v, z + .22 + depth, size, size * .85, size * .6, CANVAS, i % 3 == 2)
            flag(p, segments=(5, 3), tint=MAGENTA if i % 5 else [.9, .3, .6])


def quoins(p, W, top, zf, tile=TRIM):
    """Corner pilasters on the street face, with a slightly wider base."""
    for side in [-1, 1]:
        p.box(side * (W / 2 - .17), top / 2, zf + .04, .34, top, .08, tile, bevel=.015)
        p.box(side * (W / 2 - .17), .3, zf + .07, .4, .6, .14, STONE, bevel=.02)


def plinth(p, W, zf, gaps, height=.55):
    """Stone base course along the street face, broken at doors."""
    xs = [-W / 2 + .34]
    for g0, g1 in sorted(gaps):
        xs += [g0, g1]
    xs.append(W / 2 - .34)
    for a, b in zip(xs[::2], xs[1::2]):
        if b - a > .05:
            p.box((a + b) / 2, height / 2, zf + .035, b - a, height, .07, STONE, bevel=.012)


def cornice(p, W, D, y, depth=.28):
    """Moulded eaves cornice: fascia, a projecting drip and a returns on both sides."""
    p.box(0, y - .12, D / 2 + .05, W, .24, .1, TRIM, bevel=.015)
    p.box(0, y + .05, D / 2 + depth / 2, W + .12, .1, depth, TRIM, bevel=.02)
    flag(p, far=True)
    for side in [-1, 1]:
        p.box(side * (W / 2 + .03), y - .03, D / 2 - .4, .08, .3, .8, TRIM, bevel=.01)
        flag(p, mid=True)


def string_course(p, W, y, zf):
    p.box(0, y, zf + .06, W - .1, .16, .12, TRIM, bevel=.015)


def tile_sheet(p, x0, x1, z_eave, z_ridge, y_eave, y_ridge, tile=ROOF, pitch=.46, courses=5):
    """Colonial capa-e-canal clay tiles as one corrugated sheet from eave to
    ridge, with a small drop at every course so the rows read from afar.
    Near: four samples per tile and every course. Middle distance: a two-sample
    ripple in one sheet. Far: a plain slab."""
    run, rise = z_ridge - z_eave, y_ridge - y_eave
    length = math.hypot(run, rise)
    outward = 1 if z_eave > z_ridge else -1
    ny, nz = abs(run) / length, outward * abs(rise) / length
    cols = max(4, round((x1 - x0) / pitch))
    for level, per, rows in [(0, 4, [(t, lift) for c in range(courses) for t, lift in
                                     [(c / courses, .026), ((c + 1) / courses - .012, 0)]]),
                             (1, 2, [(0, .02), (1, 0)])]:
        samples = cols * per
        vertices, faces = [], []
        for t, lift in rows:
            for i in range(samples + 1):
                x = x0 + (x1 - x0) * i / samples
                wave = .05 * math.cos(math.tau * i / per) + lift
                vertices.append((x, y_eave + rise * t + ny * wave, z_eave + run * t + nz * wave))
        width = samples + 1
        for r in range(len(rows) - 1):
            for i in range(samples):
                a, b, c2, d = r * width + i, r * width + i + 1, (r + 1) * width + i + 1, (r + 1) * width + i
                faces.append((a, b, c2, d) if outward > 0 else (a, d, c2, b))
        surface(p, vertices, faces, tile, detail=False)
        flag(p, planar=True, smooth=True, lods=[level])
    p.beam(((x0 + x1) / 2, y_eave + .03, z_eave), ((x0 + x1) / 2, y_ridge + .03, z_ridge), x1 - x0, tile, .06)
    flag(p, lods=[2])


def eave_roof(p, W, D, base, rise=1.55, overhang=.55, tile=ROOF, back_overhang=.3):
    """Tiled roof with its ridge along the street; the eave projects over the
    pavement on painted rafter ends (cachorrada). Inscribed solid steps sit
    under the tiles so shots stop at the roof."""
    front, back = D / 2 + overhang, -D / 2 - back_overhang
    ridge_z = (front + back) / 2
    half = W / 2 + .12
    tile_sheet(p, -half, half, front, ridge_z, base, base + rise, tile)
    tile_sheet(p, -half, half, back, ridge_z, base, base + rise, tile)
    steps = 3
    for i in range(steps - 1):
        k = 1 - (i + 1) / steps
        p.box(0, base + (i + .5) * rise / steps, ridge_z, W - .12, rise / steps, (front - back) * k, tile, True, bevel=0)
    p.cylinder(0, base + rise + .06, ridge_z, .12, W + .3, tile, sides=8, axis='x')
    # Gable ends close the wedge under the tiles where a terrace ends at a beco.
    yf = base + rise * (front - D / 2) / (front - ridge_z)
    yb = base + rise * (D / 2 + back) / (back - ridge_z)
    for side in [-1, 1]:
        x = side * (W / 2 - .01)
        vertices = [(x, base, D / 2), (x, yf, D / 2), (x, base + rise - .04, ridge_z), (x, yb, -D / 2), (x, base, -D / 2)]
        faces = [(0, 4, 2), (0, 2, 1), (4, 3, 2)]
        if side < 0:
            faces = [tuple(reversed(face)) for face in faces]
        surface(p, vertices, faces, WALL, detail=False)
        flag(p, planar=True)
    # Beiral soffit, rafter ends and fascia over the street.
    p.box(0, base - .02, D / 2 + overhang / 2, W + .24, .05, overhang, WOOD, bevel=0)
    count = max(5, round(W / .55))
    for j in range(count):
        x = -W / 2 + (j + .5) * W / count
        p.box(x, base - .1, D / 2 + overhang / 2 - .02, .09, .12, overhang - .04, DARK, bevel=0)
        flag(p, mid=True)
    p.box(0, base + .03, front - .02, W + .24, .09, .05, DARK, bevel=0)


def platibanda(p, W, D, top, height=1.0, color=WALL, finials=True):
    """Colonial parapet hiding a low tiled roof: cornice, panel mouldings, urns."""
    zf = D / 2
    p.box(0, top + height / 2, zf - .12, W, height, .24, color, True, bevel=0)
    for side in [-1, 1]:
        p.box(side * (W / 2 - .12), top + height / 2, zf - .7, .24, height, 1.0, color, True, bevel=0)
    p.box(0, top - .1, zf + .1, W + .14, .2, .2, TRIM, bevel=.02)
    p.box(0, top + height + .04, zf - .1, W + .18, .08, .36, TRIM, bevel=.012)
    flag(p, far=True)
    panels = max(2, round(W / 2.4))
    for i in range(panels):
        x = -W / 2 + (i + .5) * W / panels
        p.box(x, top + height * .5, zf + .01, W / panels - .6, height * .5, .04, TRIM, bevel=.008, detail=True)
    if finials:
        for x in [-W / 2 + .2, W / 2 - .2]:
            p.cylinder(x, top + height + .18, zf - .1, .12, .22, TRIM, sides=8)
            p.orb(x, top + height + .38, zf - .1, .22, .26, .22, TRIM, False)
    # The hidden roof: a low double pitch behind the parapet, seen from the hills.
    front, back, rise = D / 2 - .3, -D / 2 - .15, .95
    ridge = (front + back) / 2
    tile_sheet(p, -W / 2 + .25, W / 2 - .25, front, ridge, top, top + rise, courses=4)
    tile_sheet(p, -W / 2 + .25, W / 2 - .25, back, ridge, top, top + rise, courses=4)
    p.box(0, top + rise / 4, ridge, W - .5, rise / 2, (front - back) / 2, ROOF, True, bevel=0)
    p.cylinder(0, top + rise + .05, ridge, .1, W - .4, ROOF, sides=8, axis='x')


def balcony(p, x, y, w, zf, depth=.75, flowers=None):
    """Wrought-iron balcony on a moulded stone slab and corbels."""
    p.box(x, y - .07, zf + depth / 2, w, .14, depth, STONE, bevel=.02)
    flag(p, far=True)
    p.box(x, y - .17, zf + depth / 2 - .02, w - .1, .06, depth - .06, TRIM, bevel=0)
    for dx in ([-w / 2 + .25, w / 2 - .25] if w < 2 else [-w / 2 + .25, 0, w / 2 - .25]):
        p.box(x + dx, y - .34, zf + .18, .16, .3, .34, TRIM, bevel=.02)
        flag(p, mid=True)
    top = y + .95
    zr = zf + depth - .05
    p.box(x, top, zr, w, .05, .05, IRON, bevel=0)
    flag(p, mid=True)
    for side in [-1, 1]:
        p.box(x + side * (w / 2 - .03), top, zf + depth / 2, .05, .05, depth - .08, IRON, bevel=0)
        flag(p, mid=True)
        p.box(x + side * (w / 2 - .03), (y + top) / 2, zr, .05, top - y, .05, IRON, bevel=0)
        flag(p, mid=True)
    n = max(4, round(w / .16))
    for i in range(1, n):
        xx = x - w / 2 + i * w / n
        p.box(xx, (y + top) / 2, zr, .025, top - y, .025, IRON, bevel=0, detail=True)
    p.box(x, y + .12, zr, w, .04, .04, IRON, bevel=0, detail=True)
    if flowers:
        bougainvillea(p, flowers, seed=int(x * 10))


def french_door(p, x, y, w, h, zf, shutter, closed=False):
    """Balcony door: tall glazed leaves in a recess, louvred shutters, moulded head."""
    zb = zf - RECESS
    p.box(x, y + h / 2, zb + .02, w, h, .04, GLASS, bevel=0)
    p.box(x, y + h / 2, zb + .05, .05, h, .03, TRIM, bevel=0, detail=True)
    for yy in [y + h * .33, y + h * .66]:
        p.box(x, yy, zb + .05, w, .04, .03, TRIM, bevel=0, detail=True)
    shutters(p, x, y, y + h, w, zf, shutter, closed, slats=5)
    surround(p, x - w / 2, x + w / 2, y, y + h, zf)


def back_windows(p, W, D, rows, width=1.0):
    """Plain rear windows so backs and block interiors are not blank."""
    zb = -D / 2
    for y, xs in rows:
        for x in xs:
            p.box(x, y, zb - .02, width, 1.3, .04, GLASS, bevel=0)
            flag(p, mid=True)
            p.box(x, y - .72, zb - .06, width + .2, .1, .12, TRIM, bevel=0)
            flag(p, mid=True)
            p.box(x, y + .72, zb - .05, width + .16, .12, .1, TRIM, bevel=0)
            flag(p, mid=True)


def side_marks(p, W, D, top):
    """Rainwater pipe and a gutter return on each end wall (visible at becos)."""
    for side in [-1, 1]:
        p.cylinder(side * (W / 2 + .06), top / 2, D / 2 - .35, .05, top, IRON, sides=6, detail=True)


def body(p, W, D, top, openings, zf):
    """Masonry core behind the street wall, plus the street wall around openings."""
    p.box(0, top / 2, -RECESS / 2, W, top, D - RECESS, WALL, True, bevel=0)
    wall_strip(p, -W / 2, W / 2, 0, top, zf - RECESS / 2, RECESS, openings)


def row_terrea(Piece, name='row_terrea', W=7.2, D=7.0):
    """Single-storey colonial house: arched door, two windows, tiled eave."""
    p = Piece(name, W, D)
    zf, top = D / 2, 4.4
    door_x, r, spring = -1.9, .72, 2.35
    windows = [(.45, 1.1), (2.35, 1.1)]
    sill, h = 1.15, 1.55
    openings = [(door_x - r, door_x + r, 0, spring + r)] + [(x - w / 2, x + w / 2, sill, sill + h) for x, w in windows]
    body(p, W, D, top, openings, zf)
    arched_door(p, door_x, r, spring, zf, TEAL)
    for i, (x, w) in enumerate(windows):
        sash(p, x, sill, w, h, zf, TEAL, grille=i == 0, flowers=i == 1, arch=False)
    plinth(p, W, zf, [(door_x - r - .2, door_x + r + .2)])
    quoins(p, W, top, zf)
    cornice(p, W, D, top)
    eave_roof(p, W, D, top + .12)
    lantern(p, door_x + 1.05, 2.75, zf)
    downpipe(p, W / 2 - .45, top, zf)
    bougainvillea(p, [(W / 2 - 1.0, 4.35, zf, 1.7, 2.6)], seed=2)
    back_windows(p, W, D, [(2.0, [-1.6, 1.6])])
    side_marks(p, W, D, top)
    return finish(p)


def row_sobrado(Piece, name='row_sobrado', W=6.6, D=8.0):
    """Two-storey townhouse: arched door, long iron balcony, platibanda."""
    p = Piece(name, W, D)
    zf, first, top = D / 2, 3.7, 7.3
    door_x, r, spring = -1.35, .68, 2.3
    wx, sill, h = 1.45, 1.15, 1.5
    fd_w, fd_h = 1.0, 2.35
    openings = [(door_x - r, door_x + r, 0, spring + r), (wx - .55, wx + .55, sill, sill + h)]
    openings += [(x - fd_w / 2, x + fd_w / 2, first + .1, first + .1 + fd_h) for x in [-1.35, 1.45]]
    body(p, W, D, top, openings, zf)
    arched_door(p, door_x, r, spring, zf, GREEN)
    sash(p, wx, sill, 1.1, h, zf, GREEN, grille=True)
    string_course(p, W, first - .05, zf)
    balcony(p, .05, first + .1, 5.2, zf, .72, flowers=[(-1.95, first + 1.0, zf + .7, 1.5, 2.1), (2.25, first + .95, zf + .7, .9, 1.3)])
    for x in [-1.35, 1.45]:
        french_door(p, x, first + .1, fd_w, fd_h, zf, GREEN)
    plinth(p, W, zf, [(door_x - r - .2, door_x + r + .2)])
    quoins(p, W, top, zf)
    platibanda(p, W, D, top)
    lantern(p, -.25, 2.8, zf)
    downpipe(p, W / 2 - .4, top, zf)
    back_windows(p, W, D, [(2.0, [-1.4, 1.4]), (5.2, [-1.4, 1.4])])
    side_marks(p, W, D, top)
    return finish(p)


def shopfront(p, x, r, spring, zf, awning, goods):
    """A deep round-arched shop opening: counter, stocked shelves, canvas awning."""
    zb = zf - RECESS * 2
    spandrels(p, x, spring, r, zb, zf)
    p.box(x, (spring + r) / 2, zb + .01, 2 * r, spring + r, .02, DARK, bevel=0)
    # Counter and goods at the back of the recess.
    p.box(x, .5, zb + .3, r * 1.7, 1.0, .5, WOOD, True, 'wood', bevel=.02)
    p.box(x, 1.03, zb + .3, r * 1.8, .06, .56, DARK, bevel=.01)
    for i in range(5):
        xx = x + (i - 2) * r * .34
        p.orb(xx, 1.18, zb + .32, .26, .22, .26, goods[i % len(goods)], True)
        flag(p, segments=(6, 4))
    for yy in [1.75, 2.3]:
        p.box(x, yy, zb + .1, r * 1.6, .05, .22, WOOD, bevel=0, detail=True)
        for i in range(4):
            p.box(x + (i - 1.5) * r * .4, yy + .14, zb + .1, .2, .24, .16, [CORAL, YELLOW, TEAL, GREEN][(i + int(yy)) % 4], bevel=.01, detail=True)
    for side in [-1, 1]:
        p.box(x + side * (r + .09), spring / 2, zf + .035, .18, spring, .07, TRIM, bevel=.012)
    voussoirs(p, x, spring, r, zf + .05, count=11)
    # Striped canvas awning on two iron struts.
    stripes = 6
    for i in range(stripes):
        xx = x - r - .15 + (i + .5) * (2 * r + .3) / stripes
        p.beam((xx, spring + r + .38, zf + .08), (xx, spring + r - .2, zf + 1.3), (2 * r + .3) / stripes, CANVAS if i % 2 else awning, .04)
    p.box(x, spring + r - .27, zf + 1.31, 2 * r + .3, .16, .04, awning, bevel=0)
    for side in [-1, 1]:
        p.beam((x + side * (r + .1), spring + .35, zf + .02), (x + side * (r + .1), spring + r - .25, zf + 1.26), .04, IRON, detail=True)


def row_loja(Piece, name='row_loja', W=8.4, D=8.0):
    """Two-storey shop house: a pair of arched shopfronts under striped
    awnings, three shuttered windows with flower boxes, tiled eave."""
    p = Piece(name, W, D)
    zf, first, top = D / 2, 4.0, 7.3
    shops, r, spring = [-2.05, 2.05], 1.08, 2.45
    ups, sill, h = [-2.6, 0, 2.6], first + .75, 1.6
    openings = [(x - r, x + r, 0, spring + r) for x in shops] + [(x - .55, x + .55, sill, sill + h) for x in ups]
    # The shop arches are twice as deep: the core body stops behind them.
    p.box(0, top / 2, -RECESS, W, top, D - RECESS * 2, WALL, True, bevel=0)
    wall_strip(p, -W / 2, W / 2, 0, top, zf - RECESS, RECESS * 2, openings)
    shopfront(p, shops[0], r, spring, zf, CORAL, [YELLOW, CORAL, GREEN])
    shopfront(p, shops[1], r, spring, zf, TEAL, [CORAL, YELLOW, YELLOW])
    for i, x in enumerate(ups):
        sash(p, x, sill, 1.1, h, zf, NAVY, flowers=i != 1)
    string_course(p, W, first - .05, zf)
    plinth(p, W, zf, [(x - r - .2, x + r + .2) for x in shops])
    quoins(p, W, top, zf)
    cornice(p, W, D, top)
    eave_roof(p, W, D, top + .12)
    for x in [-1.3, 1.3]:
        lantern(p, x, first + .5, zf)
    downpipe(p, -W / 2 + .45, top, zf)
    back_windows(p, W, D, [(2.2, [-2.2, 2.2]), (5.4, [-2.2, 0, 2.2])])
    side_marks(p, W, D, top)
    return finish(p)


def row_alto(Piece, name='row_alto', W=6.0, D=8.0):
    """Three-storey narrow house: stacked balconies, bougainvillea, tiled eave."""
    p = Piece(name, W, D)
    zf, f1, f2, top = D / 2, 3.6, 6.9, 10.2
    door_x, r, spring = 1.2, .62, 2.25
    wx, sill, h = -1.25, 1.2, 1.45
    openings = [(door_x - r, door_x + r, 0, spring + r), (wx - .55, wx + .55, sill, sill + h)]
    for f in [f1, f2]:
        openings += [(-1.25 - .5, -1.25 + .5, f + .1, f + 2.4), (1.35 - .5, 1.35 + .5, f + .75, f + 2.25)]
    body(p, W, D, top, openings, zf)
    arched_door(p, door_x, r, spring, zf, CORAL)
    sash(p, wx, sill, 1.1, h, zf, CORAL, grille=True)
    for i, f in enumerate([f1, f2]):
        string_course(p, W, f - .05, zf)
        balcony(p, -1.25, f + .1, 1.6, zf, .62, flowers=[(-1.55, f + 1.0, zf + .6, 1.1, 1.7)] if i == 0 else None)
        french_door(p, -1.25, f + .1, 1.0, 2.3, zf, CORAL, closed=i == 1)
        sash(p, 1.35, f + .75, 1.0, 1.5, zf, CORAL, flowers=i == 0, closed=i == 1)
    quoins(p, W, top, zf)
    cornice(p, W, D, top)
    eave_roof(p, W, D, top + .12, rise=1.45)
    lantern(p, door_x - .95, 2.7, zf)
    downpipe(p, W / 2 - .35, top, zf)
    bougainvillea(p, [(W / 2 - .75, top + .05, zf, 1.3, 3.4)], seed=5)
    back_windows(p, W, D, [(2.0, [-1.2, 1.2]), (5.3, [-1.2, 1.2]), (8.6, [-1.2, 1.2])])
    side_marks(p, W, D, top)
    return finish(p)


def add_casario(Piece):
    row_terrea(Piece)
    row_sobrado(Piece)
    row_loja(Piece)
    row_alto(Piece)
