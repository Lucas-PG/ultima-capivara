"""Última Capivara player character v6: the sculpted form as signed distance fields.

Game space (metres, x = the character's right, y up, facing -z, feet on y = 0). The outer
surface (fur, cloth and gear) is one union, so the game mesh is watertight and nothing can
poke through a garment. Every part names a material; parts of the body also name the bone
chain they belong to (weights come from the nearest part, see capybara_v6.py).

Proportions follow docs/art/character-benchmark/holding-reference.jpg and the turnaround:
a stocky barrel torso, short strong legs, a long blunt rectangular head with small high eyes
and small round ears, big three-toed feet and the four-digit paw from paw_sculpt.py.
"""
import math
import numpy as np
import capy_sdf as S
from capy_sdf import ZLoft, Ellipsoid, RoundBox, RoundCone, Sphere, Torus, Plane, Loft, Union, Cut, Intersect, Offset, Displace, Transform, Material, Field, rot, frame

import paw_sculpt as P

F = np.float32
MATERIALS = ['fur', 'muzzle', 'nose', 'pad', 'claw', 'shirt', 'denim', 'scarf', 'leather', 'pack', 'canvas',
             'trouser', 'brass', 'eye', 'ear_in', 'hipcloth', 'lip', 'button', 'strap', 'sole',
             # Sewn-on pieces paint like their cloth; their own ids give the painter their seams.
             'denim_pocket', 'trouser_pocket', 'pouch', 'pack_flap']
M = {name: i for i, name in enumerate(MATERIALS)}
# The team colour: the scarf (high, by the face), the hip rag (low, on the moving silhouette)
# and the bedroll on the pack (a large block seen from behind and the sides at distance).
TEAM = ('scarf', 'hipcloth', 'canvas')


def v(*a):
    return np.array(a, F)


def norm(a):
    a = np.asarray(a, F); return a / np.linalg.norm(a)


# ------------------------------------------------------------------ skeleton (bind pose)
SHOULDER = v(.228, 1.300, .000)
UPPER_ARM, FOREARM_LEN = .276, .246
# Bind pose between the hanging rest and the gun hold, so both deform moderately: the upper
# arm forward and out at about 55 degrees, the forearm reaching in front of the belly.
ARM_DIR = norm((.30, -.60, -.55))
FORE_DIR = norm((-.25, -.10, -.96))
HIP = v(.118, .770, .018)
KNEE = v(.128, .440, -.012)
ANKLE = v(.132, .112, .030)
TOE = v(.134, .040, -.150)
EYE = v(.140, 1.716, -.052)
EAR = v(.112, 1.776, .082)
# The world paw is the first-person paw scaled up (it reads the weapon at distance); held
# weapons scale with it, so first-person grip specs stay valid in weapon space.
PAW_SCALE = 1.1
FOOT_SCALE = 1.3
NECK_BASE = v(0, 1.370, .000)
# Where the mouth line turns up at its corner (the smile and frown bones pivot there).
MOUTH_CORNER = v(.070, 1.540, -.268)
HEAD_PIVOT = v(0, 1.520, -.010)


def side(p, s):
    """Mirror a right-side point (x > 0) to side s (+1 right, -1 left)."""
    q = np.array(p, F); q[0] *= s; return q


def elbow(s):
    return side(SHOULDER + ARM_DIR * UPPER_ARM, s)


def wrist(s):
    return side(SHOULDER + ARM_DIR * UPPER_ARM + FORE_DIR * FOREARM_LEN, s)


def paw_frame(s):
    """Paw space (paw_sculpt: digits +y, back of paw +z, index -x for the right paw) to game space.

    The paw carries on from the forearm; its back faces up and out, the index/thumb side up,
    so the palms face each other a little below horizontal: the 'ready' carry.
    """
    fwd = norm(FORE_DIR * np.array([1, 1, 1], F) + v(0, .10, -.05))
    back = norm(v(.80, .55, 0) - fwd * float(v(.80, .55, 0) @ fwd))
    # paw x = y_paw x z_paw; index (-x) must end up on top.
    x = np.cross(fwd, back)
    Mr = np.stack([x, fwd, back], 1).astype(F)
    if s < 0:
        Mr = np.diag([-1, 1, 1]).astype(F) @ Mr
    return Mr


