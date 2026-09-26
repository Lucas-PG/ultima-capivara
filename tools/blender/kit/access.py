"""Visible fort access. Routes and floors use the same solids as the export."""
import math

FORT_DECK_TOP = 3.26


def add_flat_access(pieces):
    for name in ['house_small', 'house_medium', 'church', 'market_hall', 'warehouse', 'beach_kiosk', 'bridge_stone', 'dock_wood']:
        piece = pieces[name]
        slab = piece.colliders[0]
        floor_id = 'deck' if name in ['bridge_stone', 'dock_wood'] else 'ground-room'
        floor = floor_record(piece, 0, floor_id)
        top, half = floor['y'], slab['depth'] / 2
        piece.traversal = dict(floors=[floor],
            entrances=[dict(id='back', point=[0, top, -half - .7]),
                       dict(id='front', point=[0, top, half + .7])],
            routes=[route('back-entry', 'back', floor_id, [[0, top, -half + .5], [0, top, 0]]),
                    route('front-entry', 'front', floor_id, [[0, top, half - .5], [0, top, 0]])], stairs=[])
        if name == 'dock_wood':
            for side, label in [(-1, 'back-support'), (1, 'front-support')]:
                point = [0, top, side * (half - .4)]
                piece.traversal['entrances'].append(platform_port(label, point))
                piece.traversal['routes'].append(route(label, label, floor_id, [point, [0, top, 0]]))


def add_dock_steps(Piece):
    p = Piece('dock_steps', 2.4, 3.6)
    indices, points = [], [[0, 0, 2.4]]
    for i in range(4):
        top, z = (i + 1) * .18, 1.35 - i * .9
        indices.append(len(p.colliders))
        p.box(0, top / 2, z, 2.4, top, .9, 5, True, 'wood', bevel=.012)
        points.append([0, top, z])
        for x in [-1.08, 1.08]:
            p.box(x, top + .40, z, .12, .80, .12, 7, True, 'wood', bevel=.018)
            if i:
                p.beam((x, top - .18 + .8, z + .9), (x, top + .8, z), .10, 5)
        for offset in [-.3, 0, .3]:
            p.box(0, top + .002, z + offset, 2.10, .004, .018, 7, bevel=0, detail=True)
    floor = floor_record(p, indices[-1], 'upper-landing')
    p.traversal = dict(floors=[floor],
        entrances=[dict(id='ground', point=points[0]), platform_port('deck', [0, .72, -1.8])],
        routes=[route('four-risers', 'ground', 'upper-landing', points),
                route('dock-joint', 'upper-landing', 'deck', [[0, .72, -1.35], [0, .72, -1.8]])],
        stairs=[dict(id='wood-flight', **{'from': 'ground', 'to': 'upper-landing'}, colliderIndices=indices)])


def floor_record(piece, index, name):
    solid = piece.colliders[index]
    return dict(id=name, bounds=[solid['x'] - solid['width'] / 2, solid['z'] - solid['depth'] / 2,
                                solid['x'] + solid['width'] / 2, solid['z'] + solid['depth'] / 2],
                y=solid['y'] + solid['height'] / 2)


def route(name, start, end, points):
    return dict(id=name, **{'from': start, 'to': end}, points=points)


def platform_port(name, point):
    # These ports join other visible pieces. They are not ground entrances.
    return dict(id=name, point=point, platform=True)


