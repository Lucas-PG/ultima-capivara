"""Sculpted capybara paw and forearm (v3). Blender 5.0.1.

Arm frame: shoulder at the origin, the arm along +Y (elbow at ELBOW, wrist at
WRIST), the back of the paw +Z, the index toward -X (right arm). The paw is a
metaball sculpt (heel, palm and pads, knuckles, plump three-segment digits with
creased joints and an opposable thumb) fused with a lofted forearm by a voxel
remesh. `sculpt()` returns the smooth base; detail and baking live in
fp_arms.py.
"""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix

ELBOW, WRIST = .30, .60
# Surface radius of an isolated metaball element per unit radius, by stiffness (threshold .6).
_SURFACE = {1.0: .3956, 2.0: .5749, 3.0: .6400, 4.0: .6846, 8.0: .7604}
FINGERS = ('index', 'middle', 'ring', 'thumb')

# Digits in paw space (wrist at the origin): base joint, yaw (+ toward the ring
# side), downward pitch of the first segment, extra droop per joint, segment
# lengths and surface radii at the base, both inner joints and the tip. Short,
# plump digits: a capybara paw, not a hand with three fingers.
DIGITS = {
    'index': dict(base=(-.0255, .060, .0035), yaw=-.15, pitch=.05, droop=.10, lengths=(.022, .0165, .0135), radii=(.0128, .0126, .0118, .0104)),
    'middle': dict(base=(0.0, .064, .0040), yaw=0.0, pitch=.05, droop=.10, lengths=(.0245, .0175, .0145), radii=(.0133, .0130, .0121, .0107)),
    'ring': dict(base=(.0255, .060, .0035), yaw=.15, pitch=.05, droop=.10, lengths=(.0205, .0155, .0130), radii=(.0124, .0122, .0114, .0101)),
    # The thumb leaves the heel of the palm abducted and tilted toward the palm.
    'thumb': dict(base=(-.029, .018, -.004), yaw=-.78, pitch=.34, droop=.14, lengths=(.0215, .0175, .0140), radii=(.0146, .0140, .0128, .0112)),
}


def _direction(yaw, pitch):
    return Vector((math.sin(yaw) * math.cos(pitch), math.cos(yaw) * math.cos(pitch), -math.sin(pitch)))


def digit_points():
    """Joint positions per digit in paw space: base, two inner joints, tip."""
    points = {}
    for finger, d in DIGITS.items():
        p = Vector(d['base']); chain = [p.copy()]
        for i, length in enumerate(d['lengths']):
            p = p + _direction(d['yaw'] * (1 + .15 * i), d['pitch'] + d['droop'] * i) * length
            chain.append(p.copy())
        points[finger] = chain
    return points


POINTS = digit_points()


def digit_frame(finger, segment):
    """Axis along the segment, side (toward the ring side) and top (back of the digit)."""
    a, b = POINTS[finger][segment], POINTS[finger][segment + 1]
    axis = (b - a).normalized()
    side = axis.cross(Vector((0, 0, 1))).normalized()
    if side.x < 0 and finger != 'thumb':
        side.negate()
    top = side.cross(axis).normalized()
    if top.z < 0:
        top.negate()
    return axis, side, top


def digit_bones():
    """Bone name: (head, tail, parent) in paw space."""
    return {f'{finger}{i + 1}': (chain[i], chain[i + 1], 'hand' if i == 0 else f'{finger}{i}')
            for finger, chain in POINTS.items() for i in range(3)}


# Forearm cross-section (arm-space y, half-width, half-height): chunky under the
# elbow, a clear taper, and a thick wrist that flows into the heel of the paw.
FOREARM = [(.25, .060, .055), (.30, .061, .056), (.36, .061, .055), (.41, .058, .051), (.46, .053, .046),
           (.51, .047, .040), (.55, .042, .034), (.58, .039, .031), (.605, .037, .029), (.62, .036, .028)]


def _loft(name, profile, sides=48, fold=None):
    bm = bmesh.new(); rings = []
    for y, rx, rz in profile:
        ring = []
        for j in range(sides):
            a = j * math.tau / sides
            f = fold(a, y) if fold else 0
            ring.append(bm.verts.new((math.cos(a) * (rx + f), y, math.sin(a) * (rz + f))))
        if rings:
            for j in range(sides):
                k = (j + 1) % sides
                bm.faces.new((rings[-1][j], rings[-1][k], ring[k], ring[j]))
        rings.append(ring)
    bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
    mesh = bpy.data.meshes.new(name); bm.to_mesh(mesh); bm.free()
    obj = bpy.data.objects.new(name, mesh); bpy.context.scene.collection.objects.link(obj)
    return obj


# Blender clamps metaball resolution at 5 mm, so the sculpt is polygonized at
# SCALE times its size and shrunk back.
SCALE = 10.0


def _element(mb, kind, center, radius, size=(1, 1, 1), axis=None, negative=False, stiffness=2.0):
    e = mb.elements.new(type=kind)
    e.co = Vector(center) * SCALE; e.radius = radius / _SURFACE[stiffness] * SCALE; e.stiffness = stiffness; e.use_negative = negative
    if kind == 'ELLIPSOID':
        e.size_x, e.size_y, e.size_z = size
    if kind == 'CAPSULE':
        e.size_x = size[0] * SCALE
    if axis is not None:
        e.rotation = Vector((1, 0, 0)).rotation_difference(axis)
    return e