def bones():
    """Bone name -> (head, tail, parent). The runtime contract keeps every v4/v5 name."""
    b = {}
    b['root'] = (v(0, 0, 0), v(0, .18, 0), None)
    b['spine'] = (v(0, .760, .010), v(0, 1.060, .000), 'root')
    b['chest'] = (v(0, 1.060, .000), NECK_BASE, 'spine')
    b['neck'] = (NECK_BASE, HEAD_PIVOT, 'chest')
    b['head'] = (HEAD_PIVOT, v(0, 1.74, -.02), 'neck')
    b['jaw'] = (v(0, 1.545, -.12), v(0, 1.52, -.27), 'head')
    b['mouth_cavity'] = (v(0, 1.548, -.300), v(0, 1.578, -.300), 'head')
    b['tail'] = (v(0, .72, .20), v(0, .70, .26), 'spine')
    b['pack'] = (v(0, 1.02, .22), v(0, 1.36, .23), 'chest')
    # Leaf bone for breathing and jiggle: scaling it moves no other bone.
    b['belly'] = (v(0, .960, -.060), v(0, 1.060, -.080), 'spine')
    b['hipcloth'] = (v(.214, .905, -.070), v(.226, .640, -.070), 'spine')
    for s, n in ((-1, 'L'), (1, 'R')):
        eye = eye_point(s)[0]
        b['ear_' + n] = (side(EAR + v(-.006, -.022, -.004), s), side(EAR + v(.004, .040, .002), s), 'head')
        for part in ('socket', 'blink'):
            b[f'{part}_{n}'] = (eye, eye + v(0, .044, 0), 'head')
        for part in ('tip', 'peak'):
            b[f'blink_{part}_{n}'] = (eye, eye + v(0, .044, 0), 'blink_' + n)
        b['glint_' + n] = (eye + side(v(.006, .008, -.012), s), eye + side(v(.006, .05, -.012), s), 'blink_' + n)
        b['brow_' + n] = (eye + side(v(-.004, .030, -.004), s), eye + side(v(-.004, .060, -.004), s), 'head')
        b['mouth_' + n] = (side(MOUTH_CORNER, s), side(MOUTH_CORNER + v(0, .030, 0), s), 'mouth_cavity')
        b['thigh_' + n] = (side(HIP, s), side(KNEE, s), 'root')
        b['shin_' + n] = (side(KNEE, s), side(ANKLE, s), 'thigh_' + n)
        b['foot_' + n] = (side(ANKLE, s), side(v(.134, .045, -.075), s), 'shin_' + n)
        b['toes_' + n] = (side(v(.134, .045, -.075), s), side(TOE, s), 'foot_' + n)
        b['arm_' + n] = (side(SHOULDER, s), elbow(s), 'chest')
        b['forearm_' + n] = (elbow(s), wrist(s), 'arm_' + n)
        b['forearm_twist_' + n] = (elbow(s), wrist(s), 'forearm_' + n)
        Mr, w = paw_frame(s), wrist(s)
        b['paw_' + n] = (w, w + Mr @ v(0, .061 * PAW_SCALE, 0), 'forearm_twist_' + n)
        for name, (a, c, parent) in P.digit_bones().items():
            b[f'paw_{name}_{n}'] = (w + Mr @ (v(*a) * PAW_SCALE), w + Mr @ (v(*c) * PAW_SCALE), 'paw_' + n if parent == 'hand' else f'paw_{parent}_{n}')
    return b


# ------------------------------------------------------------------ helpers
def on_surface(node, p, offset=0.0, steps=6):
    """Project points onto node's (offset) surface along the numerical gradient."""
    p = np.atleast_2d(np.asarray(p, F)).copy()
    e = F(.0015)
    for _ in range(steps):
        d, _m = S.evaluate(node, p, cull=False)
        g = np.stack([S.evaluate(node, p + v(*o), cull=False)[0] - S.evaluate(node, p - v(*o), cull=False)[0]
                      for o in ((e, 0, 0), (0, e, 0), (0, 0, e))], 1)
        g /= np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-9)
        p = p - g * (d - offset)[:, None]
    return p


def slab(y0, y1):
    return Intersect(Plane((0, y1, 0), (0, 1, 0)), Plane((0, y0, 0), (0, -1, 0)))


def wave(amp, fx, fy, fz, phase=0.0):
    return lambda p: amp * np.sin(p[:, 0] * fx + p[:, 1] * fy + p[:, 2] * fz + phase)


# ------------------------------------------------------------------ body
def torso():
    return Union([
        Ellipsoid((0, .835, .028), (.222, .165, .182)),
        Ellipsoid((0, .995, -.030), (.230, .200, .208)),
        Ellipsoid((0, 1.185, -.004), (.220, .160, .182)),
        Ellipsoid((0, 1.298, .006), (.232, .086, .152)),
        Ellipsoid((0, 1.362, .018), (.160, .068, .122)),
    ], k=.07, mat=M['fur'])


