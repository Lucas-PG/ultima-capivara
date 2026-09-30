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
        p.plant('pot', x, 3.63, front + .95, radius=.17, style='flower')
    return p


def add_architecture(Piece, building, portal_fn, window_fn):
    global portal, window
    portal, window = portal_fn, window_fn
    laje_house(Piece)
    laje_house(Piece, 'house_laje_b', color=3)
    varanda_house(Piece)
    sobrado(Piece, building)
    campinho(Piece)


def campinho(Piece, name='campinho'):
    """Neighbourhood football pitch: goals, a stepped concrete stand you can
    climb for height, team shelters, a perimeter wall with gaps, four
    floodlights and a boteco at the corner. The painted pitch is world paint."""
    L, Wd = 32, 20
    p = Piece(name, L + 16, Wd + 10)
    # Goals with nets (posts are solid, nets are soft).
    for sx in [-1, 1]:
        x = sx * L / 2
        for z in [-2.6, 2.6]:
            p.box(x, 1.15, z, .14, 2.3, .14, 15, True, 'metal', bevel=.03)
            p.box(x + sx * 1.3, 1.1, z, .08, 2.2, .08, 9, True, 'metal')
            p.beam((x, 2.25, z), (x + sx * 1.3, 2.15, z), .06, 9)
        p.box(x, 2.3, 0, .14, .14, 5.34, 15, True, 'metal', bevel=.03)
        p.box(x + sx * 1.3, 2.15, 0, .08, .08, 5.2, 9, detail=True)
        for i in range(11):
            z = -2.5 + i * .5
            p.box(x + sx * 1.3, 1.1, z, .02, 2.2, .02, 11, detail=True)
            p.beam((x, 2.28, z), (x + sx * 1.3, 2.14, z), .015, 11, detail=True)
        for j in range(5):
            y = .2 + j * .45
            p.box(x + sx * 1.3, y, 0, .02, .02, 5.2, 11, detail=True)
            for z in [-2.6, 2.6]:
                p.beam((x, y, z), (x + sx * 1.3, y, z), .015, 11, detail=True)
    # The stand (arquibancada): four .42 m concrete tiers, a painted backrest wall.
    stand_z = Wd / 2 + 1.2
    for i in range(4):
        top = (i + 1) * .42
        z = stand_z + i * .9 + .45
        p.box(0, top / 2, z, 22, top, .9, 14, True, bevel=.02)
        p.box(0, top + .01, z - .3, 22, .02, .3, 2 if i % 2 else 3, detail=True)
    p.box(0, 1.68 + .6, stand_z + 3.75, 22.4, 1.2 + 1.68 * 0 + .0, .25, 2, True)
    p.box(0, 1.05, stand_z + 3.75, 22.4, 2.1, .25, 14, True)
    for x in [-11.2, 11.2]:
        p.box(x, 1.2, stand_z + 1.9, .25, 2.4, 4.0, 14, True)
        # The stand's end walls face the pitch and the road: a club-coloured barra, a white
        # stripe and a coping, instead of a bare concrete slab.
        for side in [-1, 1]:
            face = x + side * .135
            p.box(face, .5, stand_z + 1.9, .02, 1.0, 3.9, 2, bevel=0)
            p.box(face, 1.08, stand_z + 1.9, .02, .16, 3.9, 15, bevel=0)
            p.box(face, 1.62, stand_z + 1.9, .02, .7, 2.6, 1 if x < 0 else 3, bevel=0, detail=True)
        p.box(x, 2.44, stand_z + 1.9, .36, .1, 4.1, 15, bevel=.015)
    for i in range(7):
        p.box(-9 + i * 3, 2.9, stand_z + 3.75, 1.6, .5, .08, 1 if i % 2 else 3, detail=True)
    # Team shelters on the south side.
    for sx in [-1, 1]:
        x = sx * 5.5
        z = -Wd / 2 - 1.6
        p.box(x, .25, z, 4, .1, .5, 5, True, 'wood')
        for dx in [-1.9, 1.9]:
            p.box(x + dx, .12, z, .08, .24, .45, 9)
            p.box(x + dx, 1.1, z - .45, .1, 2.2, .1, 9, True, 'metal')
        p.box(x, 2.25, z - .1, 4.3, .08, 1.3, 8, True, 'metal', bevel=.01)
        p.box(x, 1.1, z - .5, 4.2, 2.2, .06, 10, detail=True)
    # Perimeter wall with three openings on the south and full ends.
    wz = -Wd / 2 - 3.2
    for x0, x1 in [(-24, -9), (-2, 2), (9, 24)]:
        p.box((x0 + x1) / 2, .5, wz, x1 - x0, 1.0, .25, 0, True)
        p.box((x0 + x1) / 2, 1.03, wz, x1 - x0 + .1, .08, .35, 15)
        for i in range(int((x1 - x0) / 2.5)):
            p.box(x0 + 1.25 + i * 2.5, .5, wz - .14, 1.8, .6, .02, 1 if i % 3 == 0 else 2 if i % 3 == 1 else 3, detail=True)
    for sx in [-1, 1]:
        p.box(sx * 24, .5, -2, .25, 1.0, 18, 0, True)
    # Floodlights.
    for sx in [-1, 1]:
        for sz in [-1, 1]:
            x, z = sx * (L / 2 + 2.2), sz * (Wd / 2 + (2.2 if sz < 0 else 5.5))
            p.cylinder(x, 4.5, z, .17, 9, 9, True, 'metal', sides=10)
            p.box(x, 9.2, z, 1.8, .9, .3, 9)
            for dx in [-.45, .45]:
                for dy in [-.2, .2]:
                    p.box(x + dx, 9.2 + dy, z - sz * .16, .36, .3, .04, 15, detail=True)
    # Boteco: yellow walls, open counter toward the pitch, corrugated roof,
    # a fridge, beer crates and red plastic tables.
    bx, bz = L / 2 + 5.5, -Wd / 2 + 1.0
    p.box(bx, .06, bz, 4.4, .12, 4.0, 14, True)
    p.box(bx + 2.1, 1.35, bz, .2, 2.7, 4.0, 3, True)
    p.box(bx, 1.35, bz - 1.9, 4.4, 2.7, .2, 3, True)
    p.box(bx - 2.1, 1.35, bz - 1.0, .2, 2.7, 2.0, 3, True)
    p.box(bx - .2, .55, bz + 1.4, 3.4, 1.1, .5, 5, True, 'wood')
    p.box(bx - .2, 1.12, bz + 1.45, 3.6, .06, .62, 7)
    p.box(bx, 2.82, bz + .3, 5.2, .1, 5.4, 8, True, 'metal')
    for i in range(12):
        p.box(bx - 2.5 + i * .45, 2.9, bz + .3, .06, .06, 5.4, 9, detail=True)
    for x in [bx - 2.5, bx + 2.5]:
        p.box(x, 1.4, bz + 2.8, .12, 2.8, .12, 7, True, 'wood')
    p.box(bx + 1.5, .9, bz - 1.4, .7, 1.8, .6, 15, True)
    p.box(bx + 1.5, 1.2, bz - 1.08, .6, .9, .02, 10, detail=True)
    for i, (dx, dz) in enumerate([(-1.2, -1.3), (-.6, -1.3), (-1.2, -.7)]):
        p.box(bx + dx, .22 + (i // 2) * .44, bz + dz, .5, .44, .5, 5, True, 'wood')
    p.box(bx, 3.2, bz + 2.75, 3.2, .7, .12, 1)
    p.box(bx, 3.2, bz + 2.83, 2.6, .4, .02, 15, detail=True)
    for tx, tz in [(bx - 1.2, bz + 4.5), (bx + 1.4, bz + 5.2)]:
        p.cylinder(tx, .72, tz, .45, .04, 1, sides=16)
        p.cylinder(tx, .36, tz, .05, .7, 1, True, sides=8)
        for a in [0, 2.1, 4.2]:
            p.cylinder(tx + math.cos(a) * .75, .22, tz + math.sin(a) * .75, .2, .44, 1, sides=12)
    return p
