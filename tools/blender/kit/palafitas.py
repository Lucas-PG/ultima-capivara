"""Palafitas: the fishing village on stilts in the south-east tidal lagoon.
Boardwalks and a junction deck on piles, painted plank houses on platforms
with a zinc roof, a veranda and a stair down to the water, the Bar da Mare,
and a timber lookout tower on the shore. Game coordinates: metres, Y up.
Every piece standing in the lagoon has its origin on the lagoon bed and its
deck DECK above it, so all decks meet level; every solid emits its collider.
"""
import math
from access import floor_record, platform_port, route
from casario import tile_sheet
from rocks import surface

WALL, CORAL, TEAL, YELLOW, ROOF, WOOD, BLOCK, DARK, NAVY, IRON, GLASS, CANVAS, GREEN, BRICK, STONE, TRIM = range(16)
DECK = 2.0
ZINC = [.78, .8, .82]


def flag(p, **values):
    p.parts[-1].update(values)


def pile(p, x, z, top, radius=.13, solid=True):
    """A timber pile from below the bed up to the deck bearers."""
    p.cylinder(x, (top - .6) / 2, z, radius, top + .6, DARK, solid, 'wood', sides=8)


def planks(p, width, length, along_z=True, y=DECK):
    count = max(4, round((length if along_z else width) / .3))
    for i in range(count):
        t = -.5 + (i + .5) / count
        if along_z:
            p.box(0, y + .006, t * length, width - .08, .012, length / count - .035, WOOD if i % 4 else DARK, bevel=0, detail=True)
        else:
            p.box(t * width, y + .006, 0, width / count - .035, .012, length - .08, WOOD if i % 4 else DARK, bevel=0, detail=True)


def deck_traversal(p, deck_index, ports, ground=()):
    floor = floor_record(p, deck_index, 'deck')
    top = floor['y']
    entrances = [platform_port(name, [x, top, z]) for name, x, z in ports]
    entrances += [dict(id=name, point=[x, top, z]) for name, x, z in ground]
    routes = [route(f'{name}-entry', name, 'deck', [[x, top, z], [0, top, 0]]) for name, x, z in [*ports, *ground]]
    p.traversal = dict(floors=[floor], entrances=entrances, routes=routes, stairs=[])


def passarela(Piece, name='passarela', length=8.0, width=2.2):
    """A plank boardwalk on paired piles, a rope rail along one side."""
    p = Piece(name, width, length)
    deck = len(p.colliders)
    p.box(0, DECK - .1, 0, width, .2, length, WOOD, True, 'wood', bevel=.015)
    planks(p, width, length, along_z=False)
    for z in [-length / 2 + .5, -length / 6, length / 6, length / 2 - .5]:
        for x in [-width / 2 + .12, width / 2 - .12]:
            pile(p, x, z, DECK - .2)
        p.box(0, DECK - .28, z, width + .1, .14, .16, DARK, bevel=0)
    for x in [-width / 2 + .3, width / 2 - .3]:
        p.box(x, DECK - .3, 0, .12, .2, length - .1, DARK, bevel=0)
    posts = [-length / 2 + .2 + i * (length - .4) / 3 for i in range(4)]
    for z in posts:
        p.box(width / 2 - .08, DECK + .5, z, .09, 1.0, .09, DARK, True, 'wood', bevel=.01)
    for y in [DECK + .55, DECK + .95]:
        p.beam((width / 2 - .08, y, posts[0]), (width / 2 - .08, y - .06, posts[-1]), .03, CANVAS, detail=True)
        flag(p, tint=[.75, .65, .45])
    half = length / 2
    deck_traversal(p, deck, [('back-support', 0, -half + .4), ('front-support', 0, half - .4)],
                   ground=[('back', 0, -half - .7), ('front', 0, half + .7)])
    return p


def passarela_no(Piece, name='passarela_no', size=2.6):
    """A square junction deck where boardwalks meet, with a mooring post."""
    p = Piece(name, size, size)
    deck = len(p.colliders)
    p.box(0, DECK - .1, 0, size, .2, size, WOOD, True, 'wood', bevel=.015)
    planks(p, size, size)
    for x in [-size / 2 + .15, size / 2 - .15]:
        for z in [-size / 2 + .15, size / 2 - .15]:
            pile(p, x, z, DECK - .2, .15)
    p.cylinder(size / 2 - .15, DECK + .45, size / 2 - .15, .1, .9, DARK, sides=8)
    reach = size / 2 - .4
    deck_traversal(p, deck, [('north', 0, -reach), ('south', 0, reach), ('west', -reach, 0), ('east', reach, 0)])
    return p