def neck():
    return Union([Ellipsoid((0, 1.440, -.010), (.134, .105, .136)), Ellipsoid((0, 1.505, -.020), (.140, .070, .140))], k=.05, mat=M['fur'])


# Head profile stations: (z, top, bottom, half-width at the crown, half-width at the jaw, exponent).
# A long flat-topped skull on broad cheeks, a tall muzzle that narrows a little, and a blunt snout
# whose nose leans forward over a receding upper lip (the loft ends in a small rounded tip).
HEAD_STATIONS = [
    (0.195, 1.690, 1.585, 0.040, 0.060, 2.0),
    (0.172, 1.745, 1.505, 0.108, 0.140, 2.0),
    (0.130, 1.781, 1.468, 0.154, 0.186, 2.1),
    (0.070, 1.797, 1.452, 0.176, 0.200, 2.2),
    (0.000, 1.798, 1.450, 0.181, 0.202, 2.3),
    (-0.070, 1.789, 1.460, 0.168, 0.186, 2.3),
    (-0.140, 1.773, 1.478, 0.145, 0.160, 2.4),
    (-0.200, 1.755, 1.496, 0.124, 0.130, 2.5),
    (-0.250, 1.738, 1.516, 0.113, 0.116, 2.5),
    (-0.290, 1.724, 1.538, 0.105, 0.104, 2.4),
    (-0.316, 1.708, 1.566, 0.097, 0.092, 2.3),
    (-0.328, 1.696, 1.596, 0.084, 0.078, 2.2),
    (-0.337, 1.684, 1.622, 0.066, 0.058, 2.1),
    (-0.342, 1.672, 1.644, 0.036, 0.030, 2.0),
    (-0.344, 1.662, 1.654, 0.012, 0.010, 2.0),
]
NOSE_TIP = v(0, 1.664, -.360)


def head_mass():
    """Big forms of the capybara head: lofted skull-to-muzzle, soft cheek masses and a small set-back chin."""
    loft = ZLoft(HEAD_STATIONS)
    chin = Ellipsoid((0, 1.516, -.262), (.052, .030, .056))
    # The bulbous nose the pad sits on: rounder and a little prouder than the loft's tip.
    nose = Ellipsoid((0, 1.662, -.304), (.090, .060, .050), R=rot(pitch=-.12))
    return Union([loft, chin, nose], k=.035, mat=M['fur'])


_EYES = {}


def eye_point(s):
    """Eye centre, seated half into the head surface high on the side, looking out and forward
    enough that both eyes read from the front."""
    if s not in _EYES:
        out = norm(side((.80, .16, -.58), s))
        surface = on_surface(head_mass(), side(EYE, s))[0]
        _EYES[s] = (surface - out * EYE_R * .45, out)
    return _EYES[s]


def eye_frame(s):
    """Columns: along the eye towards the nose, out of the head, up."""
    e, out = eye_point(s)
    fwd = v(0, -.12, -1); fwd = norm(fwd - out * float(fwd @ out))
    up = np.cross(fwd, out) * (1 if s > 0 else -1)
    if up[1] < 0:
        up = -up
    return np.stack([fwd, out, norm(up)], 1).astype(F)


def mouth_path(s):
    """The mouth line on one side: from the lip split under the philtrum back to the corner."""
    return [side(p, s) for p in ((0.0, 1.538, -.326), (.028, 1.536, -.318), (.054, 1.535, -.296), (.074, 1.538, -.270), (.084, 1.545, -.238))]


def nose_pad(snout):
    """The dark leathery rhinarium: a raised pad over the snout tip, wider at the top, split
    below by the philtrum, with the nostrils in its lower outer corners."""
    region = Union([Ellipsoid((0, 1.662, -.378), (.094, .064, .088)), Ellipsoid((0, 1.702, -.334), (.066, .022, .040))], k=.02)
    pad = Intersect(Offset(snout, .0016), region)
    nostrils = Union([Ellipsoid(side((.038, 1.646, -.350), s), (.014, .0065, .016), R=rot(pitch=-.35) @ rot(roll=s * .55)) for s in (-1, 1)])
    pad = Cut(pad, nostrils, k=.003)
    return Material(pad, M['nose']), nostrils


