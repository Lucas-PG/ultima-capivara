"""District architecture: the Morro laje house with a climbable roof terrace,
the rural veranda house under a hip roof, and the colonial sobrado with a
balcony and platibanda. Game coordinates (metres, Y up, +Z frontage).
Every solid primitive emits its own collider; routes use those same solids.
"""
import math
from access import floor_record, route

STEP = .45  # shared walking step limit


def walls(p, width, depth, height, color, side_tile=None, z0=0.0, windows=True, shutter=2, back_door=True):
    """Four walls around a room centred at (0, z0), doors centred front and back."""
    side_tile = color if side_tile is None else side_tile
    for z, side in [(z0 - depth / 2, -1), (z0 + depth / 2, 1)]:
        door = side > 0 or back_door
        if door:
            for direction in [-1, 1]:
                segment = (width - 2) / 2
                p.box(direction * (1 + segment / 2), height / 2, z, segment, height, .28, color, True)
            p.box(0, (2.65 + height) / 2, z, 2, height - 2.65, .28, color, True)
            portal(p, 0, z, height, side=side)
        else:
            p.box(0, height / 2, z, width, height, .28, color, True)
        if windows:
            for x in [-width * .32, width * .32]:
                window(p, x, 1.78, z + side * .18, side=side, width=1.1 if width < 8 else 1.35, shutter=shutter)
        for direction in [-1, 1]:
            p.box(direction * (width / 4 + .5), .22, z + side * .16, width / 2 - 1, .24, .12, 14)
    for x in [-width / 2, width / 2]:
        p.box(x, height / 2, z0, .28, height, depth, side_tile, True)
        p.box(x, .24, z0, .37, .32, depth, 14)
        for z in [z0 - depth / 2, z0 + depth / 2]:
            p.box(x, height / 2, z, .42, height, .42, 15)


def rebar(p, x, y, z):
    for dx, dz in [(-.06, -.06), (.06, -.06), (-.06, .06), (.06, .06)]:
        p.beam((x + dx, y, z + dz), (x + dx * 1.6, y + .55, z + dz * 1.6), .018, 9, detail=True)


def laje_house(Piece, name='house_laje', width=7.0, depth=6.0, color=2):
    """Flat concrete slab roof with a parapet, a blue water tank and rebar
    left for the next storey. An outside stair on +x climbs to the terrace."""
    height = 3.0
    stair_x = width / 2 + .75
    p = Piece(name, width + 2.0, depth + .7)
    p.box(0, .055, 0, width, .11, depth, 14, True, bevel=.02)
    walls(p, width, depth, height, color, side_tile=13, shutter=12 if color == 2 else 2)
    roof_top = height + .2
    roof_index = len(p.colliders)
    p.box(0, height + .1, 0, width + .3, .2, depth + .3, 14, True, bevel=.03)
    p.box(0, height - .02, 0, width + .42, .08, depth + .42, 15)
    # Parapet with a gap where the stair arrives; cover for rooftop fights.
    edge_x, edge_z = width / 2 + .05, depth / 2 + .05
    gap = (-2.2, -1.1)
    for z in [-edge_z, edge_z]:
        p.box(0, roof_top + .45, z, width + .3, .9, .2, color, True)
    p.box(-edge_x, roof_top + .45, 0, .2, .9, depth + .1, 13, True)
    for z0, z1 in [(-edge_z, gap[0]), (gap[1], edge_z)]:
        p.box(edge_x, roof_top + .45, (z0 + z1) / 2, .2, .9, z1 - z0, 13, True)
    for z in [-edge_z, edge_z]:
        p.box(0, roof_top + .93, z, width + .42, .08, .3, 15)
    # Caixa d'água on its stand at the back corner, and the waiting rebar.
    p.box(-width / 2 + 1.1, roof_top + .2, -depth / 2 + 1.1, 1.3, .4, 1.3, 14, True)
    p.cylinder(-width / 2 + 1.1, roof_top + .4 + .45, -depth / 2 + 1.1, .58, .9, 8, True, 'metal', sides=18)
    p.cylinder(-width / 2 + 1.1, roof_top + .4 + .95, -depth / 2 + 1.1, .62, .1, 9, sides=18)
    for x, z in [(-width / 2 + .3, depth / 2 - .3), (width / 2 - .3, depth / 2 - .3), (-width / 2 + .3, -depth / 2 + .3)]:
        rebar(p, x, roof_top, z)
    p.beam((-width / 2 + 1.1, roof_top + .9, -depth / 2 + 1.1), (-width / 2 + .3, roof_top + 1.8, -depth / 2 + .3), .025, 9, detail=True)
    p.box(1.2, roof_top + .06, 1.0, 1.6, .04, 1.1, 11, detail=True)  # a drying cloth on the slab
    # Outside stair: eight solid treads from the street up the +x wall.
    # The flight starts on the street (terrain level), not on the room slab.
    count, bottom, street = 8, .11, 0.0
    treads = []
    for i in range(count):
        top = street + (i + 1) * (roof_top - street) / count
        z = 2.55 - i * .6
        treads.append(len(p.colliders))
        p.box(stair_x, top / 2, z, 1.2, top, .6, 14, True, bevel=.012)
        p.box(stair_x, top - .015, z, 1.22, .03, .62, 6, detail=True)
    for i, index in enumerate(treads):
        tread = p.colliders[index]
        y, z = tread['y'] + tread['height'] / 2, tread['z']
        p.box(stair_x + .56, y + .49, z, .08, .98, .08, 9, True, 'metal', bevel=.01)
        if i < count - 1:
            nxt = p.colliders[treads[i + 1]]
            p.beam((stair_x + .56, y + .98, z), (stair_x + .56, nxt['y'] + nxt['height'] / 2 + .98, nxt['z']), .05, 9)
    ground_room = floor_record(p, 0, 'ground-room')
    terrace = floor_record(p, roof_index, 'roof-terrace')
    ascent = [[stair_x, street, depth / 2 + .9], [stair_x, street, 3.2]]
    ascent += [[p.colliders[i]['x'] - .1, p.colliders[i]['y'] + p.colliders[i]['height'] / 2, p.colliders[i]['z']] for i in treads]
    ascent += [[width / 2 - .6, roof_top, -1.65], [0, roof_top, -.6]]
    p.traversal = dict(
        floors=[ground_room, terrace],
        entrances=[dict(id='back', point=[0, bottom, -depth / 2 - .7]),
                   dict(id='front', point=[0, bottom, depth / 2 + .7]),
                   dict(id='stair-foot', point=[stair_x, street, depth / 2 + .9])],
        routes=[route('back-entry', 'back', 'ground-room', [[0, bottom, -depth / 2 + .5], [0, bottom, 0]]),
                route('front-entry', 'front', 'ground-room', [[0, bottom, depth / 2 - .5], [0, bottom, 0]]),
                route('outside-stair', 'stair-foot', 'roof-terrace', ascent)],
        stairs=[dict(id='outside-flight', **{'from': 'stair-foot', 'to': 'roof-terrace'}, colliderIndices=treads)])
    return p


