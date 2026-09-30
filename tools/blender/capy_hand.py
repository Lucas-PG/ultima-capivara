"""The world character's paw: a big leathery capybara hand (numpy SDF, no bpy).

Its own design, not the first-person paw: four thick digits with short blunt claws (three
fingers and a lower, abducted outer digit that works as a thumb), a broad padded palm and a
furred back. Paw space matches the first-person rig's convention so the same finger curls
drive it: wrist at the origin, digits along +y, the back of the paw +z, the index toward -x
on the right paw. Sizes are final metres (about 25 cm long, 17 cm across the knuckles).
"""
import math
import numpy as np
from capy_sdf import Ellipsoid, RoundCone, Sphere, Union, Material

F = np.float32
FINGERS = ('index', 'middle', 'ring', 'thumb')
# Base joint, yaw (+ toward the ring side), downward pitch of the first segment, extra droop per
# joint, segment lengths and radii at the base, both inner joints and the tip.
DIGITS = {
    'index': dict(base=(-.047, .108, .004), yaw=-.17, pitch=.10, droop=.16, lengths=(.046, .034, .028), radii=(.0260, .0250, .0232, .0205)),
    'middle': dict(base=(0.0, .116, .005), yaw=0.0, pitch=.10, droop=.16, lengths=(.050, .036, .030), radii=(.0270, .0258, .0240, .0212)),
    'ring': dict(base=(.047, .108, .004), yaw=.17, pitch=.10, droop=.16, lengths=(.043, .032, .027), radii=(.0252, .0242, .0226, .0200)),
    'thumb': dict(base=(-.056, .038, -.008), yaw=-.80, pitch=.30, droop=.16, lengths=(.042, .032, .027), radii=(.0275, .0262, .0240, .0212)),
}


def _direction(yaw, pitch):
    return np.array([math.sin(yaw) * math.cos(pitch), math.cos(yaw) * math.cos(pitch), -math.sin(pitch)], F)


def digit_points():
    """Joint positions per digit in paw space: base, two inner joints, tip."""
    points = {}
    for finger, d in DIGITS.items():
        p = np.array(d['base'], F); chain = [p.copy()]
        for i, length in enumerate(d['lengths']):
            p = p + _direction(d['yaw'] * (1 + .15 * i), d['pitch'] + d['droop'] * i) * length
            chain.append(p.copy())
        points[finger] = chain
    return points


POINTS = digit_points()


def digit_frame(finger, segment):
    """Axis along the segment, side (toward the ring side) and top (back of the digit)."""
    a, b = POINTS[finger][segment], POINTS[finger][segment + 1]
    axis = (b - a) / np.linalg.norm(b - a)
    side = np.cross(axis, np.array([0, 0, 1], F)); side /= np.linalg.norm(side)
    if side[0] < 0 and finger != 'thumb':
        side = -side
    top = np.cross(side, axis); top /= np.linalg.norm(top)
    if top[2] < 0:
        top = -top
    return axis, side, top


def digit_bones():
    """Bone name: (head, tail, parent) in paw space."""
    return {f'{finger}{i + 1}': (chain[i], chain[i + 1], 'hand' if i == 0 else f'{finger}{i}')
            for finger, chain in POINTS.items() for i in range(3)}


def _along(axis):
    """Rotation whose local +x is `axis` (the long axis of a digit segment)."""
    x = np.array([1, 0, 0], F); c = np.cross(x, axis); s = np.linalg.norm(c); cs = float(x @ axis)
    if s < 1e-6:
        return np.eye(3, dtype=F)
    k = c / s; K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]], F)
    return (np.eye(3) + K * s + K @ K * (1 - cs)).astype(F)


def build(mat_skin, mat_claw):
    """The paw as an SDF in paw space. The painter decides fur versus bare skin by position."""
    parts = [
        # Wrist, heel and the broad palm, thickest at the heel.
        Ellipsoid((0, .004, -.002), (.056, .034, .044)), Ellipsoid((0, .045, -.004), (.064, .044, .038)),
        Ellipsoid((0, .085, .000), (.070, .040, .032)), Ellipsoid((0, .108, .004), (.068, .022, .026)),
        # Palm pads: a three-lobed pad under the knuckles, the heel pad and the thumb mound.
        Ellipsoid((-.036, .092, -.024), (.024, .024, .014)), Ellipsoid((0, .098, -.025), (.024, .024, .014)),
        Ellipsoid((.036, .092, -.024), (.024, .024, .014)), Ellipsoid((.004, .042, -.032), (.040, .030, .015)),
        Ellipsoid((-.040, .050, -.024), (.026, .030, .017)),
    ]
    claws = []
    for finger in FINGERS:
        chain, radii = POINTS[finger], DIGITS[finger]['radii']
        for i in range(3):
            a, b = chain[i], chain[i + 1]
            axis, side, top = digit_frame(finger, i)
            r = (radii[i] + radii[i + 1]) / 2; length = float(np.linalg.norm(b - a))
            R = _along(axis)
            # One plump segment (they pinch at the joints) and its pad underneath.
            parts.append(Ellipsoid((a + b) / 2, (length * .80, r * .98, r * .90), R=R))
            parts.append(Ellipsoid((a + b) / 2 - top * (r * .38) + axis * (length * .05), (length * .44, r * .78, r * .52), R=R))
        axis, side, top = digit_frame(finger, 2)
        r = radii[3]; tip = chain[3]
        parts.append(Sphere(tip - axis * (r * .75) - top * (r * .05), r * .95))
        # A short blunt claw set into the top of the fingertip.
        a = tip - axis * (r * .55) + top * (r * .42)
        claws.append(RoundCone(a, a + axis * (r * 1.25) - top * (r * .50), r * .50, r * .24))
    body = Union(parts, k=.011, mat=mat_skin)
    return Union([body, Material(Union(claws, k=.003), mat_claw)], k=.003)
