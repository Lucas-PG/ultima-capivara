"""Original compact room furniture. Shared island paint and visible-solid collision.
Kept separate so building access geometry can be reviewed and exported independently.
"""
import math


def pottery(piece, x, y, z, radius, height, tile, detail=False):
    """A small rounded vessel, with a recessed mouth instead of a capped cone."""
    sides = 12
    rings = [(0, radius * .62), (.10, radius * .86), (.48, radius),
             (.79, radius * .76), (.96, radius * .50), (1, radius * .50),
             (1, radius * .37), (.78, radius * .32)]
    vertices = [(x + r * math.cos(math.tau * i / sides), y + h * height,
                 z + r * math.sin(math.tau * i / sides)) for h, r in rings for i in range(sides)]
    faces = []
    for row in range(len(rings) - 1):
        for i in range(sides):
            a, b = row * sides + i, row * sides + (i + 1) % sides
            faces.append([a, a + sides, b + sides, b])
    faces += [list(range(sides)), list(reversed([(len(rings) - 1) * sides + i for i in range(sides)]))]
    piece.parts.append(dict(shape='surface', vertices=vertices, faces=faces,
                            center=[x, y + height / 2, z], size=[radius * 2, height, radius * 2],
                            tile=tile, smooth=True, detail=detail))