def plank_wall(p, x0, x1, z, height, openings, thickness=.12, along_x=True):
    """A painted plank wall with openings: solid boards, battens and a sill board."""
    xs = sorted({x0, x1, *[o[0] for o in openings], *[o[1] for o in openings]})
    for a, b in zip(xs, xs[1:]):
        if b - a < 1e-3:
            continue
        mid = (a + b) / 2
        spans, y = [], DECK
        for h0, h1 in sorted((o[2], o[3]) for o in openings if o[0] < mid < o[1]):
            if h0 > y + 1e-3:
                spans.append((y, h0))
            y = max(y, h1)
        if DECK + height > y + 1e-3:
            spans.append((y, DECK + height))
        for s0, s1 in spans:
            if along_x:
                p.box((a + b) / 2, (s0 + s1) / 2, z, b - a, s1 - s0, thickness, WALL, True, 'wood', bevel=0)
            else:
                p.box(z, (s0 + s1) / 2, (a + b) / 2, thickness, s1 - s0, b - a, WALL, True, 'wood', bevel=0)
    # Battens every 30 cm read as boards from the water.
    count = round((x1 - x0) / .3)
    for i in range(1, count):
        u = x0 + i * (x1 - x0) / count
        if any(o[0] - .05 < u < o[1] + .05 for o in openings):
            continue
        if along_x:
            p.box(u, DECK + height / 2, z + math.copysign(.075, z), .04, height - .1, .03, WALL, bevel=0, detail=True)
        else:
            p.box(z + math.copysign(.075, z), DECK + height / 2, u, .03, height - .1, .04, WALL, bevel=0, detail=True)


def frame(p, x, y0, y1, z, width, along_x=True, shutter=TEAL, open_leaves=True):
    """Timber door or window frame with a pair of flat shutters."""
    for side in [-1, 1]:
        if along_x:
            p.box(x + side * (width / 2 + .04), (y0 + y1) / 2, z, .08, y1 - y0, .18, DARK, bevel=0)
        else:
            p.box(z, (y0 + y1) / 2, x + side * (width / 2 + .04), .18, y1 - y0, .08, DARK, bevel=0)
    if along_x:
        p.box(x, y1 + .04, z, width + .16, .08, .18, DARK, bevel=0)
    else:
        p.box(z, y1 + .04, x, .18, .08, width + .16, DARK, bevel=0)
    if open_leaves:
        out = math.copysign(.1, z)
        for side in [-1, 1]:
            if along_x:
                p.box(x + side * (width * .75 + .06), (y0 + y1) / 2, z + out, width / 2, y1 - y0 - .06, .04, shutter, bevel=0)
            else:
                p.box(z + out, (y0 + y1) / 2, x + side * (width * .75 + .06), .04, y1 - y0 - .06, width / 2, shutter, bevel=0)