def build_fort_gate(Piece, name='fort_gate', width=10, depth=3, opening=4):
    p = Piece(name, width + .2, depth + .2)
    top, cap = FORT_DECK_TOP, .24
    body = top - cap
    pier_width, pier_x = (width - opening) / 2, (width + opening) / 4
    for sign in [-1, 1]:
        x = sign * pier_x
        p.box(x, body / 2, 0, pier_width, body, depth, 6, True, bevel=.06)
        for row in range(5):
            for side in [-1, 1]:
                p.box(x, .28 + row * .53, side * (depth / 2 + .022), pier_width - .10, .46, .06,
                      14 if row % 3 == 0 else 6, bevel=.025, detail=True)
    # The gate lintel has standing clearance below and meets the wall above.
    p.box(0, body - .20, 0, opening, .40, depth, 6, True, bevel=.025)
    index = len(p.colliders)
    p.box(0, top - cap / 2, 0, width + .2, cap, depth + .2, 14, True, bevel=.02)
    floor = floor_record(p, index, 'gate-walk')
    count = max(6, round(width / 1.4))
    for i in range(count):
        x = -width / 2 + .55 + i * (width - 1.1) / (count - 1)
        p.box(x, top + .49, -depth / 2 + .31, .80, .98, .62, 6, True, bevel=.055)
        p.box(x, top + .99, -depth / 2 + .31, .90, .12, .73, 14, bevel=.03)
    if name == 'fort_gate':
        for sign in [-1, 1]:
            p.box(sign * (opening / 2 + .07), 1.22, .65, .13, 2.44, 1.65, 7, True, 'wood')
            for y in [.55, 1.85]:
                p.box(sign * (opening / 2 - .01), y, .65, .07, .12, 1.55, 9, detail=True)
    p.traversal = dict(floors=[floor],
        entrances=[platform_port('left', [-width / 2 + .4, top, .45]),
                   platform_port('middle', [0, top, .45]),
                   platform_port('right', [width / 2 - .4, top, .45])],
        routes=[route('left-half', 'left', 'gate-walk', [[-width / 2 + .4, top, .45], [0, top, .45]]),
                route('middle-entry', 'middle', 'gate-walk', [[0, top, .45], [0, top, .45]]),
                route('right-half', 'gate-walk', 'right', [[0, top, .45], [width / 2 - .4, top, .45]])], stairs=[])
    return p


def add_fort_access(Piece, pieces):
    wall = pieces['fort_wall']
    floor = floor_record(wall, 1, 'wall-walk')
    assert abs(floor['y'] - FORT_DECK_TOP) < .001
    top = floor['y']
    wall.traversal = dict(floors=[floor],
        entrances=[platform_port('left', [-3.6, top, .45]),
                   platform_port('middle', [0, top, .45]),
                   platform_port('right', [3.6, top, .45])],
        routes=[route('left-half', 'left', 'wall-walk', [[-3.6, top, .45], [0, top, .45]]),
                route('middle-entry', 'middle', 'wall-walk', [[0, top, .45], [0, top, .45]]),
                route('right-half', 'wall-walk', 'right', [[0, top, .45], [3.6, top, .45]])], stairs=[])

    # Preserve the open east approach beneath a supported stone lintel.
    build_fort_gate(Piece, 'fort_postern', 8, 2, 6.5)

    p = Piece('fort_stairs', 2.3, 8)
    bottom, count, run = .10, 9, 5.4
    p.box(0, bottom / 2, 3.4, 2.3, bottom, 1.2, 14, True, bevel=.01)
    foot = floor_record(p, 0, 'foot')
    treads = []
    for i in range(count):
        y = bottom + (i + 1) * (top - bottom) / count
        z = 2.8 - (i + .5) * run / count
        treads.append(len(p.colliders))
        p.box(0, y / 2, z, 2.3, y, run / count, 6, True, bevel=.012)
        # Low stone parapets rise with the stair, leaving a wide clear aisle.
        for sign in [-1, 1]:
            p.box(sign * 1.03, y + .34, z, .24, .68, run / count, 6, True, bevel=.035)
            p.box(sign * 1.03, y + .71, z, .28, .10, run / count, 14, True, bevel=.015)
        p.box(0, y - .022, z - run / count / 2 + .018, 1.72, .035, .025, 14, detail=True, bevel=.008)
    index = len(p.colliders)
    p.box(0, top - .12, -3.3, 2.3, .24, 1.4, 14, True, bevel=.015)
    landing = floor_record(p, index, 'landing')
    p.box(0, top / 2 - .12, -3.7, 2.3, top - .24, .6, 6, True, bevel=.04)
    p.box(0, top + .36, -3.88, 2.3, .72, .24, 6, True, bevel=.035)
    p.box(0, top + .77, -3.88, 2.3, .10, .30, 14, True, bevel=.02)
    points = [[0, bottom, 3.4]]
    points += [[p.colliders[index]['x'], p.colliders[index]['y'] + p.colliders[index]['height'] / 2,
                p.colliders[index]['z']] for index in treads]
    points += [[0, top, -3.3]]
    p.traversal = dict(floors=[foot, landing],
        entrances=[dict(id='ground', point=[0, 0, 4.5]),
                   platform_port('left', [-1.15, top, -3.3]),
                   platform_port('right', [1.15, top, -3.3])],
        routes=[route('ground-entry', 'ground', 'foot', [[0, 0, 4.5], [0, bottom, 3.4]]),
                route('ascent', 'foot', 'landing', points),
                route('left-entry', 'landing', 'left', [[0, top, -3.3], [-1.15, top, -3.3]]),
                route('right-entry', 'landing', 'right', [[0, top, -3.3], [1.15, top, -3.3]])],
        stairs=[dict(id='stone-flight', **{'from': 'foot', 'to': 'landing'}, colliderIndices=treads)])

    # An L-shaped inner gallery passes around each sealed tower drum.
    p = Piece('fort_corner_walk', 4.2, 4.2)
    p.box(0, top / 2, .85, 3.8, top, 1.6, 6, True, bevel=.02)
    a = floor_record(p, 0, 'side')
    p.box(1.1, top / 2, -.925, 1.4, top, 1.95, 6, True, bevel=.02)
    b = floor_record(p, 1, 'turn')
    p.box(0, top + .37, 1.50, 3.8, .74, .24, 6, True, bevel=.04)
    p.box(0, top + .79, 1.50, 3.8, .10, .30, 14, True, bevel=.025)
    p.box(1.66, top + .37, -.175, .24, .74, 3.35, 6, True, bevel=.04)
    p.box(1.66, top + .79, -.175, .30, .10, 3.35, 14, True, bevel=.025)
    p.traversal = dict(floors=[a, b],
        entrances=[platform_port('side-wall', [-2.55, top, .8]),
                   platform_port('front-wall', [1.1, top, -2.55])],
        routes=[route('side-entry', 'side-wall', 'side', [[-2.55, top, .8], [0, top, .8]]),
                route('corner-turn', 'side', 'turn', [[0, top, .8], [1.1, top, .8], [1.1, top, -.8]]),
                route('front-entry', 'turn', 'front-wall', [[1.1, top, -.8], [1.1, top, -2.55]])], stairs=[])