def _elements(fore_gain=None):
    """The whole skin as metaball elements (arm space): forearm chain, paw, digits.

    fore_gain scales the forearm chain per profile point; sculpt() calibrates it
    so the fused surface meets the FOREARM profile despite overlapping fields.
    """
    out = []
    E = lambda kind, center, radius, **k: out.append((kind, Vector(center), radius, k))
    w = Vector((0, WRIST, 0))
    # Forearm: overlapping ellipsoids every 9 mm along the FOREARM profile.
    ys = [p[0] for p in FOREARM]
    gain = fore_gain or [.80] * len(FOREARM)
    y = FOREARM[0][0]
    while y <= WRIST - .012:
        i = max(0, min(len(ys) - 2, next((k for k in range(len(ys) - 1) if ys[k + 1] >= y), len(ys) - 2)))
        t = (y - ys[i]) / (ys[i + 1] - ys[i])
        rx = FOREARM[i][1] + (FOREARM[i + 1][1] - FOREARM[i][1]) * t
        rz = FOREARM[i][2] + (FOREARM[i + 1][2] - FOREARM[i][2]) * t
        g = gain[i] + (gain[i + 1] - gain[i]) * t
        E('ELLIPSOID', (0, y, 0), 1.0, size=(rx * g, .016, rz * g), tag='fore')
        y += .009
    # Wrist, heel and palm: ellipsoids given by their surface half-axes.
    for center, half in [((0, .002, -.0005), (.031, .016, .024)), ((0, .020, -.003), (.033, .017, .021)),
                         ((0, .040, -.0005), (.036, .023, .016)), ((0, .055, .0025), (.035, .011, .013))]:
        E('ELLIPSOID', w + Vector(center), 1.0, size=half)
    # Palm pads: a three-lobed central pad, the heel pad and the thumb mound.
    for x in (-.018, 0, .018):
        E('ELLIPSOID', w + Vector((x, .050, -.0105)), 1.0, size=(.0120, .0110, .0072))
    E('ELLIPSOID', w + Vector((0, .021, -.0140)), 1.0, size=(.021, .0125, .0072))
    E('ELLIPSOID', w + Vector((-.021, .028, -.0098)), 1.0, size=(.0130, .0150, .0082))
    # Digits: one plump elongated ellipsoid per segment (they pinch where they
    # meet, a soft crease at each joint), a pad under each, a rounded tip.
    for finger in FINGERS:
        chain, radii = POINTS[finger], DIGITS[finger]['radii']
        for i in range(3):
            a, b = chain[i], chain[i + 1]
            axis, side, top = digit_frame(finger, i)
            r = (radii[i] + radii[i + 1]) / 2
            length = (b - a).length
            E('ELLIPSOID', w + (a + b) / 2, 1.0, size=(length * .78, r * .94, r * .86), axis=axis)
            E('ELLIPSOID', w + (a + b) / 2 - top * (r * .36) + axis * (length * .05), 1.0,
              size=(length * .42, r * .74, r * .50), axis=axis)
        axis, side, top = digit_frame(finger, 2)
        E('BALL', w + chain[3] - axis * (radii[3] * .80) - top * (radii[3] * .06), radii[3] * .92)
    return out


def paw_metaball(elements, resolution=.005):
    """The skin as one metaball object (polygonized at SCALE)."""
    mb = bpy.data.metaballs.new('skin_mb'); mb.resolution = resolution; mb.render_resolution = resolution; mb.threshold = .6
    for kind, center, radius, k in elements:
        k = {key: v for key, v in k.items() if key != 'tag'}
        _element(mb, kind, center, radius, **k)
    obj = bpy.data.objects.new('skin_mb', mb); bpy.context.scene.collection.objects.link(obj)
    return obj


def to_mesh(obj, scale=1.0):
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    if scale != 1.0:
        mesh.transform(Matrix.Scale(scale, 4))
    out = bpy.data.objects.new(obj.name + '_mesh', mesh); bpy.context.scene.collection.objects.link(out)
    bpy.data.objects.remove(obj)
    return out


def _profile_error(mesh):
    """Measured / wanted forearm half-width and half-height at each profile point."""
    import numpy as np
    co = np.empty(len(mesh.vertices) * 3, np.float32); mesh.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    ratios = []
    for y, rx, rz in FOREARM:
        sl = co[np.abs(co[:, 1] - y) < .0015]
        if not len(sl) or y > WRIST - .02:
            ratios.append(1.0); continue
        ratios.append(((np.abs(sl[:, 0]).max() / rx) + (np.abs(sl[:, 2]).max() / rz)) / 2)
    return ratios


def sculpt(smooth=3):
    """Smooth base of the arm skin (forearm and paw fused), one closed mesh.

    Two polygonizations: the first measures how much the overlapping forearm
    fields swell the surface, the second corrects the chain to the profile.
    """
    gain = [.80] * len(FOREARM)
    skin = to_mesh(paw_metaball(_elements(gain)), 1 / SCALE)
    for _ in range(2):
        ratios = _profile_error(skin.data)
        if all(abs(r - 1) < .01 for r in ratios):
            break
        gain = [g / r for g, r in zip(gain, ratios)]
        bpy.data.objects.remove(skin)
        skin = to_mesh(paw_metaball(_elements(gain)), 1 / SCALE)
    skin.name = 'skin_hi'
    bpy.context.view_layer.objects.active = skin; skin.select_set(True)
    if smooth:
        m = skin.modifiers.new('smooth', 'LAPLACIANSMOOTH'); m.iterations = smooth; m.lambda_factor = .5; m.use_volume_preserve = True
        bpy.ops.object.modifier_apply(modifier=m.name)
    for poly in skin.data.polygons:
        poly.use_smooth = True
    return skin