def head():
    """The long blunt capybara head: flat top line to a tall rounded muzzle, broad cheeks."""
    mass = head_mass()
    # Whisker pads: the broad soft upper lip either side of the philtrum, under the nose.
    lips = Union([Ellipsoid(side((.036, 1.584, -.296), s), (.058, .050, .044)) for s in (-1, 1)], k=.02)
    face = Union([mass, lips], k=.022, mat=M['fur'])
    pad, nostrils = nose_pad(face)
    face = Cut(face, nostrils, k=.004)
    # Philtrum and mouth: a groove down from the pad to the lip split, then back along each side.
    grooves = [RoundCone((0, 1.616, -.351), (0, 1.548, -.334), .0026, .0032)]
    for s in (-1, 1):
        path = mouth_path(s)
        grooves += [RoundCone(a, b, .0026, .0022) for a, b in zip(path[:-1], path[1:])]
    face = Cut(face, Union(grooves, k=.003), k=.003)
    for s in (-1, 1):
        e, out = eye_point(s)
        E = eye_frame(s)
        # The brow ridge runs forward over the eye into the top edge of the muzzle.
        brow = Union([Ellipsoid(e + E[:, 2] * .030 - out * .006 + E[:, 0] * .006, (.046, .016, .024), R=E),
                      Ellipsoid(e + E[:, 2] * .018 + E[:, 0] * .052 - out * .014, (.040, .012, .020), R=E)], k=.02)
        face = Union([face, brow], k=.022, mat=M['fur'])
        # An almond opening in a raised lid rim, the upper lid heavier; the eyeball shows through.
        rim = Ellipsoid(e + out * .004, (.035, .011, .022), R=E)
        upper = Ellipsoid(e + out * .006 + E[:, 2] * .014, (.036, .012, .011), R=E)
        face = Union([face, rim, upper], k=.007, mat=M['fur'])
        face = Cut(face, Ellipsoid(e + out * .013 - E[:, 2] * .002, (.029, .022, .016), R=E), k=.003)
    ears = []
    for s in (-1, 1):
        c = side(EAR, s)
        R = rot(yaw=s * .85) @ rot(roll=-s * .30) @ rot(pitch=-.15)
        shell = Ellipsoid(c + v(0, .004, 0), (.040, .042, .020), R=R, mat=M['fur'])
        cup = Ellipsoid(c + v(0, .004, 0) + (R @ v(0, .007, -.014)), (.029, .030, .013), R=R)
        ears.append(Cut(shell, cup, k=.004, edge_mat=M['ear_in']))
    return Union([Union([face] + ears, k=.014, mat=M['fur']), pad], k=.0015)


def forearm_profile():
    """paw_sculpt's forearm cross-sections (elbow .30 to wrist .60), resampled to our length."""
    pts, rx, rz = [], [], []
    for y, hx, hz in P.FOREARM:
        if y > P.WRIST or y < .30:
            continue
        t = (y - .30) / (P.WRIST - .30)
        g = 1.08 + (PAW_SCALE - 1.08) * t
        pts.append(t); rx.append(hx * g); rz.append(hz * g)
    return pts, rx, rz


def arm(s):
    sh, el, wr = side(SHOULDER, s), elbow(s), wrist(s)
    upper = Loft([sh + v(0, .03, 0), sh + (el - sh) * .5, el], [.088, .080, .066], [.084, .074, .062], side=(0, 0, 1), mat=M['fur'])
    ts, rx, rz = forearm_profile()
    pts = [el + (wr - el) * max(0.0, t) for t in ts]
    fore = Loft(pts, rx, rz, side=side((.8, .55, 0), s), mat=M['fur'])
    return upper, fore


def paw(s):
    """The v3 paw from paw_sculpt: its heel, pads, digits and tips as ellipsoids, fused like
    the metaball, plus blunt claws. Built in paw space, placed at the wrist."""
    parts = []
    wr0 = v(0, P.WRIST, 0)
    for kind, center, radius, k in P._elements():
        if k.get('tag') == 'fore':
            continue
        c = np.array(tuple(center), F) - wr0
        if kind == 'BALL':
            parts.append(Sphere(c, radius))
            continue
        size = v(*k['size'])
        if 'axis' in k:
            ax = norm(tuple(k['axis']))
            # Minimal rotation of +x onto the digit axis, like the metaball element.
            xr = v(1, 0, 0); cr = np.cross(xr, ax); sn = np.linalg.norm(cr); cs = float(xr @ ax)
            if sn < 1e-6:
                R = np.eye(3, dtype=F)
            else:
                kx = cr / sn; K = np.array([[0, -kx[2], kx[1]], [kx[2], 0, -kx[0]], [-kx[1], kx[0], 0]], F)
                R = (np.eye(3) + K * sn + K @ K * (1 - cs)).astype(F)
        else:
            R = np.eye(3, dtype=F)
        parts.append(Ellipsoid(c, size, R=R))
    body = Union(parts, k=.0045, mat=M['pad'])
    claws = []
    for finger in P.FINGERS:
        chain = P.POINTS[finger]; axis, sd, top = P.digit_frame(finger, 2)
        r = P.DIGITS[finger]['radii'][3]
        tip = np.array(tuple(chain[3]), F); ax = np.array(tuple(axis), F); tp = np.array(tuple(top), F)
        a = tip - ax * r * .9 + tp * r * .55
        b = tip + ax * r * .95 - tp * r * .35
        claws.append(RoundCone(a, b, r * .62, r * .22))
    nails = Material(Union(claws, k=.002), M['claw'])
    local = Union([body, nails], k=.0015)
    return Transform(local, wrist(s), paw_frame(s), PAW_SCALE)


