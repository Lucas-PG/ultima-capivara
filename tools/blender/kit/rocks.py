"""Fractured coastal stone. The collision boxes are inscribed in the same hulls.

This source stays Blender-independent so Mapa can regenerate the exact manifest.
"""
import itertools
import math
import random


def add(a, b):
    return tuple(x + y for x, y in zip(a, b))


def sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def mul(a, s):
    return tuple(x * s for x in a)


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def unit(a):
    return mul(a, 1 / max(1e-12, math.sqrt(dot(a, a))))


def convex_hull(points):
    """Outward polygon faces and supporting planes, with coplanar faces merged."""
    planes = {}
    for i, j, k in itertools.combinations(range(len(points)), 3):
        normal = cross(sub(points[j], points[i]), sub(points[k], points[i]))
        if dot(normal, normal) < 1e-12:
            continue
        normal = unit(normal)
        distance = dot(normal, points[i])
        offsets = [dot(normal, p) - distance for p in points]
        if min(offsets) < -1e-7 and max(offsets) > 1e-7:
            continue
        if max(offsets) > 1e-7:
            normal, distance = mul(normal, -1), -distance
        key = tuple(round(v, 6) for v in (*normal, distance))
        planes[key] = (normal, distance)
    faces, ordered_planes = [], []
    for normal, distance in planes.values():
        ids = [i for i, p in enumerate(points) if abs(dot(normal, p) - distance) < 1e-6]
        center = tuple(sum(points[i][axis] for i in ids) / len(ids) for axis in range(3))
        tangent = unit(sub(points[ids[0]], center))
        bitangent = cross(normal, tangent)
        ids.sort(key=lambda i: math.atan2(dot(sub(points[i], center), bitangent), dot(sub(points[i], center), tangent)))
        faces.append(ids)
        ordered_planes.append((normal, distance))
    return faces, ordered_planes


def surface(piece, vertices, faces, tile, detail=True, tint=None):
    low = [min(p[a] for p in vertices) for a in range(3)]
    high = [max(p[a] for p in vertices) for a in range(3)]
    piece.parts.append(dict(shape='surface', vertices=vertices, faces=faces, tile=tile,
                            center=[(a + b) / 2 for a, b in zip(low, high)],
                            size=[b - a for a, b in zip(low, high)], detail=detail,
                            tint=tint or [1, 1, 1]))


