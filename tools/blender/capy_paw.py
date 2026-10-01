"""Shared four-digit paw. Local wrist at zero, digits +Y, back +Z.

Explicit ownership keeps digit vertices on their own finger and adjacent joint.
Both the character and viewmodel use this anatomy instead of proximity skins.
"""
import math
from mathutils import Vector
from character_surfaces import FUR, PAW, CLOTH, NAIL

FINGERS = ('index', 'middle', 'ring', 'thumb')
# Digits long enough to wrap a handguard or a pistol grip: knuckles at the end of
# the palm, three phalanges with a slight natural droop toward the palm and a
# small fan. The thumb leaves the heel of the palm abducted about 40 degrees and
# tilted toward the palm, the rest pose a grip needs to oppose the fingers.
# A touch over the anatomical build so a paw can wrap a rifle handguard.
PAW_SCALE = 1.06
POINTS = {}
for finger, x, scale, fan in [('index', -.023, 1.0, -.07), ('middle', 0, 1.05, 0), ('ring', .023, .93, .08)]:
    base, points, direction = Vector((x, .058, -.003)) * PAW_SCALE, [], Vector((math.sin(fan), math.cos(fan), 0))
    for length, droop in [(0, 0), (.026, .0012), (.022, .0022), (.018, .0035)]:
        base = base + direction * (length * scale * PAW_SCALE) - Vector((0, 0, droop * PAW_SCALE))
        points.append(base.copy())
    POINTS[finger] = points
_thumb = Vector((-math.sin(math.radians(40)) * math.cos(math.radians(18)), math.cos(math.radians(40)) * math.cos(math.radians(18)), -math.sin(math.radians(18))))
POINTS['thumb'] = [Vector((-.026, .010, -.007)) * PAW_SCALE]
for length, bend in [(.022, 0), (.019, .06), (.016, .1)]:
    _thumb = (_thumb + Vector((.35, 0, -.6)) * bend).normalized()
    POINTS['thumb'].append(POINTS['thumb'][-1] + _thumb * (length * PAW_SCALE))
# The paw grows out of a slim wrist: heel pad, broad palm, knuckle ridge.
PALM = [(y * PAW_SCALE, rx * PAW_SCALE, rz * PAW_SCALE) for y, rx, rz in
        [(0, .027, .020), (.012, .031, .022), (.028, .037, .022), (.044, .039, .0198), (.056, .037, .017), (.064, .033, .011)]]
ARM_WRIST = .60
RADII = {k: [r * PAW_SCALE for r in v] for k, v in {'finger': [.0112, .0106, .0094, .0072], 'thumb': [.0128, .0118, .0100, .0076]}.items()}


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
    for y, rx, rz in PALM:
        ring = []
        for j in range(32):
            a = j * math.tau / 32
            shape = min(1, y / (.029 * PAW_SCALE))
            z = math.sin(a) * rz - .002 * PAW_SCALE * shape
            if math.sin(a) < -.5:
                z += .004 * PAW_SCALE * (1 - abs(math.cos(a))) * shape
            ring.append(vertex(Vector((math.cos(a) * rx, y, z)), {'hand': 1}, FUR if y < .012 * PAW_SCALE or math.sin(a) > .05 else PAW))
        if rings:
            bridge(rings[-1], ring)
        rings.append(ring)
    # The first loop is shared with the forearm; there is no internal wrist cap.
    faces.append(tuple(rings[-1]))

    for finger, points in POINTS.items():
        radii = RADII['thumb' if finger == 'thumb' else 'finger']
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
        tip_ring = [vertex(points[3] + side * (math.cos(j * math.tau / 12) * .005 * PAW_SCALE) + top * (math.sin(j * math.tau / 12) * .004 * PAW_SCALE),
                           {f'{finger}3': 1}, PAW) for j in range(12)]
        bridge(rings[-1], tip_ring)
        cap = vertex(points[3] + axis * .003 * PAW_SCALE, {f'{finger}3': 1}, PAW)
        for j in range(12):
            faces.append((tip_ring[j], tip_ring[(j + 1) % 12], cap))
        nail_rings = []
        # Thick blunt claw curling over the digit tip, capybara style.
        for d, width, thick, lift in [(-.008, .0070, .0033, .0048), (-.002, .0074, .0038, .0053), (.004, .0062, .0033, .0047),
                                      (.008, .0044, .0023, .003), (.0105, .0022, .0011, .001)]:
            d, width, thick, lift = d * PAW_SCALE, width * PAW_SCALE, thick * PAW_SCALE, lift * PAW_SCALE
            center = points[3] + axis * d + top * lift
            ring = [vertex(center + side * (math.cos(j * math.tau / 10) * width) + top * (math.sin(j * math.tau / 10) * thick),
                           {f'{finger}3': 1}, NAIL) for j in range(10)]
            if nail_rings:
                bridge(nail_rings[-1], ring)
            nail_rings.append(ring)
        faces.append(tuple(reversed(nail_rings[0]))); faces.append(tuple(nail_rings[-1]))
    return verts, faces, weights, surfaces