def build_lighthouse(Piece):
    p = Piece('lighthouse', 7, 7)
    bottom, top = .40, 11.15
    p.box(0, bottom / 2, 0, 6.5, bottom, 6.5, 14, True, bevel=.06)
    ground = floor_record(p, 0, 'ground-room')
    # A hollow twelve-sided shell keeps the striped silhouette. Actual openings
    # admit the player and daylight; no solid drum sits behind the door.
    radius, segments = 2.35, 12
    width = 2 * radius * math.tan(math.pi / segments) + .035
    for side in range(segments):
        angle = side * math.tau / segments
        x, z = math.sin(angle), math.cos(angle)
        holes = [(bottom, 2.85)] if side == 0 else []
        if side % 3 == 0:
            holes += [(4.70, 5.65), (8.20, 9.15)]
        for layer in range(6):
            spans = [(bottom + layer * 1.75, bottom + (layer + 1) * 1.75)]
            for low, high in holes:
                spans = [(a, min(b, low)) for a, b in spans if a < low and min(b, low) > a] + \
                        [(max(a, high), b) for a, b in spans if b > high and b > max(a, high)]
            for low, high in spans:
                p.box(x * radius, (low + high) / 2, z * radius, width, high - low, .24,
                      0 if layer % 2 == 0 else 1, True, bevel=.012, yaw=angle)
        for low, high in holes:
            if high == 2.85:
                continue
            for tangent in [-width / 2, width / 2]:
                p.box(x * (radius + .13) + math.cos(angle) * tangent, (low + high) / 2,
                      z * (radius + .13) - math.sin(angle) * tangent, .12, high - low + .16, .15,
                      15, bevel=.025, yaw=angle)
            for y in [low - .04, high + .04]:
                p.box(x * (radius + .13), y, z * (radius + .13), width + .1, .13, .18,
                      15, bevel=.025, yaw=angle)
    for x in [-.75, .75]:
        p.box(x, 1.60, 2.47, .15, 2.55, .20, 15, bevel=.025)
    p.box(0, 2.88, 2.47, 1.65, .16, .23, 15, bevel=.025)
    # Open leaves lie beside the real doorway rather than covering its void.
    for sign in [-1, 1]:
        p.box(sign * .85, 1.55, 2.08, .11, 2.25, .62, 7, bevel=.025)

    # Treads are supported by the central column and outer masonry. Two full
    # turns give generous standing clearance below the next revolution.
    p.cylinder(0, (bottom + top) / 2, 0, .70, top - bottom, 7, True, 'wood', sides=20)
    count, radial = 28, 1.55
    step = math.tau * 2 / count
    treads, points = [], [[.65, bottom, -1.425]]
    for i in range(count):
        angle = math.pi + (i + .5) * step
        x, z = math.sin(angle), math.cos(angle)
        y = bottom + (i + 1) * (top - bottom) / count
        treads.append(len(p.colliders))
        p.box(x * radial, y - .09, z * radial, 1.05, .18, 1.70,
              5, True, 'wood', bevel=.01, yaw=angle)
        points.append([x * radial, y, z * radial])
        p.box(x * .99, y + .43, z * .99, .10, .86, .10, 7, True, 'wood', bevel=.014, yaw=angle)
        if i:
            previous = math.pi + (i - .5) * step
            last_y = bottom + i * (top - bottom) / count
            p.beam((math.sin(previous) * .99, last_y + .86, math.cos(previous) * .99),
                   (x * .99, y + .86, z * .99), .075, 7)

    floors = [ground]
    for name, x, z, width, depth in [('back', 0, -2.675, 6.5, 1.15), ('east', 2.675, 0, 1.15, 4.2),
                                    ('front', 0, 2.675, 6.5, 1.15), ('west', -2.675, 0, 1.15, 4.2)]:
        index = len(p.colliders)
        p.box(x, top - .15, z, width, .30, depth, 14, True, bevel=.02)
        floors.append(floor_record(p, index, 'balcony-' + name))
    points += [[0, top, -2.675]]
    for side in [-1, 1]:
        for along in [-3.08, 0, 3.08]:
            p.box(along, top + .5, side * 3.08, .11, 1.0, .11, 9, True, 'metal', bevel=.025)
            if along == 0:
                p.box(side * 3.08, top + .5, along, .11, 1.0, .11, 9, True, 'metal', bevel=.025)
        for y in [top + .43, top + .92]:
            p.box(0, y, side * 3.08, 6.16, .08, .08, 9, True, 'metal', bevel=.014)
            p.box(side * 3.08, y, 0, .08, .08, 6.16, 9, True, 'metal', bevel=.014)
    p.cylinder(0, 12.1, 0, 1.10, 1.90, 10, True, sides=20)
    for i in range(12):
        angle = math.tau * i / 12
        x, z = math.sin(angle) * 1.12, math.cos(angle) * 1.12
        p.beam((x, 11.15, z), (x, 13.10, z), .10, 15)
    p.cylinder(0, 13.20, 0, 1.55, .22, 15, sides=24)
    p.cylinder(0, 13.90, 0, 1.65, 1.30, 4, top=.12, sides=24)
    p.orb(0, 14.60, 0, .24, .28, .24, 3, False)
    p.traversal = dict(floors=floors,
        entrances=[dict(id='front', point=[0, 0, 3.9])],
        routes=[route('entry', 'front', 'ground-room', [[0, 0, 3.9], [0, bottom, 1.65],
                    [1.1, bottom, 1.1], [1.55, bottom, 0], [1.1, bottom, -1.1], [.65, bottom, -1.425]]),
                route('spiral', 'ground-room', 'balcony-back', points),
                route('back-east', 'balcony-back', 'balcony-east', [[0, top, -2.675], [2.675, top, -2.675], [2.675, top, 0]]),
                route('east-front', 'balcony-east', 'balcony-front', [[2.675, top, 0], [2.675, top, 2.675], [0, top, 2.675]]),
                route('front-west', 'balcony-front', 'balcony-west', [[0, top, 2.675], [-2.675, top, 2.675], [-2.675, top, 0]]),
                route('west-back', 'balcony-west', 'balcony-back', [[-2.675, top, 0], [-2.675, top, -2.675], [0, top, -2.675]])],
        stairs=[dict(id='spiral-flight', **{'from': 'ground-room', 'to': 'balcony-back'}, colliderIndices=treads)])
    return p