def hip_roof(p, width, depth, base, rise, tile=4, z0=0.0):
    rows = max(6, math.ceil(min(width, depth) / .9))
    step = rise / rows
    for i in range(rows):
        k = 1 - i / rows
        w, d = width * k, max(.6, depth - (width - width * k))
        p.box(0, base + (i + .5) * step, z0, w, step, d, tile, True, bevel=.018)
    for i in range(rows):
        k = 1 - (i + 1) / rows
        w, d = width * k, max(.6, depth - (width - width * k))
        for z in [z0 - d / 2, z0 + d / 2]:
            p.box(0, base + (i + 1) * step + .03, z, w + .1, .06, .12, 4, detail=True)
    p.cylinder(0, base + rise + .06, z0, .12, max(.6, depth - width) + .2, tile, sides=10, axis='z')
    for sx in [-1, 1]:
        for sz in [-1, 1]:
            p.beam((sx * width / 2, base, z0 + sz * depth / 2), (sx * .05, base + rise, z0 + sz * max(.3, (depth - width) / 2)), .14, 15)


def varanda_house(Piece, name='house_varanda', width=9.0, depth=5.6, porch=2.2, color=0):
    """Farmhouse: whitewashed body, a deep front veranda on turned posts with a
    low rail, a bench and a hammock, all under one broad hip roof."""
    height = 3.1
    z0 = -porch / 2
    total = depth + porch
    p = Piece(name, width + .8, total + .8)
    p.box(0, .055, 0, width, .11, total, 14, True, bevel=.02)
    walls(p, width, depth, height, color, z0=z0, shutter=12)
    front = z0 + depth / 2
    p.box(0, .1, front + porch / 2, width, .02, porch - .1, 5, detail=True)
    for i in range(11):
        p.box(0, .112, front + .2 + i * .19, width - .1, .004, .015, 7, bevel=0, detail=True)
    post_z = front + porch - .15
    for x in [-width / 2 + .15, -1.45, 1.45, width / 2 - .15]:
        p.box(x, height / 2, post_z, .2, height, .2, 7, True, 'wood')
        p.box(x, .12, post_z, .32, .24, .32, 14)
        p.beam((x, height - .5, post_z), (x + (.5 if x < 0 else -.5), height - .05, post_z), .09, 7)
    for x0, x1 in [(-width / 2 + .25, -1.55), (1.55, width / 2 - .25)]:
        p.box((x0 + x1) / 2, .92, post_z, x1 - x0, .08, .12, 7, True, 'wood')
        p.box((x0 + x1) / 2, .5, post_z, x1 - x0, .06, .08, 7, True, 'wood')
        n = int((x1 - x0) / .32)
        for i in range(n):
            p.box(x0 + (i + .5) * (x1 - x0) / n, .5, post_z, .05, .8, .05, 5, detail=True)
    for x in [-width / 2 + .15, width / 2 - .15]:
        p.box(x, .7, front + porch / 2, .1, .08, porch - .3, 7, True, 'wood')
    p.box(-2.8, .25, front + .45, 1.8, .06, .45, 5, True, 'wood')
    for x in [-3.55, -2.05]:
        p.box(x, .14, front + .45, .08, .22, .4, 7)
    p.box(-2.8, .55, front + .25, 1.8, .4, .06, 5)
    for i in range(9):
        t = i / 8
        sag = math.sin(t * math.pi) * .45
        p.box(1.8 + t * 2.3, 1.35 - sag, post_z - .9, .28, .05, .7, 1 if i % 2 else 11, bevel=.02, detail=True)
    hip_roof(p, width + .7, total + .7, height, 1.9, z0=0)
    p.box(0, height - .06, 0, width + .8, .14, total + .8, 7)
    p.traversal = dict(
        floors=[dict(id='ground-room', bounds=[-width / 2 + .14, z0 - depth / 2 + .14, width / 2 - .14, front - .14], y=.11),
                dict(id='veranda', bounds=[-width / 2 + .14, front + .14, width / 2 - .14, front + porch - .3], y=.11)],
        entrances=[dict(id='back', point=[0, .11, z0 - depth / 2 - .7]), dict(id='front', point=[0, .11, total / 2 + .7])],
        routes=[route('back-entry', 'back', 'ground-room', [[0, .11, z0 - depth / 2 + .5], [0, .11, z0]]),
                route('front-steps', 'front', 'veranda', [[0, .11, post_z - .3], [0, .11, front + .9]]),
                route('veranda-door', 'veranda', 'ground-room', [[0, .11, front + .6], [0, .11, front - .6], [0, .11, z0]])],
        stairs=[])
    return p


