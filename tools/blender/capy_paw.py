"""Shared four-digit paw. Local wrist at zero, digits +Y, back +Z.

Explicit ownership keeps digit vertices on their own finger and adjacent joint.
Both the character and viewmodel use this anatomy instead of proximity skins.
"""
import math
from mathutils import Vector
from character_surfaces import FUR, PAW, CLOTH, NAIL

FINGERS = ('index', 'middle', 'ring', 'thumb')
POINTS = {}
for finger, x, scale in [('index', -.026, .96), ('middle', 0, 1.03), ('ring', .026, .90)]:
    POINTS[finger] = [Vector((x, .061 + y * scale, -.003 - z))
                     for y, z in [(0, 0), (.024, .001), (.045, .003), (.062, .005)]]
POINTS['thumb'] = [Vector(p) for p in [(-.029, .020, -.002), (-.046, .038, -.004), (-.057, .055, -.007), (-.059, .071, -.010)]]


def digit_bones():
    return {f'{finger}{i + 1}': (points[i], points[i + 1], 'hand' if i == 0 else f'{finger}{i}')
            for finger, points in POINTS.items() for i in range(3)}


def paw_geometry():
    verts, faces, weights, surfaces = [], [], [], []

    def vertex(p, w, kind):
        verts.append(tuple(p)); weights.append(w); surfaces.append(kind)
        return len(verts) - 1

    def bridge(a, b):
        for j in range(len(a)):
            k = (j + 1) % len(a); faces.append((a[j], a[k], b[k], b[j]))

    rings = []
    for y, rx, rz in [(0, .028, .021), (.012, .031, .023), (.029, .039, .024),
                      (.045, .041, .022), (.058, .038, .019), (.066, .034, .012)]:
        ring = []
        for j in range(32):
            a = j * math.tau / 32
            shape = min(1, y / .029)
            z = math.sin(a) * rz - .002 * shape
            if math.sin(a) < -.5:
                z += .004 * (1 - abs(math.cos(a))) * shape
            ring.append(vertex(Vector((math.cos(a) * rx, y, z)), {'hand': 1}, FUR if y < .012 or math.sin(a) > .05 else PAW))
        if rings:
            bridge(rings[-1], ring)
        rings.append(ring)
    # The first loop is shared with the forearm; there is no internal wrist cap.
    faces.append(tuple(rings[-1]))

    for finger, points in POINTS.items():
        radii = [.0117, .012, .0103, .0079] if finger != 'thumb' else [.0140, .0124, .0105, .008]
        rings = []
        for segment in range(3):
            axis = (points[segment + 1] - points[segment]).normalized()
            side = axis.cross(Vector((0, 0, 1))).normalized(); top = side.cross(axis).normalized()
            for t in [0, .14, .46, .83]:
                center = points[segment].lerp(points[segment + 1], t)
                r = radii[segment] * (1 - t) + radii[segment + 1] * t
                bone = f'{finger}{segment + 1}'; w = {bone: 1.0}
                if t < .14:
                    blend = .5 * (1 - t / .14)
                    w = {bone: 1 - blend, ('hand' if segment == 0 else f'{finger}{segment}'): blend}
                ring = []
                for j in range(12):
                    a = j * math.tau / 12
                    ring.append(vertex(center + side * (math.cos(a) * r) + top * (math.sin(a) * r * .87), w,
                                       FUR if math.sin(a) > .35 and segment < 2 else PAW))
                if rings:
                    bridge(rings[-1], ring)
                rings.append(ring)
        axis = (points[3] - points[2]).normalized()
        side = axis.cross(Vector((0, 0, 1))).normalized(); top = side.cross(axis).normalized()
        tip_ring = [vertex(points[3] + side * (math.cos(j * math.tau / 12) * .005) + top * (math.sin(j * math.tau / 12) * .004),
                           {f'{finger}3': 1}, PAW) for j in range(12)]
        bridge(rings[-1], tip_ring)
        cap = vertex(points[3] + axis * .003, {f'{finger}3': 1}, PAW)
        for j in range(12):
            faces.append((tip_ring[j], tip_ring[(j + 1) % 12], cap))
        nail_rings = []
        for d, width, thick in [(-.007, .0068, .0032), (-.002, .0070, .0035), (.004, .0052, .0028), (.007, .0032, .001)]:
            center = points[3] + axis * d + top * .005
            ring = [vertex(center + side * (math.cos(j * math.tau / 10) * width) + top * (math.sin(j * math.tau / 10) * thick),
                           {f'{finger}3': 1}, NAIL) for j in range(10)]
            if nail_rings:
                bridge(nail_rings[-1], ring)
            nail_rings.append(ring)
        faces.append(tuple(reversed(nail_rings[0]))); faces.append(tuple(nail_rings[-1]))
    return verts, faces, weights, surfaces


