"""Original accessible mud bath and low trampoline, with source-derived contacts."""
import math
from rocks import surface


def ring(piece, radius, profile, tile, tint, detail=False, segments=64):
    """Closed turned cloth/metal section, with outward winding on every side."""
    vertices = []
    for i in range(segments):
        angle = math.tau * i / segments
        for offset, y in profile:
            vertices.append(((radius + offset) * math.sin(angle), y,
                             (radius + offset) * math.cos(angle)))
    n = len(profile)
    faces = []
    for i in range(segments):
        for j in range(n):
            faces.append((i * n + j, i * n + (j + 1) % n,
                          ((i + 1) % segments) * n + (j + 1) % n,
                          ((i + 1) % segments) * n + j))
    surface(piece, vertices, faces, tile, detail, tint)
    piece.parts[-1]['smooth'] = True


def contact(piece, inset):
    # The first collider is the very same cylinder used to render the floor.
    deck = piece.colliders[0]
    assert deck['type'] == 'cylinder'
    piece.interaction = dict(surfaceY=round(deck['y'] + deck['height'] / 2, 4),
                             radius=round(deck['radius'] - inset, 4))


def add_recreation(Piece):
    bath = Piece('mud_bath', 4.2, 4.2)
    bath.cylinder(0, .06, 0, 1.78, .12, 4, True, 'earth', sides=64)
    bath.parts[-1]['tint'] = [.37, .32, .28]
    contact(bath, .33)
    # Unequal stone rim blocks have two broad walk-in gaps along local Z.
    # Every raised lip stays comfortably below the shared 45 cm step limit.
    for i in range(18):
        angle = math.tau * i / 18
        if abs(math.sin(angle)) < .50:
            continue
        radius = 1.88 + .025 * math.sin(i * 2.1)
        height = .25 + .04 * math.sin(i * 1.8) ** 2
        bath.box(math.sin(angle) * radius, height / 2, math.cos(angle) * radius,
                 .57 + .05 * math.sin(i * 1.7), height, .33, 14, True,
                 'stone', bevel=.065, yaw=angle)
        bath.parts[-1]['tint'] = [.69, .74, .66]
    # Quiet painted swirls and three little bubbles suggest soft wet mud.
    for radius, y in [(.42, .1215), (1.08, .122)]:
        ring(bath, radius, [(-.008, y), (0, y + .003), (.010, y), (0, y - .001)],
             4, [.49, .40, .31], detail=True, segments=40)
    for x, z, r in [(-.77, .55, .075), (.69, -.54, .055), (-.13, -1.13, .045)]:
        bath.orb(x, .12, z, r * 2, r * .55, r * 2, 4)
        bath.parts[-1]['tint'] = [.45, .36, .28]
    # Moss stays low on the rim. It cannot conceal the two entry gaps.
    for i in [2, 6, 11, 15]:
        angle = math.tau * i / 18
        bath.orb(math.sin(angle) * 1.92, .22, math.cos(angle) * 1.92,
                 .30, .09, .22, 12)

    trampoline = Piece('trampoline', 3.8, 3.8)
    trampoline.cylinder(0, .296, 0, 1.66, .048, 11, True, 'wood', sides=64)
    trampoline.parts[-1]['tint'] = [.12, .25, .24]
    contact(trampoline, .28)
    # Low rounded teal safety pad, over a visible dark tubular chassis.
    ring(trampoline, 1.69, [(-.20, .28), (-.18, .355), (-.11, .409),
                           (.08, .409), (.17, .36), (.18, .28), (.10, .255),
                           (-.11, .255)], 2, [.60, .91, .81])
    ring(trampoline, 1.68, [(-.032, .24), (0, .265), (.032, .24), (0, .215)],
         9, [.77, .83, .84], segments=48)
    # Visible foam supports sit wholly inside the curved safety pad. Their
    # matching solids give the rim a walkable top without enclosing its hole.
    for i in range(16):
        angle = math.tau * i / 16
        trampoline.box(math.sin(angle) * 1.69, .32, math.cos(angle) * 1.69,
                       .60, .12, .18, 2, True, 'wood', bevel=.025, yaw=angle)
        trampoline.parts[-1]['tint'] = [.60, .91, .81]
    for i in range(12):
        angle = math.tau * (i + .5) / 12
        x, z = math.sin(angle), math.cos(angle)
        if i % 2 == 0:
            trampoline.cylinder(x * 1.69, .123, z * 1.69, .049, .246,
                                9, True, 'metal', sides=10)
            trampoline.box(x * 1.69, .029, z * 1.69, .24, .058, .18,
                           9, True, 'metal', bevel=.025, yaw=angle)
        # The seams are inset ochre tapes with visible small brass fasteners.
        trampoline.beam((x * 1.54, .399, z * 1.54),
                        (x * 1.81, .386, z * 1.81), .015, 3, detail=True)
        trampoline.orb(x * 1.78, .408, z * 1.78, .043, .018, .043, 3)
        # Short spring segments stay under the safety pad, never above the deck.
        for turn in range(5):
            rr = 1.46 + turn * .036
            trampoline.orb(x * rr, .285, z * rr, .047, .038, .047, 9)
    # A stitched cream target motif makes the bounce surface legible at distance.
    ring(trampoline, .46, [(-.012, .321), (0, .324), (.012, .321), (0, .3205)],
         11, [.88, .83, .60], detail=True, segments=48)
    for i in range(4):
        a = math.tau * i / 4
        x, z = math.sin(a), math.cos(a)
        trampoline.beam((x * .53, .324, z * .53), (x * .68, .324, z * .68),
                        .027, 11, detail=True)