def parapet_roof(p, width, depth, height, color):
    """Colonial platibanda: a flat roof hidden behind a moulded parapet."""
    p.box(0, height + .1, 0, width + .3, .2, depth + .3, 14, True, bevel=.03)
    top = height + .2
    for z, front in [(-depth / 2 - .05, False), (depth / 2 + .05, True)]:
        p.box(0, top + (.65 if front else .45), z, width + .4, 1.3 if front else .9, .22, color, True)
        p.box(0, top + (1.33 if front else .93), z, width + .56, .1, .34, 15)
        p.box(0, top + .05, z + (.12 if front else -.12), width + .5, .12, .12, 15)
    for x in [-width / 2 - .05, width / 2 + .05]:
        p.box(x, top + .45, 0, .22, .9, depth + .3, color, True)
    # Front pediment and finials.
    p.box(0, top + 1.55, depth / 2 + .05, 2.6, .35, .2, color)
    p.box(0, top + 1.78, depth / 2 + .05, 1.4, .12, .24, 15)
    for x in [-width / 2, width / 2, -1.3, 1.3]:
        p.cylinder(x, top + 1.5, depth / 2 + .05, .13, .25, 15, sides=10)
        p.orb(x, top + 1.72, depth / 2 + .05, .2, .22, .2, 15)


def sobrado(Piece, building, name='sobrado', width=8.0, depth=7.0, color=3):
    """Two-storey colonial townhouse: pilasters, a wrought-iron balcony over
    the door and a platibanda hiding the roof. Same stair and rooms as the
    tall house, so it keeps the proven two-floor traversal contract."""
    p = building(name, width, depth, floors=2, color=color, roof_style='none')
    height = 6.4
    parapet_roof(p, width, depth, height, color)
    front = depth / 2
    for x in [-width / 2 + .45, -1.45, 1.45, width / 2 - .45]:
        p.box(x, height / 2, front + .2, .34, height, .12, 15)
    p.box(0, 3.25, front + .72, 3.6, .14, 1.2, 14, True)
    for x in [-1.75, 1.75]:
        p.beam((x, 2.9, front + .2), (x, 3.18, front + 1.2), .1, 9)
    for i in range(15):
        x = -1.7 + i * 3.4 / 14
        p.box(x, 3.72, front + 1.28, .035, .8, .035, 9, detail=True)
    p.box(0, 4.14, front + 1.28, 3.5, .06, .06, 9, True, 'metal')
    for x in [-1.75, 1.75]:
        p.box(x, 3.72, front + .74, .035, .8, 1.05, 9, detail=True)
    # French door onto the balcony (painted shutters, glass), plant pots.
    p.box(0, 4.45, front + .16, 1.4, 2.1, .06, 10, bevel=.02)
    for x in [-.8, .8]:
        p.box(x, 4.45, front + .2, .5, 2.1, .08, 12)
    for x in [-1.3, 1.3]:
        p.cylinder(x, 3.48, front + .95, .16, .32, 4, sides=10)
        p.orb(x, 3.75, front + .95, .42, .34, .42, 12)
    return p


def add_architecture(Piece, building, portal_fn, window_fn):
    global portal, window
    portal, window = portal_fn, window_fn
    laje_house(Piece)
    laje_house(Piece, 'house_laje_b', color=3)
    varanda_house(Piece)
    sobrado(Piece, building)