def palafita(Piece, name='palafita', shutter=TEAL, bar=False, roof_tile=IRON):
    """A painted plank house on a platform over the lagoon: front veranda with
    a hammock, doors front and back, side windows, zinc or clay roof, and a
    stair down to the water. The platform's front edge meets a boardwalk."""
    pw, pd = 7.2, 7.6
    hw, hd, hz = 5.2, 4.4, -1.0
    height = 2.6
    p = Piece(name, pw + 1.4, pd)
    deck = len(p.colliders)
    p.box(0, DECK - .1, 0, pw, .2, pd, WOOD, True, 'wood', bevel=.015)
    planks(p, pw, pd)
    for x in [-pw / 2 + .2, 0, pw / 2 - .2]:
        for z in [-pd / 2 + .2, -pd / 6, pd / 6, pd / 2 - .2]:
            pile(p, x, z, DECK - .2, .15)
    for z in [-pd / 2 + .2, pd / 2 - .2]:
        p.box(0, DECK - .3, z, pw + .1, .18, .2, DARK, bevel=0)
    front, back = hz + hd / 2, hz - hd / 2
    door = (-.5, .5, DECK, DECK + 2.1)
    if bar:
        # The bar's front is a long counter opening under a hinged flap.
        # A serving hatch over the counter, and the door beside it.
        plank_wall(p, -hw / 2, hw / 2, front, height, [(-2.1, 1.2, DECK + 1.0, DECK + 2.2), (1.45, 2.45, DECK, DECK + 2.1)])
        p.box(-.45, DECK + .5, front + .3, 3.3, 1.0, .45, WOOD, True, 'wood', bevel=.02)
        p.box(-.45, DECK + 1.04, front + .32, 3.4, .07, .58, DARK, bevel=.01)
        p.beam((-2.1, DECK + 2.25, front + .06), (-2.1, DECK + 2.55, front + 1.2), .06, DARK)
        p.beam((1.2, DECK + 2.25, front + .06), (1.2, DECK + 2.55, front + 1.2), .06, DARK)
        p.beam((-.45, DECK + 2.25, front + .08), (-.45, DECK + 2.6, front + 1.3), 3.6, shutter, .05)
        for i, x in enumerate([-1.8, -1.2, -.6, 0, .6]):
            p.cylinder(x, DECK + 1.2, front + .3, .06, .26, [GLASS, GREEN, CORAL][i % 3], sides=8, detail=True)
        frame(p, 1.95, DECK, DECK + 2.1, front + .08, 1.0, shutter=shutter)
        door = (1.45, 2.45, DECK, DECK + 2.1)
    else:
        plank_wall(p, -hw / 2, hw / 2, front, height, [door])
        frame(p, 0, DECK, DECK + 2.1, front + .08, 1.0, shutter=shutter)
    plank_wall(p, -hw / 2, hw / 2, back, height, [(-.5, .5, DECK, DECK + 2.1)])
    for x in [-hw / 2, hw / 2]:
        plank_wall(p, back, front, x, height, [(hz - .6, hz + .6, DECK + 1.0, DECK + 2.0)], along_x=False)
        frame(p, hz, DECK + 1.0, DECK + 2.0, x + math.copysign(.08, x), 1.2, along_x=False, shutter=shutter)
    # Roof: a zinc or clay gable centred on the house, and a lower lean-to
    # over the veranda carried on its two posts.
    base, rise = DECK + height, 1.3
    sheet = dict(pitch=.2 if roof_tile == IRON else .46, courses=1 if roof_tile == IRON else 4)
    first = len(p.parts)
    tile_sheet(p, -hw / 2 - .45, hw / 2 + .45, front + .5, hz, base - .1, base + rise, roof_tile, **sheet)
    tile_sheet(p, -hw / 2 - .45, hw / 2 + .45, back - .5, hz, base - .1, base + rise, roof_tile, **sheet)
    tile_sheet(p, -hw / 2 - .2, hw / 2 + .2, pd / 2 + .15, front, base - .55, base + .05, roof_tile, **sheet)
    if roof_tile == IRON:
        for part in p.parts[first:]:
            if part['tile'] == IRON:
                part['tint'] = ZINC
    wall_top = base - .1 + rise * .5 / (hd / 2 + .5) - .02
    for z in [front, back]:
        p.box(0, (base + wall_top) / 2, z, hw, wall_top - base, .12, WALL, True, 'wood', bevel=0)
    p.box(0, base + .3, hz, hw - .1, .6, 2.2, WALL, True, 'wood', bevel=0)
    for x in [-hw / 2 - .01, hw / 2 + .01]:
        vertices = [(x, wall_top, front), (x, base + rise - .05, hz), (x, wall_top, back), (x, base, front), (x, base, back)]
        faces = [(0, 2, 1), (3, 4, 2), (3, 2, 0)] if x > 0 else [(0, 1, 2), (3, 2, 4), (3, 0, 2)]
        surface(p, vertices, faces, WALL, detail=False)
        flag(p, planar=True)
    # Veranda posts, rail (open at the middle for the boardwalk), hammock.
    for x in [-pw / 2 + .2, pw / 2 - .2]:
        p.box(x, DECK + 1.05, pd / 2 - .2, .14, 2.1, .14, DARK, True, 'wood', bevel=.01)
    for x0, x1 in [(-pw / 2 + .2, -1.3), (1.3, pw / 2 - .2)]:
        p.box((x0 + x1) / 2, DECK + .95, pd / 2 - .2, x1 - x0, .08, .08, DARK, True, 'wood', bevel=0)
        for i in range(int((x1 - x0) / .45)):
            p.box(x0 + .22 + i * .45, DECK + .48, pd / 2 - .2, .05, .9, .05, WOOD, bevel=0, detail=True)
    if not bar:
        for i in range(8):
            t = i / 7
            sag = math.sin(t * math.pi) * .4
            p.box(-pw / 2 + .5 + t * 2.2, DECK + 1.5 - sag, front + 1.3, .3, .04, .7, CANVAS if i % 2 else CORAL, bevel=0, detail=True)
    # Stair down to the water at the east side, treads standing on the bed:
    # a wader climbs from the lagoon floor, rising toward the back.
    treads, points = [], []
    x = pw / 2 + .5
    count = 5
    for i in range(count):
        top = DECK * (i + 1) / (count + 1)
        z = 1.0 - i * .55
        treads.append(len(p.colliders))
        p.box(x, (top - .4) / 2, z, 1.0, top + .4, .55, WOOD, True, 'wood', bevel=.01)
        points.append([x, top, z])
    p.box(x + .52, DECK + .45, -.1, .06, .9, 2.9, DARK, True, 'wood', bevel=0)
    floor = floor_record(p, deck, 'deck')
    top = floor['y']
    p.traversal = dict(floors=[floor],
        entrances=[platform_port('front', [0, top, pd / 2 - .4]), dict(id='water', point=[x, 0, 1.6])],
        routes=[route('front-entry', 'front', 'deck', [[0, top, pd / 2 - .4], [(door[0] + door[1]) / 2, top, 2.2],
                                                       [(door[0] + door[1]) / 2, top, 0], [0, top, 0]] if bar else
                      [[0, top, pd / 2 - .4], [0, top, 1.8], [0, top, 0]]),
                route('water-stair', 'water', 'deck', [[x, 0, 1.6], *points, [pw / 2 - .4, top, points[-1][2]], [0, top, points[-1][2]], [0, top, 0]])],
        stairs=[dict(id='water-flight', **{'from': 'water', 'to': 'deck'}, colliderIndices=treads)])
    return p