def arm_geometry():
    """Continuous forearms and rolled sleeves, sharing the authored paw."""
    WRIST = Vector((0, .447, 0))
    verts, faces, weights, surfaces = [], [], [], []


    def arm_weights(y):
        blend = min(1, max(0, (y - .218) / .054))
        wrist = min(1, max(0, (y - .409) / .038))
        if wrist > 0:
            return {'fore_twist': 1 - wrist, 'hand': wrist}
        twist = min(1, max(0, (y - .275) / .134))
        return {'upper': 1 - blend, 'fore': blend * (1 - twist), 'fore_twist': blend * twist}


    def loft(profile, kind, sleeve=False):
        rings = []
        for y, rx, rz in profile:
            ring = []
            for j in range(32):
                a = j * math.tau / 32
                fold = (.0025 * math.sin(a * 7 + y * 21) + .0014 * math.sin(a * 12 - y * 35)) if sleeve else .0005 * math.sin(a * 9 + y * 60) * max(0, min(1, (.447 - y) / .04))
                p = Vector((math.cos(a) * (rx + fold), y, math.sin(a) * (rz + fold)))
                ring.append(len(verts)); verts.append(tuple(p)); weights.append(arm_weights(y)); surfaces.append(kind)
            if rings:
                for j in range(32):
                    k = (j + 1) % 32; faces.append((rings[-1][j], rings[-1][k], ring[k], ring[j]))
            rings.append(ring)
        faces.append(tuple(reversed(rings[0])))
        if sleeve: faces.append(tuple(rings[-1]))
        return rings[-1]


    wrist_ring = loft([(0, .059, .062), (.10, .061, .063), (.20, .052, .049), (.232, .047, .044),
          (.245, .046, .043), (.263, .050, .045), (.29, .053, .046), (.33, .050, .041),
          (.37, .043, .036), (.409, .034, .028), (.431, .029, .023), (.447, .028, .021)], FUR)
    loft([(-.02, .071, .073), (.055, .074, .075), (.13, .071, .070), (.19, .064, .060),
          (.218, .062, .056), (.235, .064, .056), (.25, .059, .054), (.266, .061, .055),
          (.278, .065, .058), (.289, .065, .057), (.298, .059, .052), (.293, .053, .047)], CLOTH, True)
    p, f, w, s = paw_geometry(); offset = len(verts) - 32
    # Reuse the forearm's final loop, including its weights and normals.
    remap = lambda i: wrist_ring[i] if i < 32 else i + offset
    verts.extend([tuple(Vector(v) + WRIST) for v in p[32:]])
    faces.extend([tuple(remap(i) for i in face) for face in f]); weights.extend(w[32:]); surfaces.extend(s[32:])
    fine = [False] * len(verts)
    tufts, tuft_faces, tuft_weights = fur_tufts(verts, [tuple(reversed(face)) for face in faces], weights,
        lambda i: surfaces[i] == FUR and .305 < verts[i][1] < .410,
        (0, 1, 0), 140, length=.005, width=.00055)
    offset = len(verts)
    verts.extend(tufts); faces.extend([tuple(i + offset for i in face) for face in tuft_faces])
    weights.extend(tuft_weights); surfaces.extend([FUR] * len(tufts)); fine.extend([True] * len(tufts))
    return verts, faces, weights, surfaces, fine


def fur_tufts(vertices, faces, weights, eligible, flow, count, seed=710, length=.009, width=.001):
    """Sparse opaque tapered fibres for the close silhouette; no alpha shells."""
    import random
    rng = random.Random(seed)
    triangles, areas = [], []
    for face in faces:
        for i in range(1, len(face) - 1):
            ids = (face[0], face[i], face[i + 1])
            if not all(eligible(index) for index in ids): continue
            a, b, c = [Vector(vertices[index]) for index in ids]
            area = (b - a).cross(c - a).length * .5
            if area > 1e-9: triangles.append(ids); areas.append(area)
    added, quads, skin = [], [], []
    for ids in rng.choices(triangles, weights=areas, k=count):
        a, b, c = [Vector(vertices[index]) for index in ids]
        u, v = rng.random(), rng.random()
        if u + v > 1: u, v = 1 - u, 1 - v
        p = a * (1 - u - v) + b * u + c * v
        normal = (b - a).cross(c - a).normalized()
        tangent = Vector(flow) - normal * normal.dot(Vector(flow))
        if tangent.length < .1: tangent = (b - a)
        tangent.normalize()
        across = tangent.cross(normal).normalized()
        tuft_length = length * rng.uniform(.6, 1.1)
        half_width = width * rng.uniform(.7, 1.2)
        root = p + normal * .0005
        tip = root + tangent * tuft_length + normal * (tuft_length * .25)
        offset = len(added)
        added.extend([tuple(root - across * half_width), tuple(root + across * half_width),
                      tuple(tip + across * half_width * .12), tuple(tip - across * half_width * .12)])
        quads.append((offset, offset + 1, offset + 2, offset + 3))
        blend = {}
        for index, fraction in zip(ids, (1 - u - v, u, v)):
            for bone, weight in weights[index].items(): blend[bone] = blend.get(bone, 0) + weight * fraction
        skin.extend([blend.copy() for _ in range(4)])
    return added, quads, skin