def leg(s):
    hp, kn, an = side(HIP, s), side(KNEE, s), side(ANKLE, s)
    thigh = Loft([hp + v(0, .04, 0), hp, (hp + kn) * .5, kn], [.118, .118, .108, .090], [.122, .122, .110, .090], mat=M['fur'])
    shin = Loft([kn, (kn * .45 + an * .55), an + v(0, .02, 0)], [.094, .086, .086], [.096, .088, .092], side=(1, 0, .15), mat=M['fur'])
    return thigh, shin


def foot(s):
    """Broad furry foot on a dark sole, three thick toes with heavy dark claws."""
    k = FOOT_SCALE
    o = v(.132, 0, .030)
    fp = lambda x, y, z: side(o + v(x * k, y * k, (z - .030) * k), s)
    mass = Union([
        Ellipsoid(fp(0, .058, -.030), v(.072, .056, .108) * k),
        Ellipsoid(fp(0, .050, .045), v(.064, .050, .060) * k),
        Ellipsoid(fp(0, .085, .030), v(.074, .055, .070) * k),
    ], k=.03 * k, mat=M['fur'])
    toes, claws = [], []
    for i, dx in enumerate((-.038, 0, .038)):
        base = fp(dx, .042, -.095)
        tip = fp(dx * 1.15, .030, -.172 + abs(dx) * .35)
        toes.append(RoundCone(base, tip, .030 * k, .024 * k))
        cb = tip + v(0, .006, -.008) * k
        claws.append(RoundCone(cb, cb + v(side((dx * .25, 0, 0), 1)[0] * s, -.026, -.030) * k, .016 * k, .005 * k))
    sole = Intersect(Offset(Union([mass] + toes, k=.02), .002), Plane((0, .020, 0), (0, 1, 0)))
    return Union([mass, Union(toes, k=.01, mat=M['fur']), Material(sole, M['sole']), Material(Union(claws, k=.004), M['claw'])], k=.012)


# ------------------------------------------------------------------ clothes and gear
def body_parts():
    parts = {'torso': torso(), 'neck': neck(), 'head': head()}
    for s, n in ((-1, 'L'), (1, 'R')):
        parts['upper_' + n], parts['fore_' + n] = arm(s)
        parts['paw_' + n] = paw(s)
        parts['thigh_' + n], parts['shin_' + n] = leg(s)
        parts['foot_' + n] = foot(s)
    return parts


def shirt(parts):
    t = parts['torso']
    body = Intersect(Offset(Union([t, parts['neck']], k=.05), .010), slab(.86, 1.43))
    sleeves = []
    for s, n in ((-1, 'L'), (1, 'R')):
        sh, el = side(SHOULDER, s), elbow(s)
        ax = norm(el - sh)
        end = el + ax * .035
        sleeve = Intersect(Offset(Union([parts['upper_' + n], Intersect(t, Sphere(sh, .12))], k=.04), .016), Plane(end, ax))
        # The rolled cuff: two soft rolls below the elbow.
        roll = Union([Torus(end - ax * .012, .080, .020, R=frame(ax), squash=.9), Torus(end - ax * .040, .082, .018, R=frame(ax), squash=.9)], k=.012)
        sleeves.append(Union([sleeve, roll], k=.012))
    placket = RoundBox((0, 1.12, -.222), (.017, .20, .004), r=.003, R=rot(pitch=.06))
    buttons = []
    for y in (1.285, 1.195, 1.105, 1.015):
        c = on_surface(placket, v(0, y, -.24), .0015)[0]
        buttons.append(Ellipsoid(c, (.0075, .0075, .0026)))
    # The collar: a standing band around the neck under the scarf, its two points laid on the chest.
    band = Intersect(Offset(parts['neck'], .012), slab(1.355, 1.425))
    points = []
    for s in (-1, 1):
        a = on_surface(Offset(t, .012), side((.062, 1.372, -.150), s), .004)[0]
        tip = on_surface(Offset(t, .012), side((.056, 1.308, -.205), s), .004)[0]
        points.append(RoundCone(a, tip, .030, .006))
    collar = Union([band] + [Intersect(pt, Offset(t, .030)) for pt in points], k=.006)
    return (Material(Union([Displace(Union([body] + sleeves, k=.02), shirt_folds, .008), placket, collar], k=.004), M['shirt']),
            Material(Union(buttons), M['button']))