def mirante(Piece, name='mirante'):
    """The fishermen's lookout: a timber tower with a steep stair to a railed,
    zinc-roofed platform 5 m above the shore."""
    p = Piece(name, 11.6, 3.4)
    top = 5.0
    size = 3.0
    index = len(p.colliders)
    p.box(0, top - .1, 0, size, .2, size, WOOD, True, 'wood', bevel=.015)
    planks(p, size, size, y=top)
    for x in [-size / 2 + .12, size / 2 - .12]:
        for z in [-size / 2 + .12, size / 2 - .12]:
            p.box(x, (top - .2) / 2, z, .2, top - .2, .2, DARK, True, 'wood', bevel=.01)
            p.box(x, top + 1.3, z, .12, 2.6, .12, DARK, bevel=.01)
    for y in [1.4, 3.0]:
        p.beam((-size / 2 + .12, y - .6, -size / 2 + .12), (size / 2 - .12, y + .6, -size / 2 + .12), .08, DARK)
        p.beam((-size / 2 + .12, y - .6, size / 2 - .12), (size / 2 - .12, y + .6, size / 2 - .12), .08, DARK)
    for side in [-1, 1]:
        p.box(0, top + .5, side * (size / 2 - .06), size, 1.0, .1, WOOD, True, 'wood', bevel=0)
    p.box(-size / 2 + .06, top + .5, 0, .1, 1.0, size, WOOD, True, 'wood', bevel=0)
    tile_sheet(p, -size / 2 - .3, size / 2 + .3, size / 2 + .3, 0, top + 2.4, top + 3.1, IRON, pitch=.2, courses=1)
    tile_sheet(p, -size / 2 - .3, size / 2 + .3, -size / 2 - .3, 0, top + 2.4, top + 3.1, IRON, pitch=.2, courses=1)
    for part in p.parts[-6:]:
        if part['tile'] == IRON:
            part['tint'] = ZINC
    # The stair climbs along the +x side from the shore to the open east edge,
    # its top tread butting the platform so the last step lands on the deck.
    count, run = 12, .312
    treads, points = [], [[size / 2 + count * run + .4, 0, 0]]
    for i in range(count):
        t = top * (i + 1) / (count + .5)
        x = size / 2 + (count - 1 - i + .5) * run
        treads.append(len(p.colliders))
        p.box(x, t / 2, 0, run, t, 1.0, WOOD, True, 'wood', bevel=.008)
        points.append([x, t, 0])
    for i in range(0, count, 2):
        tread = p.colliders[treads[i]]
        p.box(tread['x'], tread['y'] + tread['height'] / 2 + .5, .55, .06, 1.0, .06, DARK, True, 'wood', bevel=0)
    floor = floor_record(p, index, 'platform')
    p.traversal = dict(floors=[floor],
        entrances=[dict(id='ground', point=points[0])],
        routes=[route('stair', 'ground', 'platform', [*points, [size / 2 - .3, top, 0], [0, top, 0]])],
        stairs=[dict(id='lookout-flight', **{'from': 'ground', 'to': 'platform'}, colliderIndices=treads)])
    return p