def arm_geometry():
    """Continuous forearms and rolled sleeves, sharing the authored paw.

    The elbow sits at 0.30 and the wrist at 0.60: a forearm long enough to enter
    the first-person frame from the lower corners with a bent elbow, and a
    two-roll canvas cuff just below the elbow.
    """
    WRIST = Vector((0, ARM_WRIST, 0))
    verts, faces, weights, surfaces = [], [], [], []


    def arm_weights(y):
        blend = min(1, max(0, (y - .275) / .055))
        wrist = min(1, max(0, (y - .565) / .035))
        if wrist > 0:
            return {'fore_twist': 1 - wrist, 'hand': wrist}
        twist = min(1, max(0, (y - .34) / .21))
        return {'upper': 1 - blend, 'fore': blend * (1 - twist), 'fore_twist': blend * twist}


    def loft(profile, kind, sleeve=False):
        rings = []
        for y, rx, rz in profile:
            ring = []
            for j in range(32):
                a = j * math.tau / 32
                fold = (.0025 * math.sin(a * 7 + y * 21) + .0014 * math.sin(a * 12 - y * 35)) if sleeve else .0005 * math.sin(a * 9 + y * 60) * max(0, min(1, (ARM_WRIST - y) / .04))
                p = Vector((math.cos(a) * (rx + fold), y, math.sin(a) * (rz + fold)))
                ring.append(len(verts)); verts.append(tuple(p)); weights.append(arm_weights(y)); surfaces.append(kind)
            if rings:
                for j in range(32):
                    k = (j + 1) % 32; faces.append((rings[-1][j], rings[-1][k], ring[k], ring[j]))
            rings.append(ring)
        faces.append(tuple(reversed(rings[0])))
        if sleeve: faces.append(tuple(rings[-1]))
        return rings[-1]


    # Chunky stylised forearm: thick below the elbow, tapering to a clear wrist.
    wrist_ring = loft([(0, .066, .066), (.10, .068, .067), (.20, .064, .061), (.27, .060, .056), (.30, .060, .056),
          (.33, .062, .056), (.37, .062, .055), (.41, .059, .051), (.45, .053, .045), (.49, .046, .038),
          (.53, .039, .031), (.56, .034, .026), (.58, .031, .023), (ARM_WRIST, PALM[0][1], PALM[0][2])], FUR)
    # Upper sleeve, then a cuff rolled twice with a crease between the rolls.
    loft([(-.02, .082, .082), (.08, .083, .082), (.17, .080, .078), (.24, .076, .072),
          (.262, .078, .073), (.278, .085, .080), (.294, .088, .083), (.307, .083, .078), (.319, .087, .081),
          (.333, .086, .080), (.345, .078, .072), (.352, .068, .062)], CLOTH, True)
    p, f, w, s = paw_geometry(); offset = len(verts) - 32
    # Reuse the forearm's final loop, including its weights and normals.
    remap = lambda i: wrist_ring[i] if i < 32 else i + offset
    verts.extend([tuple(Vector(v) + WRIST) for v in p[32:]])
    faces.extend([tuple(remap(i) for i in face) for face in f]); weights.extend(w[32:]); surfaces.extend(s[32:])
    fine = [False] * len(verts)
    tufts, tuft_faces, tuft_weights = fur_tufts(verts, [tuple(reversed(face)) for face in faces], weights,
        lambda i: surfaces[i] == FUR and .36 < verts[i][1] < .56,
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