def _ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def shirt_folds(p):
    """Cloth folds: drape under the chest, blousing over the belt, rings and twisted
    compression folds along the sleeves (deepest at the elbow crook and the armpit)."""
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    ang = np.arctan2(x, -z)
    d = .0032 * np.sin(ang * 9 + np.sin(y * 13) * .9) * _ss(1.26, 1.06, y)
    d += .0045 * np.sin(y * 105 + np.sin(ang * 4) * 1.6) * _ss(1.03, .95, y)
    d += .0012 * np.sin(x * 60 + y * 30) * np.sin(z * 50 - y * 20)
    for s in (-1, 1):
        sh, el = side(SHOULDER, s), elbow(s)
        ax = norm(el - sh); q = p - sh
        t = q @ ax
        r = np.linalg.norm(q - t[:, None] * ax, axis=1)
        around = np.arctan2(q @ norm(np.cross(ax, v(0, 1, 0))), q[:, 1])
        near = _ss(.15, .10, r) * _ss(-.05, .03, t) * _ss(UPPER_ARM + .06, UPPER_ARM + .02, t)
        # Irregular folds: two wavelengths, twisted around the arm, their depth varying in patches.
        wob = S.value_noise(np.stack([t * 30, around * 1.5, np.full(len(t), s * 3.0, F)], 1).astype(F), 61)
        ring = .65 * np.sin(t * 118 + around * (.9 + .5 * s) + wob * 4) + .35 * np.sin(t * 205 - around * 1.4 + wob * 6)
        crook = (.35 + .65 * wob) * (.6 + .6 * _ss(.12, .24, t) + .5 * _ss(.06, 0, t))
        d += near * .0052 * ring * crook
    return d


def vest(parts):
    t = parts['torso']
    shell = Offset(t, .030)
    region = slab(.915, 1.415)
    body = Intersect(shell, region)
    for s in (-1, 1):
        body = Cut(body, Ellipsoid(side(SHOULDER, s) + side((.02, -.03, 0), s), (.086, .136, .112)), k=.018)
    opening = Field(lambda p: (np.abs(p[:, 0]) - (.030 + .075 * np.clip((p[:, 1] - .95) / .45, 0, 1) ** 1.4)) * np.where(p[:, 2] < -.05, 1, -1) + np.where(p[:, 2] < -.05, 0, 1),
                    (-.3, .8, -.4), (.3, 1.5, 0))
    body = Cut(body, opening, k=.004)
    pockets, studs = [], []
    for s in (-1, 1):
        c = side((.112, 1.105, -.215), s)
        pockets.append(RoundBox(c, (.042, .046, .006), r=.006, R=rot(yaw=s * .42) @ rot(pitch=.12)))
        pockets.append(RoundBox(c + v(0, .046, -.006), (.046, .014, .006), r=.005, R=rot(yaw=s * .42) @ rot(pitch=.2)))
        studs.append(Sphere(on_surface(pockets[-1], c + v(0, .040, -.030), .0012)[0], .0055))
    return Union([Material(body, M['denim']), Material(Union(pockets, k=.004), M['denim_pocket'])], k=.004), Material(Union(studs), M['brass'])