def varal_peixe(Piece, name='varal_peixe'):
    """A fish-drying rack on the shore: two crossed-pole trestles carrying a
    line of split fish and a hanging net, a gutting bench below."""
    p = Piece(name, 3.4, 1.4)
    for x in [-1.45, 1.45]:
        for dz in [-.35, .35]:
            p.beam((x, 0, dz), (x, 1.85, -dz * .2), .08, DARK)
        p.box(x, .9, 0, .12, 1.8, .12, DARK, True, 'wood', bevel=.01)
    p.cylinder(0, 1.78, 0, .04, 3.1, WOOD, sides=6, axis='x')
    for i in range(11):
        x = -1.25 + i * .25
        drop = .38 + (i % 3) * .06
        p.beam((x, 1.76, 0), (x, 1.76 - drop * .4, 0), .012, CANVAS, detail=True)
        # Split fish hung by the tail: a silvery body and a darker tail fork.
        p.orb(x, 1.76 - drop, 0, .13, .34, .05, CANVAS, i % 3 == 2)
        flag(p, segments=(8, 5), tint=[1.0, .97, .9] if i % 2 else [.92, .9, .86])
        p.orb(x, 1.76 - drop * .35, 0, .12, .08, .04, CANVAS, True)
        flag(p, segments=(5, 3), tint=[.6, .62, .64])
    for i in range(5):
        p.orb(-.9 + i * .45, 1.2, .1, .5, .7, .04, CANVAS, i > 2)
        flag(p, segments=(5, 3), tint=[.32, .45, .42])
    p.box(0, .42, .45, 1.6, .06, .45, WOOD, True, 'wood', bevel=.015)
    for x in [-.7, .7]:
        p.box(x, .2, .45, .08, .4, .38, DARK, bevel=.01)
    p.cylinder(.5, .12, -.35, .22, .24, CANVAS, sides=12)
    flag(p, tint=[.35, .55, .7])
    return p


def covo(Piece, name='covo'):
    """Woven cane fish traps, two lying on their sides and one upright: a
    low heap on a deck or the beach."""
    p = Piece(name, 1.6, 1.2)
    p.box(0, .28, 0, 1.2, .56, .8, CANVAS, True, 'wood', bevel=.15)
    flag(p, lods=[2], tint=[.74, .62, .42])
    for (x, z, axis) in [(-.25, -.2, 'x'), (.3, .22, 'x'), (.45, -.32, 'y')]:
        y = .5 if axis == 'y' else .27
        p.cylinder(x, y, z, .26, 1.0 if axis == 'x' else .5, CANVAS, sides=10, axis=axis, top=.2)
        flag(p, tint=[.76, .64, .44], lods=[0, 1])
        for k in range(4):
            if axis == 'x':
                p.cylinder(x - .45 + k * .3, y, z, .27 - k * .015, .03, DARK, sides=10, axis='x', detail=True)
            else:
                p.cylinder(x, y - .2 + k * .14, z, .27 - k * .015, .03, DARK, sides=10, detail=True)
    return p


def add_palafitas(Piece):
    varal_peixe(Piece)
    covo(Piece)
    passarela(Piece)
    passarela_no(Piece)
    palafita(Piece)
    palafita(Piece, 'palafita_b', shutter=CORAL, roof_tile=ROOF)
    palafita(Piece, 'bar_mare', shutter=YELLOW, bar=True)
    mirante(Piece)