def chunk(piece, center, size, seed, yaw=0):
    rng = random.Random(seed)
    w, h, d = size
    # Chipped octagonal footprints and a tilted broken crown create broad faces,
    # without latitude rings, spheres, or repeated full-width horizontal slabs.
    ring = [(-.40, -.48), (.13, -.50), (.48, -.31), (.49, .23),
            (.22, .48), (-.31, .46), (-.49, .17), (-.48, -.22)]
    points = []
    for top in [False, True]:
        for i, (x, z) in enumerate(ring):
            if top:
                x = x * (.53 + rng.random() * .26) + .17 * math.sin(seed)
                z = z * (.52 + rng.random() * .27) - .11
                y = .64 + rng.random() * .27
            else:
                x *= .67 + rng.random() * .14
                z *= .67 + rng.random() * .14
                y = 0
            points.append((x * w, (y - .5) * h, z * d))
    for i in [0, 2, 4, 6]:
        x, z = ring[i]
        points.append((x * w, h * (-.20 + rng.random() * .39), z * d))
    points.extend([(-w * .10, h * .5, -d * .13), (w * .15, h * .42, d * .04)])
    c, s = math.cos(yaw), math.sin(yaw)
    points = [add(center, (p[0] * c + p[2] * s, p[1], p[2] * c - p[0] * s)) for p in points]
    faces, planes = convex_hull(points)
    bevel = min(w, h, d) * .035
    tint = [[.63, .72, .78], [.72, .76, .75], [.59, .69, .74], [.70, .73, .66]][seed % 4]
    piece.parts.append(dict(shape='rock', vertices=points, faces=faces, center=center,
                            size=size, bevel=bevel, tile=14, detail=False, tint=tint))

    # Three vertical samples fit boxes directly against the hull half-spaces.
    # An erosion by the bevel radius keeps every corner behind the rounded skin.
    # This reduces collider count compared with the old stacked cylinder cores.
    low_y, high_y = min(p[1] for p in points), max(p[1] for p in points)
    for lo, hi in [(.075, .34), (.34, .64), (.64, .88)]:
        cy = low_y + (high_y - low_y) * (lo + hi) / 2
        hy = (high_y - low_y) * (hi - lo) / 2
        origin = (center[0], cy, center[2])
        ratio = 1.0
        for normal, distance in planes:
            available = distance - dot(normal, origin) - abs(normal[1]) * hy - bevel * 1.1
            denominator = abs(normal[0]) * w / 2 + abs(normal[2]) * d / 2
            if denominator > 1e-8:
                ratio = min(ratio, available / denominator)
            elif available < -1e-7:
                ratio = 0
        if ratio > .08:
            piece.colliders.append(dict(type='box', x=origin[0], y=origin[1], z=origin[2],
                                        width=w * ratio, height=hy * 2, depth=d * ratio,
                                        yaw=0, material='stone'))

    # The Blender pass paints moss directly into upward stone faces, so LOD
    # simplification cannot reveal floating or intersecting overlay triangles.
    # Short grass shoots are rooted on those same authored fracture planes.
    upward = sorted([(face, plane) for face, plane in zip(faces, planes) if plane[0][1] > .55],
                    key=lambda item: sum(points[i][1] for i in item[0]) / len(item[0]), reverse=True)
    for patch, (face, (normal, _)) in enumerate(upward[:3]):
        middle = tuple(sum(points[i][a] for i in face) / len(face) for a in range(3))
        border = []
        for edge, i in enumerate(face):
            for step in range(3):
                point = add(points[i], mul(sub(points[face[(edge + 1) % len(face)]], points[i]), step / 3))
                border.append(add(add(middle, mul(sub(point, middle), .57 + rng.random() * .25)), mul(normal, .012)))
        for tuft in range(3 if patch == 0 else 1):
            root = add(middle, mul(sub(border[tuft % len(border)], middle), .42))
            for blade in range(3):
                angle = blade * 2.4 + tuft
                side = (math.cos(angle) * .035, 0, math.sin(angle) * .035)
                tip = add(root, (math.sin(angle) * .11, .18 + rng.random() * .12, math.cos(angle) * .10))
                # A closed triangular blade has two real green faces at grazing angles.
                surface(piece, [add(root, side), sub(root, side), add(root, (0, .02, .014)), tip],
                        [(0, 1, 3), (1, 2, 3), (2, 0, 3), (0, 2, 1)], 12, tint=[.78, .91, .59])

    # One short forked fissure sits just above a broad side plane. It is a thin
    # dark inlay in the rock, never a beam projecting like a wooden plank.
    sides = [(f, p) for f, p in zip(faces, planes) if abs(p[0][1]) < .55 and p[0][2] > .35]
    if sides:
        face, (normal, _) = max(sides, key=lambda item: len(item[0]))
        middle = tuple(sum(points[i][a] for i in face) / len(face) for a in range(3))
        upper = max((points[i] for i in face), key=lambda p: p[1])
        lower = min((points[i] for i in face), key=lambda p: p[1])
        tangent = unit(cross(normal, (0, 1, 0)))
        path = [add(middle, mul(sub(upper, middle), .55)),
                add(middle, mul(tangent, w * .04)),
                add(middle, mul(sub(lower, middle), .65))]
        vertices = []
        for i, point in enumerate(path):
            width = min(w, h) * (.006 if i == 1 else .0015)
            for sign in [-1, 1]:
                vertices.append(add(add(point, mul(tangent, width * sign)), mul(normal, .012)))
        fissure_faces = []
        for i in range(len(path) - 1):
            face_ids = [i * 2, i * 2 + 1, i * 2 + 3, i * 2 + 2]
            a, b, c = (vertices[j] for j in face_ids[:3])
            if dot(cross(sub(b, a), sub(c, a)), normal) < 0:
                face_ids.reverse()
            fissure_faces.append(face_ids)
        surface(piece, vertices, fissure_faces, 9, tint=[.56, .67, .73])


def add_cliffs(Piece):
    recipes = {
        'cliff_rock': (7, 7, [
            ((-.45, 2.75, -.30), (6.1, 5.5, 5.8), -.16),
            ((1.45, 1.85, .10), (3.9, 3.7, 4.4), .34),
            ((-1.90, 1.15, 1.55), (3.0, 2.3, 3.3), -.25),
            ((1.45, .75, 1.95), (3.8, 1.5, 3.0), .26)]),
        'cliff_rock_low': (9, 6, [
            ((-.70, 1.40, -.55), (6.2, 2.8, 4.5), -.10),
            ((2.50, 1.54, -.70), (4.0, 3.08, 3.9), .20),
            ((-3.0, 1.03, .65), (2.9, 2.06, 3.4), -.23),
            ((.75, .83, 1.65), (4.6, 1.66, 2.7), .15)]),
        'cliff_rock_tall': (7, 6, [
            ((-.40, 3.74, -.30), (6.3, 7.48, 5.5), -.14),
            ((1.55, 2.40, .30), (3.7, 4.8, 4.0), .32),
            ((-1.90, 1.4, 1.50), (3.5, 2.8, 3.6), -.28),
            ((1.35, .87, 1.90), (3.6, 1.74, 2.7), .22)]),
        'cliff_ledge': (12, 7, [
            ((-1.0, 2.42, -.65), (8.0, 4.84, 5.2), -.08),
            ((3.90, 1.91, -.28), (4.5, 3.82, 4.6), .19),
            ((-4.15, 1.52, .75), (3.8, 3.04, 4.0), -.26),
            ((.15, 1.14, 2.0), (6.5, 2.28, 3.1), .09)]),
    }
    for variant, (name, (width, depth, chunks)) in enumerate(recipes.items()):
        piece = Piece(name, width, depth)
        for index, (center, size, yaw) in enumerate(chunks):
            chunk(piece, center, size, 410 + variant * 19 + index * 7, yaw)