def trousers(parts):
    # Loose cargo legs: their own wide tubes over the thighs and knees, not a skin-tight shell.
    bags = []
    for s in (-1, 1):
        hp, kn, an = side(HIP, s), side(KNEE, s), side(ANKLE, s)
        cuff = an + (kn - an) * ((.30 - an[1]) / (kn[1] - an[1]))
        bags.append(Loft([hp + v(0, .06, 0), hp, (hp + kn) * .5, kn, cuff], [.140, .146, .142, .134, .124], [.140, .150, .146, .136, .126]))
    legs = Union(bags, k=.03)
    base = Union([Offset(Intersect(parts['torso'], Plane((0, 1.0, 0), (0, 1, 0))), .030), legs], k=.06)
    body = Intersect(base, slab(.300, .975))
    rolls, studs, pockets = [], [], []
    for s in (-1, 1):
        kn, an = side(KNEE, s), side(ANKLE, s)
        ax = norm(kn - an)
        c = an + (kn - an) * ((.318 - an[1]) / (kn[1] - an[1]))
        rolls.append(Torus(c, .122, .026, R=frame(ax), squash=.85))
        rolls.append(Torus(c + ax * .042, .126, .022, R=frame(ax), squash=.85))
        # Cargo pocket on the outer thigh with a flap.
        # Cargo pocket sewn on the outer thigh, with a flap: oriented to the cloth it sits on.
        pc = on_surface(base, side((.262, .56, -.050), s))[0]
        e = F(.003)
        g = np.array([S.evaluate(base, (pc + v(*o))[None], cull=False)[0][0] - S.evaluate(base, (pc - v(*o))[None], cull=False)[0][0] for o in ((e, 0, 0), (0, e, 0), (0, 0, e))], F)
        nrm = norm(g); up = norm(v(0, 1, 0) - nrm * float(nrm[1])); w = np.cross(up, nrm)
        R = np.stack([nrm, up, w], 1).astype(F)
        pockets.append(RoundBox(pc, (.002, .058, .050), r=.007, R=R))
        pockets.append(RoundBox(pc + nrm * .003 + up * .058, (.003, .015, .054), r=.006, R=R))
        studs.append(Sphere(pc + nrm * .0075 + up * .052, .0058))
    def folds(p):
        x, y, z = p[:, 0], p[:, 1], p[:, 2]
        knee = .0058 * np.sin(y * 72 + np.sin(x * 30) * 2 + z * 25) * np.clip(1 - np.abs(y - .44) / .13, 0, 1)
        drape = .0035 * np.sin(np.arctan2(np.abs(x) - .13, z) * 7 + y * 6) * _ss(.80, .62, y) * _ss(.30, .40, y)
        crotch = .004 * np.sin((np.abs(x) * 2 - y) * 80) * _ss(.10, 0, np.abs(x) - .02) * _ss(.60, .72, y) * _ss(.86, .76, y)
        return knee + drape + crotch + .0018 * np.sin(x * 40 + y * 35 + z * 20)
    cloth = Material(Union([Displace(body, folds, .008)] + rolls, k=.01), M['trouser'])
    return Union([cloth, Material(Union(pockets, k=.004), M['trouser_pocket'])], k=.006), Material(Union(studs), M['brass'])


def belt(parts):
    band = Intersect(Offset(parts['torso'], .036), slab(.905, .958))
    frame_ = RoundBox((0, .931, -.262), (.034, .027, .0055), r=.004)
    buckle = Cut(frame_, RoundBox((.004, .931, -.268), (.022, .016, .012), r=.003), k=.002)
    tongue = RoundBox((.006, .931, -.258), (.026, .020, .004), r=.003)
    loops = []
    pouches, flaps = [], []
    for s in (-1, 1):
        for yaw, x, z in ((.62, .160, -.212), (1.35, .238, -.035)):
            c = side((x, .872, z), s)
            R = rot(yaw=s * yaw)
            pouches.append(RoundBox(c, (.040, .050, .026), r=.012, R=R))
            flaps.append(RoundBox(c + (R @ v(0, .044, -.004)), (.044, .014, .028), r=.008, R=R))
            loops.append(Sphere(c + (R @ v(0, .040, -.034)), .006))
    leather = Union([Material(Union([band, tongue], k=.004), M['leather']), Material(Union(pouches), M['pouch']), Material(Union(flaps), M['pack_flap'])], k=.004)
    return leather, Material(Union([buckle] + loops), M['brass'])


def scarf():
    ring = Torus((0, 1.440, -.020), .128, .036, R=rot(pitch=-.30), squash=.80)
    knot = Union([Ellipsoid((0, 1.385, -.172), (.040, .034, .030)), Ellipsoid((-.032, 1.392, -.160), (.026, .022, .020)), Ellipsoid((.032, 1.392, -.160), (.026, .022, .020))], k=.01)
    tails = Union([Ellipsoid((-.024, 1.315, -.196), (.038, .078, .013), R=rot(roll=.35) @ rot(pitch=.20)),
                   Ellipsoid((.030, 1.305, -.190), (.034, .070, .012), R=rot(roll=-.30) @ rot(pitch=.18))], k=.01)
    folds = lambda p: .003 * np.sin(np.arctan2(p[:, 0], p[:, 2] + .03) * 11 + p[:, 1] * 30)
    return Material(Union([Displace(ring, folds, .004), knot, tails], k=.012), M['scarf'])