def add_interiors(Piece):
    pieces = []
    p = Piece('table', 1.6, .9)
    pieces.append(p)
    p.front_clearance = .55
    p.box(0, .72, 0, 1.6, .12, .9, 5, True, 'wood', bevel=.025)
    for x in [-.65, .65]:
        for z in [-.32, .32]:
            p.box(x, .33, z, .09, .66, .09, 7, True, 'wood', bevel=.009)
        p.box(x, .57, 0, .07, .12, .70, 7, bevel=.006)
    for z in [-.34, .34]:
        p.box(0, .61, z, 1.38, .10, .07, 7, bevel=.006)
    for z in [-.15, .15]:
        p.box(0, .781, z, 1.52, .003, .012, 7, bevel=0, detail=True)

    p = Piece('chair', .58, .64)
    pieces.append(p)
    p.front_clearance = .55
    p.box(0, .415, .015, .58, .07, .57, 5, True, 'wood', bevel=.019)
    for x in [-.23, .23]:
        for z in [-.23, .24]:
            top = .96 if z < 0 else .38
            p.box(x, top / 2, z, .065, top, .065, 7, True, 'wood', bevel=.008)
    for y in [.64, .88]:
        p.box(0, y, -.24, .48, .16, .065, 5, True, 'wood', bevel=.025)
    for x in [-.225, .225]:
        p.box(x, .19, .01, .045, .045, .47, 7, bevel=.004)
    p.box(0, .458, .025, .46, .015, .44, 11, bevel=.005, detail=True)

    p = Piece('shelf_pottery', 1.25, .40)
    pieces.append(p)
    p.front_clearance = .65
    for x in [-.585, .585]:
        p.box(x, .875, 0, .08, 1.75, .40, 7, True, 'wood', bevel=.012)
    p.box(0, .89, -.18, 1.1, 1.67, .04, 5, True, 'wood', bevel=.008)
    for y in [.12, .62, 1.12, 1.71]:
        p.box(0, y, 0, 1.1, .06, .40, 5, True, 'wood', bevel=.012)
    for x, y, z, r, h, tile in [(-.30, .15, .015, .10, .31, 1), (.24, .15, .01, .13, .37, 0),
                                (-.29, .65, .01, .12, .35, 2), (.24, .65, .01, .085, .23, 1),
                                (-.28, 1.15, .01, .09, .29, 0), (.25, 1.15, .015, .13, .40, 1)]:
        pottery(p, x, y, z, r, h, tile, detail=h < .32)

    p = Piece('rug', 1.8, 2.4)
    pieces.append(p)
    p.front_clearance = 0
    p.box(0, .006, 0, 1.8, .012, 2.4, 11, bevel=.004)
    for x in [-.83, .83]:
        p.box(x, .013, 0, .055, .002, 2.23, 11, bevel=0)
        p.parts[-1]['tint'] = [.28, .57, .55]
    for z in [-1.11, 1.11]:
        p.box(0, .013, z, 1.71, .002, .055, 11, bevel=0)
        p.parts[-1]['tint'] = [.28, .57, .55]
    for z in [-.65, 0, .65]:
        p.box(0, .013, z, .26, .002, .26, 11, bevel=0, yaw=math.pi / 4)
        p.parts[-1]['tint'] = [.83, .35, .23]
    for side in [-1, 1]:
        for i in range(14):
            p.box((i - 6.5) * .12, .006, side * 1.185, .025, .01, .028, 15, bevel=0, detail=True)

    p = Piece('wardrobe', 1.45, .72)
    pieces.append(p)
    p.front_clearance = .65
    p.box(0, 1.03, 0, 1.38, 1.87, .62, 5, True, 'wood', bevel=.025)
    for x in [-.53, .53]:
        for z in [-.22, .22]:
            p.box(x, .05, z, .11, .10, .11, 7, True, 'wood', bevel=.012)
    for y in [.18, 1.97]:
        p.box(0, y, 0, 1.45, .06, .66, 7, bevel=.014)
    for x in [-.35, .35]:
        p.box(x, 1.03, .318, .64, 1.65, .017, 7, bevel=.007)
        p.box(x, 1.04, .329, .52, 1.48, .009, 5, bevel=.004, detail=True)
        p.orb(math.copysign(.067, x), 1.06, .339, .032, .032, .023, 3, detail=True)

    p = Piece('sofa', 2.05, .86)
    pieces.append(p)
    p.front_clearance = .55
    for x in [-.84, .84]:
        for z in [-.29, .29]:
            p.box(x, .07, z, .11, .14, .11, 7, True, 'wood', bevel=.014)
    p.box(0, .265, .02, 1.86, .25, .78, 11, True, 'wood', bevel=.065)
    p.box(0, .61, -.30, 1.88, .54, .26, 11, True, 'wood', bevel=.06)
    p.parts[-1]['tint'] = [.28, .61, .58]
    for x in [-.905, .905]:
        p.box(x, .44, 0, .24, .60, .86, 11, True, 'wood', bevel=.07)
        p.parts[-1]['tint'] = [.28, .61, .58]
    for x in [-.41, .41]:
        p.box(x, .423, .04, .80, .115, .60, 11, bevel=.035)
        p.box(x, .67, -.143, .77, .33, .10, 11, bevel=.03, detail=True)
    for x in [-.74, .74]:
        p.box(x, .54, .12, .28, .29, .15, 11, bevel=.034, detail=True)
        p.parts[-1]['tint'] = [.86, .38, .25]

    p = Piece('potted_plant', .70, .70)
    pieces.append(p)
    p.front_clearance = 0
    pottery(p, 0, 0, 0, .23, .40, 1)
    p.cylinder(0, .345, 0, .148, .022, 4, sides=12)
    p.parts[-1]['tint'] = [.34, .27, .22]
    # Curved, broad lanceolate leaves keep a readable silhouette at each LOD.
    for i in range(8):
        a = i * 2.39996323
        reach = .23 + .07 * math.sin(i * 1.8)
        top = .78 + .30 * (i % 3) / 2
        vertices = []
        for row, (r, y, half) in enumerate([(0, .35, .016), (.10, top * .78, .07), (reach, top, .048), (.31, top - .17, .001)]):
            for side in [-1, 0, 1]:
                vertices.append([r * math.sin(a) + side * half * math.cos(a), y + (.014 if side == 0 else 0),
                                 r * math.cos(a) - side * half * math.sin(a)])
        faces = []
        for row in range(3):
            for col in range(2):
                aa = row * 3 + col
                face = [aa, aa + 3, aa + 4, aa + 1]
                faces.append(face)
        offset = len(vertices)
        vertices += [[x, y - .001, z] for x, y, z in vertices]
        faces += [[index + offset for index in reversed(face)] for face in list(faces)]
        p.parts.append(dict(shape='surface', vertices=vertices, faces=faces, tile=12, smooth=True,
                            detail=i > 5, center=[0, top / 2, 0], size=[.70, top, .70]))

    p = Piece('hammock', 2.6, 1.0)
    pieces.append(p)
    p.front_clearance = .65
    for x in [-1.18, 1.18]:
        p.box(x, .055, 0, .23, .11, 1.0, 7, True, 'wood', bevel=.02)
        p.box(x, .72, 0, .095, 1.36, .095, 5, True, 'wood', bevel=.014)
    # A continuous low-slung cloth, not a stack of rectangular planks.
    vertices, faces = [], []
    for row in range(13):
        x = -1.12 + row * 2.24 / 12
        y = .51 + .75 * (abs(x) / 1.12) ** 2
        width = .04 + .39 * math.sin(math.pi * row / 12)
        for col in range(5):
            z = (col - 2) / 2 * width
            vertices.append([x, y + .11 * math.sin(math.pi * row / 12) * (abs(z) / max(.01, width)) ** 2, z])
    for row in range(12):
        for col in range(4):
            a = row * 5 + col
            face = [a, a + 1, a + 6, a + 5]
            faces.append(face)
    offset = len(vertices)
    vertices += [[x, y - .004, z] for x, y, z in vertices]
    faces += [[index + offset for index in reversed(face)] for face in list(faces)]
    p.parts.append(dict(shape='surface', vertices=vertices, faces=faces, tile=11, smooth=True, detail=False,
                        center=[0, .9, 0], size=[2.24, .94, .86]))
    for side in [-1, 1]:
        p.beam((side * 1.12, 1.26, 0), (side * 1.18, 1.37, 0), .024, 7)

    p = Piece('stove', .72, .67)
    pieces.append(p)
    p.front_clearance = .65
    p.box(0, .45, 0, .70, .90, .58, 15, True, 'metal', bevel=.035)
    p.box(0, .914, 0, .72, .032, .60, 9, True, 'metal', bevel=.008)
    p.box(0, .42, .295, .49, .49, .025, 9, bevel=.022)
    p.box(0, .42, .309, .39, .36, .008, 10, bevel=.018, detail=True)
    p.box(0, .65, .32, .39, .025, .025, 9, bevel=.006)
    for x in [-.17, .17]:
        for z in [-.13, .13]:
            p.cylinder(x, .934, z, .104, .009, 9, sides=12)
            p.cylinder(x, .940, z, .067, .004, 14, sides=12, detail=True)
    for x in [-.23, 0, .23]:
        p.cylinder(x, .81, .302, .028, .025, 9, sides=8, axis='z', detail=True)

    p = Piece('wall_picture', .72, .07)
    pieces.append(p)
    p.front_clearance = 0
    p.box(0, .275, 0, .72, .55, .04, 7, bevel=.015)
    p.box(0, .275, .024, .63, .46, .010, 0, bevel=.003)
    # Original tiny island painting: calm sea, sun and two curved palm strokes.
    p.box(0, .165, .030, .61, .19, .002, 2, bevel=0)
    p.orb(.16, .394, .033, .092, .092, .003, 3, detail=False)
    for x in [-.15, -.04]:
        p.beam((x, .14, .033), (x - .024, .34, .033), .015, 7, depth=.003)
        for sign in [-1, 1]:
            p.beam((x - .024, .34, .033), (x - .024 + sign * .11, .30, .033), .014, 12, depth=.003)

    # Broad room silhouettes keep their paint after tiny bevels fall below a pixel.
    for piece in pieces:
        for part in piece.parts:
            if part['shape'] == 'box':
                part['farBevel'] = 0