def hip_cloth():
    """The coral rag tucked in the belt on the right hip (the team colour, low on the body)."""
    def fn(p):
        q = p - v(.272, .78, -.060)
        # A hanging sheet following the hip, wavy, tapering to a ragged point.
        u, y = q[:, 2], q[:, 1]
        width = .085 * np.clip((y + .30) / .42, 0, 1) ** .6 + .008
        bulge = .02 * (1 - ((y - .05) / .15) ** 2).clip(0, 1) - .03 * u ** 2 / .006
        sheet = np.abs(q[:, 0] - .010 * np.sin(u * 60 + y * 20) - bulge) - .0055
        edge = np.maximum(np.abs(u + .005 * np.sin(y * 50)) - width, np.maximum(y - .125, -.29 - y + np.abs(u) * .9))
        return np.maximum(sheet, edge)
    return Material(Field(fn, (.23, .46, -.17), (.32, .92, .05)), M['hipcloth'])


def backpack(parts):
    bag = RoundBox((0, 1.095, .240), (.132, .180, .046), r=.034, R=rot(pitch=-.05))
    flap = RoundBox((0, 1.225, .258), (.134, .066, .040), r=.030, R=rot(pitch=-.05))
    pocket = RoundBox((0, 1.040, .290), (.090, .070, .014), r=.012)
    sides = Union([RoundBox(side((.166, 1.080, .222), s), (.014, .078, .032), r=.012) for s in (-1, 1)])
    roll = RoundCone((-.175, 1.362, .222), (.175, 1.362, .222), .054, .054)
    roll_bands = Union([Torus(side((.100, 1.362, .222), s), .054, .006, R=rot(roll=math.pi / 2)) for s in (-1, 1)])
    # The pack stays inside the body hit cylinder (r .335 m), like everything but the arms.
    inside = Field(lambda p: np.hypot(p[:, 0], p[:, 2]) - .338, (-.4, .8, -.4), (.4, 1.5, .4))
    pack = Intersect(Union([Material(Union([bag, sides], k=.012), M['pack']), Material(flap, M['pack_flap']), Material(pocket, M['pouch'])], k=.012), inside)
    canvas = Material(Intersect(roll, inside), M['canvas'])
    # Shoulder straps over the vest, from the pack over the shoulders down the front.
    vest_surface = Offset(parts['torso'], .030)
    straps = []
    for s in (-1, 1):
        path = [side(p, s) for p in ((.090, 1.300, .185), (.118, 1.405, .080), (.128, 1.405, -.060), (.132, 1.300, -.175), (.140, 1.150, -.218), (.150, 1.000, -.232))]
        path = on_surface(vest_surface, np.array(path, F), .006)
        straps.append(Loft(path, [.020] * len(path), [.0055] * len(path), side=(1, 0, 0)))
    # Strap buckles sit on the strap (a thin plate would decimate into slivers): chunky, rounded.
    buckles = [RoundBox(on_surface(vest_surface, side((.134, 1.26, -.21), s), .011)[0], (.014, .011, .002), r=.0045, R=rot(yaw=s * .30)) for s in (-1, 1)]
    return pack, canvas, Material(Union(straps + [roll_bands], k=.003), M['strap']), Material(Union(buckles), M['brass'])


def build():
    parts = body_parts()
    skin = Union([parts['torso'], parts['neck'], parts['head']], k=.06, mat=M['fur'])
    limbs = []
    for n in 'LR':
        limbs.append(Union([parts['upper_' + n], parts['fore_' + n]], k=.03, mat=M['fur']))
        limbs.append(Union([parts['fore_' + n], parts['paw_' + n]], k=.008))
        limbs.append(Union([parts['thigh_' + n], parts['shin_' + n], parts['foot_' + n]], k=.03, mat=M['fur']))
    body = Union([skin] + limbs, k=.03)
    leather, brass = belt(parts)
    pack, canvas, straps, strap_brass = backpack(parts)
    shirt_cloth, buttons = shirt(parts)
    denim, vest_studs = vest(parts)
    cargo, cargo_studs = trousers(parts)
    # A small fillet where the vest meets the shirt: no slit between the armhole and the sleeve
    # for the decimated game mesh to bridge with sliver triangles.
    garments = Union([shirt_cloth, denim], k=.008)
    gear = [garments, buttons, vest_studs, cargo, cargo_studs, leather, brass, scarf(), hip_cloth(), pack, canvas, straps, strap_brass]
    # Nothing below the contact plane: the soles sit on the ground.
    return Intersect(Union([body] + gear, k=0.0), Plane((0, .0015, 0), (0, -1, 0))), parts


def eyes():
    return Union([Material(Sphere(eye_point(s)[0], EYE_R), M['eye']) for s in (-1, 1)])


EYE_R = .024


BOUNDS = (v(-.60, -.01, -.62), v(.60, 1.90, .40))
