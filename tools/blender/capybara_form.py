"""Última Capivara player character v6: the sculpted form as signed distance fields.

Game space (metres, x = the character's right, y up, facing -z, feet on y = 0). The outer
surface (fur, cloth and gear) is one union, so the game mesh is watertight and nothing can
poke through a garment. Every part names a material; parts of the body also name the bone
chain they belong to (weights come from the nearest part, see capybara_v6.py).

Proportions follow docs/art/character-benchmark/character-design.jpg: broad round shoulders
and a round belly, thick arms carried out from the body with big leathery four-digit paws
(capy_hand.py), two separate thick legs in a wide stance with the toes turned out, a long deep
head on a furry neck. Only the head is bound to the gameplay hit shape (the head sphere).
"""
import math
import numpy as np
import capy_sdf as S
from capy_sdf import ZLoft, Ellipsoid, RoundBox, RoundCone, Sphere, Torus, Plane, Loft, Union, Cut, Intersect, Offset, Displace, Transform, Material, Field, rot, frame

import capy_hand as H

F = np.float32
MATERIALS = ['fur', 'muzzle', 'nose', 'pad', 'claw', 'shirt', 'denim', 'scarf', 'leather', 'pack', 'canvas',
             'trouser', 'brass', 'eye', 'ear_in', 'hipcloth', 'lip', 'button', 'strap', 'sole',
             # Sewn-on pieces paint like their cloth; their own ids give the painter their seams.
             'denim_pocket', 'trouser_pocket', 'pouch', 'pack_flap', 'collar', 'denim_collar', 'cuff', 'trouser_cuff']
M = {name: i for i, name in enumerate(MATERIALS)}
# The team colour: the bandana (high, by the face), the hip rag (low, on the moving silhouette)
# and the rolled blanket on the pack (a large block seen from behind and the sides at distance).
TEAM = ('scarf', 'hipcloth', 'canvas')


def v(*a):
    return np.array(a, F)


def norm(a):
    a = np.asarray(a, F); return a / np.linalg.norm(a)


# ------------------------------------------------------------------ skeleton (bind pose)
SHOULDER = v(.290, 1.275, .010)
UPPER_ARM, FOREARM_LEN = .300, .260
# Bind pose between the hanging rest and the gun hold, so both deform moderately: the upper
# arm out, forward and down, the forearm reaching in front of the belly.
ARM_DIR = norm((.36, -.74, -.40))
FORE_DIR = norm((-.12, -.38, -.92))
# Soft knees over a wide stance: the legs splay from the hips and the toes turn out.
HIP = v(.165, .760, .010)
KNEE = v(.225, .450, -.050)
ANKLE = v(.285, .115, .020)
TOE_OUT = .21
EYE = v(.122, 1.712, -.150)
EAR = v(.136, 1.776, .030)
FOOT_SCALE = 1.3
NECK_BASE = v(0, 1.370, .000)
# Where the mouth line turns up at its corner (the smile and frown bones pivot there).
MOUTH_CORNER = v(.054, 1.545, -.282)
HEAD_PIVOT = v(0, 1.520, -.010)


def side(p, s):
    """Mirror a right-side point (x > 0) to side s (+1 right, -1 left)."""
    q = np.array(p, F); q[0] *= s; return q


def elbow(s):
    return side(SHOULDER + ARM_DIR * UPPER_ARM, s)


def wrist(s):
    return side(SHOULDER + ARM_DIR * UPPER_ARM + FORE_DIR * FOREARM_LEN, s)


def paw_frame(s):
    """Paw space (digits +y, back of paw +z, index -x for the right paw) to game space.

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


def foot_frame(s):
    """Foot space (toes -z, up +y) to game space: turned out about the ankle."""
    return rot(yaw=-s * TOE_OUT)


def foot_point(s, x, y, z):
    """A point given in the right foot's own frame (origin under the ankle, toes toward -z)."""
    o = side(v(ANKLE[0], 0, ANKLE[2]), s)
    return o + foot_frame(s) @ v(x * s, y, z)


def toe_hinge(s):
    return foot_point(s, 0, .045, -.105)


def foot_contact(s):
    """The sole under the toe hinge: the point a planted foot keeps on the ground."""
    return foot_point(s, 0, .0015, -.105)


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
    # The nose leather and the front of the muzzle: a twitch.
    b['nose'] = (v(0, 1.655, -.300), v(0, 1.700, -.300), 'head')
    b['tail'] = (v(0, .72, .20), v(0, .70, .26), 'spine')
    b['pack'] = (v(0, 1.02, .24), v(0, 1.36, .25), 'chest')
    # Leaf bone for breathing and jiggle: scaling it moves no other bone.
    b['belly'] = (v(0, .960, -.060), v(0, 1.060, -.080), 'spine')
    b['hipcloth'] = (RAG_TOP, RAG_TOP + v(.02, -.27, 0), 'spine')
    # Bandana tails and the rolled blanket lag behind the body (runtime springs).
    b['scarf_L'] = (v(-.018, 1.345, -.214), v(-.060, 1.215, -.232), 'chest')
    b['scarf_R'] = (v(.018, 1.345, -.214), v(.048, 1.240, -.232), 'chest')
    b['bedroll'] = (v(0, 1.372, .262), v(0, 1.44, .262), 'pack')
    for s, n in ((-1, 'L'), (1, 'R')):
        eye = eye_point(s)[0]
        b['ear_' + n] = (side(EAR + v(-.004, -.030, .000), s), side(EAR + v(.006, .044, .000), s), 'head')
        for part in ('socket', 'blink'):
            b[f'{part}_{n}'] = (eye, eye + v(0, .044, 0), 'head')
        for part in ('tip', 'peak'):
            b[f'blink_{part}_{n}'] = (eye, eye + v(0, .044, 0), 'blink_' + n)
        b['glint_' + n] = (eye + side(v(.006, .008, -.012), s), eye + side(v(.006, .05, -.012), s), 'blink_' + n)
        b['brow_' + n] = (eye + side(v(-.004, .034, -.004), s), eye + side(v(-.004, .064, -.004), s), 'head')
        b['mouth_' + n] = (side(MOUTH_CORNER, s), side(MOUTH_CORNER + v(0, .030, 0), s), 'mouth_cavity')
        b['thigh_' + n] = (side(HIP, s), side(KNEE, s), 'root')
        b['shin_' + n] = (side(KNEE, s), side(ANKLE, s), 'thigh_' + n)
        b['foot_' + n] = (side(ANKLE, s), toe_hinge(s), 'shin_' + n)
        b['toes_' + n] = (toe_hinge(s), foot_point(s, 0, .040, -.180), 'foot_' + n)
        b['arm_' + n] = (side(SHOULDER, s), elbow(s), 'chest')
        b['forearm_' + n] = (elbow(s), wrist(s), 'arm_' + n)
        b['forearm_twist_' + n] = (elbow(s), wrist(s), 'forearm_' + n)
        Mr, w = paw_frame(s), wrist(s)
        b['paw_' + n] = (w, w + Mr @ v(0, .110, 0), 'forearm_twist_' + n)
        for name, (a, c, parent) in H.digit_bones().items():
            b[f'paw_{name}_{n}'] = (w + Mr @ a, w + Mr @ c, 'paw_' + n if parent == 'hand' else f'paw_{parent}_{n}')
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


def surface_frame(node, p):
    """Columns: surface normal, up along the surface, across it (for sewn-on patches)."""
    e = F(.003)
    g = np.array([S.evaluate(node, (p + v(*o))[None], cull=False)[0][0] - S.evaluate(node, (p - v(*o))[None], cull=False)[0][0] for o in ((e, 0, 0), (0, e, 0), (0, 0, e))], F)
    n = norm(g); up = norm(v(0, 1, 0) - n * float(n[1])); w = np.cross(up, n)
    return np.stack([n, up, w], 1).astype(F)


def slab(y0, y1):
    return Intersect(Plane((0, y1, 0), (0, 1, 0)), Plane((0, y0, 0), (0, -1, 0)))


def _ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ body
def torso():
    return Union([
        Ellipsoid((0, .835, .030), (.262, .170, .205)),
        Ellipsoid((0, 1.000, -.030), (.272, .205, .238)),
        Ellipsoid((0, 1.185, -.002), (.268, .168, .205)),
        Ellipsoid((0, 1.275, .012), (.290, .090, .172)),
        Ellipsoid((0, 1.362, .020), (.190, .072, .135)),
    ], k=.07, mat=M['fur'])


def neck():
    """A thick furry neck: the cheeks and throat run down into it without a step."""
    return Union([Ellipsoid((0, 1.425, .000), (.158, .110, .150)), Ellipsoid((0, 1.492, -.018), (.170, .078, .158))], k=.05, mat=M['fur'])


# Head profile stations: (z, top, bottom, half-width at the crown, half-width at the jaw, exponent).
# A long flat-topped skull on full cheeks, a deep muzzle that narrows a little and a blunt front
# whose nose leans forward over a receding upper lip (the loft ends in a small rounded tip).
HEAD_STATIONS = [
    (0.195, 1.684, 1.585, 0.040, 0.060, 2.0),
    (0.172, 1.738, 1.505, 0.100, 0.140, 2.0),
    (0.130, 1.772, 1.468, 0.140, 0.190, 2.0),
    (0.070, 1.786, 1.450, 0.158, 0.208, 2.05),
    (0.000, 1.787, 1.448, 0.163, 0.212, 2.1),
    (-0.070, 1.781, 1.456, 0.160, 0.202, 2.15),
    (-0.130, 1.770, 1.470, 0.150, 0.176, 2.25),
    (-0.185, 1.756, 1.486, 0.118, 0.142, 2.4),
    (-0.250, 1.736, 1.508, 0.108, 0.120, 2.5),
    (-0.290, 1.722, 1.530, 0.102, 0.108, 2.4),
    (-0.316, 1.708, 1.560, 0.095, 0.096, 2.3),
    (-0.328, 1.696, 1.592, 0.083, 0.081, 2.2),
    (-0.337, 1.684, 1.620, 0.066, 0.060, 2.1),
    (-0.342, 1.672, 1.644, 0.036, 0.030, 2.0),
    (-0.344, 1.662, 1.654, 0.012, 0.010, 2.0),
]
NOSE_TIP = v(0, 1.664, -.360)


def head_mass():
    """Big forms of the capybara head: lofted skull-to-muzzle, full cheeks and a small set-back chin."""
    loft = ZLoft(HEAD_STATIONS)
    chin = Ellipsoid((0, 1.527, -.258), (.050, .030, .052))
    # The blunt end of the muzzle, a little prouder and rounder than the loft's tip.
    nose = Ellipsoid((0, 1.660, -.302), (.084, .060, .050), R=rot(pitch=-.12))
    return Union([loft, chin, nose], k=.04, mat=M['fur'])


_EYES = {}


def eye_point(s):
    """Eye centre, seated in the head surface high on the side and turned forward, so both eyes
    read in a level front view."""
    if s not in _EYES:
        out = norm(side((.62, .14, -.77), s))
        surface = on_surface(head_mass(), side(EYE, s))[0]
        _EYES[s] = (surface - out * EYE_R * .34, out)
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
    return [side(p, s) for p in ((0.0, 1.542, -.328), (.018, 1.538, -.323), (.036, 1.538, -.308), (.050, 1.542, -.290), (.058, 1.549, -.272))]


def whisker_roots(s):
    """Where the whiskers leave the whisker pad (three rows), on the head surface."""
    pts = []
    for row, (y, zs) in enumerate(((1.612, (-.300, -.280, -.258)), (1.594, (-.306, -.286, -.264, -.242)), (1.576, (-.300, -.280, -.258)))):
        for z in zs:
            pts.append((s * (.052 + (-.306 - z) * -.62 + row * .003), y, z))
    return on_surface(head(), np.array(pts, F))


def nose_pad(snout):
    """The dark leather of the nose: a modest pad at the upper front of the muzzle with the
    nostrils in it, and a narrow strip running down the philtrum to the mouth (a T)."""
    bar = Union([Ellipsoid((0, 1.668, -.372), (.060, .040, .066)), Ellipsoid((0, 1.700, -.336), (.044, .016, .030))], k=.012)
    strip = Ellipsoid((0, 1.622, -.372), (.016, .042, .066))
    region = Union([bar, strip], k=.016)
    pad = Intersect(Offset(snout, .0014), region)
    nostrils = Union([Ellipsoid(side((.030, 1.660, -.350), s), (.0125, .0066, .014), R=rot(pitch=-.35) @ rot(roll=s * .50)) for s in (-1, 1)])
    pad = Cut(pad, nostrils, k=.003)
    return Material(pad, M['nose']), nostrils


def head():
    """The long blunt capybara head: flat top line to a deep rounded muzzle, full cheeks."""
    mass = head_mass()
    # Whisker pads: the broad soft upper lip either side of the philtrum, under the nose.
    lips = Union([Ellipsoid(side((.042, 1.588, -.288), s), (.066, .056, .052)) for s in (-1, 1)], k=.025)
    face = Union([mass, lips], k=.030, mat=M['fur'])
    pad, nostrils = nose_pad(face)
    face = Cut(face, nostrils, k=.004)
    # Philtrum and mouth: a groove down from the pad to the lip split, then back along each side.
    grooves = [RoundCone((0, 1.616, -.351), (0, 1.548, -.334), .0022, .0030)]
    for s in (-1, 1):
        path = mouth_path(s)
        grooves += [RoundCone(a, b, .0020, .0015) for a, b in zip(path[:-1], path[1:])]
    face = Cut(face, Union(grooves, k=.003), k=.004)
    for s in (-1, 1):
        e, out = eye_point(s)
        E = eye_frame(s)
        # The brow ridge runs forward over the eye into the top edge of the muzzle.
        brow = Union([Ellipsoid(e + E[:, 2] * .034 - out * .008 + E[:, 0] * .006, (.052, .018, .026), R=E),
                      Ellipsoid(e + E[:, 2] * .020 + E[:, 0] * .058 - out * .016, (.044, .013, .022), R=E)], k=.02)
        face = Union([face, brow], k=.022, mat=M['fur'])
        # An almond opening in a raised lid rim, the upper lid heavier; the eyeball shows through.
        rim = Ellipsoid(e + out * .004, (.044, .012, .029), R=E)
        upper = Ellipsoid(e + out * .006 + E[:, 2] * .019, (.045, .013, .012), R=E)
        face = Union([face, rim, upper], k=.007, mat=M['fur'])
        face = Cut(face, Ellipsoid(e + out * .014 - E[:, 2] * .002, (.037, .027, .0225), R=E), k=.003)
    ears = []
    for s in (-1, 1):
        # Upright cupped ears, dark leather inside and out, standing clear of the crown.
        c = side(EAR, s)
        R = rot(yaw=s * .38) @ rot(roll=-s * .38) @ rot(pitch=-.10)
        shell = Ellipsoid(c, (.040, .052, .021), R=R, mat=M['ear_in'])
        cup = Ellipsoid(c + (R @ v(0, .008, -.019)), (.030, .040, .017), R=R)
        ears.append(Material(Cut(shell, cup, k=.004), M['ear_in']))
    return Union([Union([face] + ears, k=.010, mat=M['fur']), pad], k=.0015)


def arm(s):
    sh, el, wr = side(SHOULDER, s), elbow(s), wrist(s)
    # A round shoulder cap and a heavy upper arm.
    upper = Loft([sh + v(0, .015, 0), sh + (el - sh) * .5, el], [.096, .096, .086], [.094, .092, .082], side=(0, 0, 1), mat=M['fur'])
    # A thick forearm, widest below the elbow, tapering to a broad wrist.
    out = side((.8, .55, 0), s)
    fore = Loft([el, el + (wr - el) * .30, el + (wr - el) * .70, wr], [.086, .088, .076, .064], [.080, .080, .066, .052], side=out, mat=M['fur'])
    return upper, fore


def paw(s):
    """The big leathery paw (capy_hand.py), placed at the wrist."""
    return Transform(H.build(M['fur'], M['claw']), wrist(s), paw_frame(s), 1.0)


def leg(s):
    hp, kn, an = side(HIP, s), side(KNEE, s), side(ANKLE, s)
    thigh = Loft([hp + v(0, .04, 0), hp, (hp + kn) * .5, kn], [.138, .138, .124, .104], [.142, .142, .128, .106], mat=M['fur'])
    shin = Loft([kn, (kn * .45 + an * .55), an + v(0, .02, 0)], [.106, .098, .094], [.108, .100, .100], side=(1, 0, .15), mat=M['fur'])
    return thigh, shin


def foot(s):
    """Broad furry foot on a dark sole, three thick toes with heavy dark claws, turned out."""
    k = FOOT_SCALE
    fp = lambda x, y, z: foot_point(s, x * k, y * k, (z - .030) * k)
    Rf = foot_frame(s)
    mass = Union([
        Ellipsoid(fp(0, .058, -.030), v(.072, .056, .108) * k, R=Rf),
        Ellipsoid(fp(0, .050, .045), v(.064, .050, .060) * k, R=Rf),
        Ellipsoid(fp(0, .085, .030), v(.074, .055, .070) * k, R=Rf),
    ], k=.03 * k, mat=M['fur'])
    toes, claws = [], []
    for i, dx in enumerate((-.038, 0, .038)):
        base = fp(dx, .042, -.095)
        tip = fp(dx * 1.15, .030, -.172 + abs(dx) * .35)
        toes.append(RoundCone(base, tip, .030 * k, .024 * k))
        cb = fp(dx * 1.15, .036, -.180 + abs(dx) * .35)
        claws.append(RoundCone(cb, fp(dx * 1.40, .010, -.210 + abs(dx) * .35), .016 * k, .005 * k))
    sole = Intersect(Offset(Union([mass] + toes, k=.02), .002), Plane((0, .020, 0), (0, 1, 0)))
    return Union([mass, Union(toes, k=.01, mat=M['fur']), Material(sole, M['sole']), Material(Union(claws, k=.004), M['claw'])], k=.012)


def body_parts():
    parts = {'torso': torso(), 'neck': neck(), 'head': head()}
    for s, n in ((-1, 'L'), (1, 'R')):
        parts['upper_' + n], parts['fore_' + n] = arm(s)
        parts['paw_' + n] = paw(s)
        parts['thigh_' + n], parts['shin_' + n] = leg(s)
        parts['foot_' + n] = foot(s)
    return parts


# ------------------------------------------------------------------ clothes and gear
def shirt_folds(p):
    """Cloth folds: drape under the chest, blousing over the belt, irregular twisted
    compression folds along the sleeves (deepest at the elbow crook and the armpit)."""
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    ang = np.arctan2(x, -z)
    d = .0032 * np.sin(ang * 9 + np.sin(y * 13) * .9) * _ss(1.26, 1.06, y)
    d += .0050 * np.sin(y * 100 + np.sin(ang * 4) * 1.6) * _ss(1.04, .96, y)
    d += .0012 * np.sin(x * 60 + y * 30) * np.sin(z * 50 - y * 20)
    for s in (-1, 1):
        sh, el = side(SHOULDER, s), elbow(s)
        ax = norm(el - sh); q = p - sh
        t = q @ ax
        r = np.linalg.norm(q - t[:, None] * ax, axis=1)
        around = np.arctan2(q @ norm(np.cross(ax, v(0, 1, 0))), q[:, 1])
        near = _ss(.19, .13, r) * _ss(-.05, .03, t) * _ss(UPPER_ARM + .06, UPPER_ARM + .02, t)
        wob = S.value_noise(np.stack([t * 26, around * 1.5, np.full(len(t), s * 3.0, F)], 1).astype(F), 61)
        ring = .65 * np.sin(t * 96 + around * (.9 + .5 * s) + wob * 4) + .35 * np.sin(t * 170 - around * 1.4 + wob * 6)
        crook = (.35 + .65 * wob) * (.6 + .6 * _ss(.14, .27, t) + .5 * _ss(.06, 0, t))
        d += near * .0065 * ring * crook
    return d


def shirt(parts):
    t = parts['torso']
    body = Intersect(Offset(Union([t, parts['neck']], k=.05), .010), slab(.86, 1.415))
    sleeves, cuffs = [], []
    for s, n in ((-1, 'L'), (1, 'R')):
        sh, el = side(SHOULDER, s), elbow(s)
        ax = norm(el - sh)
        end = el + ax * .030
        sleeve = Intersect(Offset(Union([parts['upper_' + n], Intersect(t, Sphere(sh, .14))], k=.05), .020), Plane(end, ax))
        sleeves.append(sleeve)
        # The rolled sleeve: a flat cuff band folded back over two soft rolls below the elbow.
        cuffs.append(Union([Torus(end - ax * .010, .100, .024, R=frame(ax), squash=1.35), Torus(end - ax * .046, .103, .017, R=frame(ax), squash=1.2)], k=.010))
    placket = RoundBox(on_surface(Offset(t, .010), v(0, 1.12, -.30))[0], (.018, .20, .004), r=.003, R=rot(pitch=.06))
    buttons = []
    for y in (1.270, 1.185, 1.100, 1.015):
        c = on_surface(Union([Offset(t, .010), placket]), v(0, y, -.32), .0016)[0]
        buttons.append(Ellipsoid(c, (.0085, .0085, .0028)))
    cloth = Material(Union([Displace(Union([body] + sleeves, k=.02), shirt_folds, .010), placket], k=.004), M['shirt'])
    return cloth, Material(Union(cuffs), M['cuff']), Material(Union(buttons), M['button'])


def shirt_collar():
    """The open shirt collar: a band standing around the back of the neck outside the bandana,
    its two leaves folded down and out onto the chest."""
    ring = Torus((0, 1.405, .012), .176, .030, R=rot(pitch=-.22), squash=.95)
    back = Intersect(ring, Plane((0, 0, -.115), (0, 0, -1)))
    leaves = []
    for s in (-1, 1):
        a, b, c = side((.150, 1.402, -.085), s), side((.118, 1.352, -.178), s), side((.092, 1.292, -.226), s)
        leaves.append(Loft([a, b, c], [.040, .044, .014], [.011, .010, .007], side=side((.75, .0, -.66), s)))
    return Material(Union([back] + leaves, k=.010), M['collar'])


def vest(parts):
    t = parts['torso']
    shell = Offset(t, .030)
    body = Intersect(shell, slab(.990, 1.415))
    for s in (-1, 1):
        body = Cut(body, Ellipsoid(side(SHOULDER, s) + side((.015, -.035, 0), s), (.112, .160, .140)), k=.018)
    opening = Field(lambda p: (np.abs(p[:, 0]) - (.036 + .085 * np.clip((p[:, 1] - .95) / .45, 0, 1) ** 1.4)) * np.where(p[:, 2] < -.05, 1, -1) + np.where(p[:, 2] < -.05, 0, 1),
                    (-.35, .8, -.45), (.35, 1.5, 0))
    body = Cut(body, opening, k=.004)
    pockets, flaps, studs = [], [], []
    for s in (-1, 1):
        c = on_surface(shell, side((.150, 1.105, -.30), s), .004)[0]
        R = surface_frame(shell, c)
        pockets.append(RoundBox(c, (.006, .050, .052), r=.006, R=R))
        top = c + R[:, 1] * .052 + R[:, 0] * .005
        flaps.append(RoundBox(top, (.006, .017, .056), r=.005, R=R))
        studs.append(Sphere(top + R[:, 0] * .010 - R[:, 1] * .004, .0065))
    # A folded denim collar along the neckline and lapels down the opening.
    collar = []
    ring = Intersect(Torus((0, 1.392, .022), .208, .022, R=rot(pitch=-.20), squash=.8), Plane((0, 0, -.06), (0, 0, -1)))
    collar.append(ring)
    for s in (-1, 1):
        pts = on_surface(shell, np.array([side(p, s) for p in ((.178, 1.395, -.060), (.135, 1.330, -.170), (.100, 1.225, -.235))], F), .004)
        collar.append(Loft(pts, [.030, .034, .012], [.009, .008, .006], side=side((.8, 0, -.6), s)))
    # The D-ring on the back yoke, on a leather tab.
    tab = RoundBox(on_surface(shell, v(0, 1.285, .30), .003)[0], (.018, .030, .004), r=.003)
    ring_c = on_surface(shell, v(0, 1.250, .30), .010)[0]
    dring = Torus(ring_c, .026, .0055, R=rot(pitch=math.pi / 2 - .12))
    denim = Union([Material(body, M['denim']), Material(Union(pockets + flaps, k=.003), M['denim_pocket']), Material(Union(collar, k=.008), M['denim_collar'])], k=.004)
    return denim, Material(Union(studs + [dring]), M['brass']), Material(tab, M['strap'])


def trousers(parts):
    """Cargo trousers: two separate loose legs from the crotch down, rolled at the calf."""
    bags = []
    for s in (-1, 1):
        hp, kn, an = side(HIP, s), side(KNEE, s), side(ANKLE, s)
        cuff = an + (kn - an) * ((.300 - an[1]) / (kn[1] - an[1]))
        bags.append(Loft([hp + v(0, .08, 0), hp, (hp + kn) * .5, kn, cuff], [.150, .160, .156, .146, .136], [.150, .162, .158, .148, .138]))
    seat = Offset(Intersect(parts['torso'], Plane((0, 1.0, 0), (0, 1, 0))), .030)
    base = Union([seat, Union(bags)], k=.035)
    body = Intersect(base, slab(.300, .972))
    rolls, studs, pockets = [], [], []
    for s in (-1, 1):
        kn, an = side(KNEE, s), side(ANKLE, s)
        ax = norm(kn - an)
        c = an + (kn - an) * ((.318 - an[1]) / (kn[1] - an[1]))
        rolls.append(Torus(c, .134, .028, R=frame(ax), squash=1.25))
        rolls.append(Torus(c + ax * .046, .138, .020, R=frame(ax), squash=1.2))
        # Cargo pocket sewn on the outer thigh, with a flap and a stud.
        pc = on_surface(base, side((.36, .555, -.030), s))[0]
        R = surface_frame(base, pc)
        pockets.append(RoundBox(pc, (.005, .064, .056), r=.008, R=R))
        pockets.append(RoundBox(pc + R[:, 0] * .004 + R[:, 1] * .064, (.005, .018, .060), r=.006, R=R))
        studs.append(Sphere(pc + R[:, 0] * .011 + R[:, 1] * .058, .0065))
        # Back pocket on the seat.
        bp = on_surface(base, side((.125, .800, .30), s))[0]
        R = surface_frame(base, bp)
        pockets.append(RoundBox(bp, (.0035, .050, .046), r=.006, R=R))
    # Fly: a stitched flap down the front from the waistband.
    fc = on_surface(base, v(.012, .800, -.40))[0]
    pockets.append(RoundBox(fc, (.011, .085, .004), r=.003, R=rot(pitch=-.10)))

    def folds(p):
        x, y, z = p[:, 0], p[:, 1], p[:, 2]
        lx = np.abs(x) - (HIP[0] + (KNEE[0] - HIP[0]) * np.clip((HIP[1] - y) / (HIP[1] - KNEE[1]), 0, 1.4))
        around = np.arctan2(lx, z)
        knee = .0062 * np.sin(y * 66 + np.sin(around * 3) * 1.6 + z * 18) * np.clip(1 - np.abs(y - .455) / .14, 0, 1)
        drape = .0040 * np.sin(around * 5 + y * 7) * _ss(.80, .62, y) * _ss(.30, .42, y)
        crotch = .0050 * np.sin((np.abs(x) * 1.6 - y) * 70) * _ss(.16, .02, np.abs(x)) * _ss(.58, .70, y) * _ss(.88, .78, y) * (z < .05)
        seat_f = .0040 * np.sin((np.abs(x) * .8 + y) * 60) * _ss(.60, .72, y) * _ss(.90, .80, y) * (z > .08)
        return knee + drape + crotch + seat_f + .0016 * np.sin(x * 40 + y * 35 + z * 20)
    cloth = Material(Displace(body, folds, .010), M['trouser'])
    return (Union([cloth, Material(Union(rolls, k=.010), M['trouser_cuff']), Material(Union(pockets, k=.003), M['trouser_pocket'])], k=.006),
            Material(Union(studs), M['brass']))


def belt(parts):
    shell = Offset(parts['torso'], .038)
    band = Intersect(shell, slab(.905, .960))
    bc = on_surface(shell, v(0, .932, -.40), .002)[0]
    frame_ = RoundBox(bc, (.038, .031, .0055), r=.004)
    buckle = Cut(frame_, RoundBox(bc + v(.004, 0, -.006), (.025, .019, .012), r=.003), k=.002)
    prong = RoundCone(bc + v(-.030, 0, -.006), bc + v(.020, 0, -.008), .0035, .003)
    tongue = RoundBox(bc + v(.008, 0, .004), (.030, .023, .004), r=.003)
    loops, studs, pouches, flaps = [], [], [], []
    for s in (-1, 1):
        for x, z in ((.105, -.38), (.235, .10)):
            c = on_surface(shell, side((x, .932, z), s), .003)[0]
            R = surface_frame(shell, c)
            loops.append(RoundBox(c, (.004, .036, .011), r=.003, R=R))
        # One pouch on each hip, toward the front, with a flap and a stud.
        c = on_surface(shell, side((.215, .870, -.26), s), .020)[0]
        R = surface_frame(shell, c)
        pouches.append(RoundBox(c, (.030, .060, .052), r=.016, R=R))
        top = c + R[:, 1] * .040 + R[:, 0] * .004
        flaps.append(RoundBox(top, (.034, .030, .056), r=.014, R=R))
        studs.append(Sphere(top + R[:, 0] * .036 - R[:, 1] * .012, .0075))
    leather = Union([Material(Union([band, tongue] + loops, k=.004), M['leather']), Material(Union(pouches), M['pouch']), Material(Union(flaps), M['pack_flap'])], k=.004)
    return leather, Material(Union([buckle, prong] + studs), M['brass'])


def scarf():
    """The team bandana: a folded triangle wrapped round the neck inside the shirt collar and tied
    in front with a real knot and two short tails."""
    band = Torus((0, 1.430, -.012), .150, .036, R=rot(pitch=-.30), squash=.72)

    def wrap(p):
        a = np.arctan2(p[:, 0], -(p[:, 2] + .012))
        # Diagonal folds of the rolled cloth, tightening toward the knot.
        return .0055 * np.sin(a * 5 + (p[:, 1] - 1.43) * 95) + .0030 * np.sin(a * 11 - (p[:, 1] - 1.43) * 60)
    band = Displace(band, wrap, .009)
    kc = v(0, 1.372, -.186)
    knot = Union([Ellipsoid(kc, (.034, .030, .028)), Ellipsoid(kc + v(-.030, .012, .010), (.024, .020, .020)), Ellipsoid(kc + v(.030, .012, .010), (.024, .020, .020))], k=.008)
    knot = Cut(knot, Torus(kc + v(0, -.002, -.004), .030, .0045, R=rot(pitch=1.25) @ rot(roll=.35)), k=.003)
    tails = []
    chest = Offset(torso(), .012)
    for pts, w in (([(-.010, 1.352, -.200), (-.036, 1.288, -.222), (-.062, 1.212, -.238)], [.026, .046, .008]),
                   ([(.012, 1.352, -.200), (.030, 1.300, -.222), (.050, 1.236, -.238)], [.024, .040, .008])):
        pts = [pts[0]] + [tuple(q) for q in on_surface(chest, np.array(pts[1:], F), .010)]
        tails.append(Loft(pts, w, [.010, .008, .005], side=(1, 0, 0)))

    def drape(p):
        return .0045 * np.sin(p[:, 0] * 150 + p[:, 1] * 40) * _ss(1.36, 1.30, p[:, 1])
    tails = Displace(Union(tails, k=.004), drape, .005)
    return Material(Union([band, knot, tails], k=.008), M['scarf'])


def _rag_anchor():
    shell = Offset(torso(), .040)
    top = on_surface(shell, v(.250, .918, -.170))[0]
    n = surface_frame(shell, top)[:, 0]; n = norm(v(n[0], 0, n[2]))
    return top, n


RAG_TOP, RAG_OUT = _rag_anchor()


def hip_cloth(under):
    """The team rag tucked in the belt on the right hip: soft cloth in three or four vertical
    folds, gathered under the belt, hanging over the trouser leg to a pointed end."""
    across = v(-RAG_OUT[2], 0, RAG_OUT[0])

    def fn(p):
        q = p - RAG_TOP
        u = q @ across                             # across the cloth, along the hip
        y = q[:, 1]
        t = np.clip(-y / .34, 0, 1)                # 0 at the belt, 1 at the point
        half = .020 + .066 * np.maximum(np.sin(np.clip(t * 1.25, 0, 1) * math.pi), 0) ** .7 * (1 - .55 * t)
        pleat = .012 * np.sin(u / np.maximum(half, .02) * 5.2 + 1.0) * _ss(0, .25, t)
        swell = .014 * np.sin(t * math.pi)
        # The sheet lies on the clothes underneath (belt, pouch, trouser leg), lifted by its folds.
        d = S.evaluate(under, p.astype(F), cull=False)[0]
        sheet = np.abs(d - .016 - pleat - swell) - .0075
        outline = np.maximum(np.abs(u - .012 * t) - half, np.maximum(y - .035, -y - .34 + np.abs(u - .012) * 1.6))
        return np.maximum(sheet, outline)
    return Material(Field(fn, RAG_TOP + v(-.16, -.37, -.16), RAG_TOP + v(.16, .06, .16)), M['hipcloth'])


def backpack(parts):
    """A canvas rucksack: a stuffed rounded body, a top flap held by two buckled straps, side
    pockets, the rolled blanket strapped on top, leather shoulder straps over the vest."""
    body = Union([RoundBox((0, 1.105, .262), (.118, .130, .030), r=.052, R=rot(pitch=-.05)), Ellipsoid((0, 1.070, .290), (.150, .135, .080))], k=.03)
    flap = Union([RoundBox((0, 1.232, .272), (.128, .040, .040), r=.040, R=rot(pitch=-.12)), Ellipsoid((0, 1.205, .318), (.140, .060, .040))], k=.02)
    pockets = Union([RoundBox(side((.178, 1.060, .262), s), (.014, .062, .036), r=.022) for s in (-1, 1)])
    pocket_flaps = Union([RoundBox(side((.182, 1.108, .262), s), (.018, .018, .042), r=.014) for s in (-1, 1)])
    bag = Union([Material(Union([body, pockets], k=.010), M['pack']), Material(Union([flap, pocket_flaps]), M['pack_flap'])], k=.008)
    # Two leather straps down the flap to brass buckles on the body.
    straps, brass = [], []
    for s in (-1, 1):
        a = on_surface(bag, side((.062, 1.250, .40), s), .003)[0]; b = on_surface(bag, side((.062, 1.170, .42), s), .003)[0]; c = on_surface(bag, side((.062, 1.090, .42), s), .003)[0]
        straps.append(Loft([a, b, c], [.014] * 3, [.0045] * 3, side=(1, 0, 0)))
        bk = on_surface(bag, side((.062, 1.150, .42), s), .006)[0]
        brass.append(Cut(RoundBox(bk, (.019, .015, .004), r=.003), RoundBox(bk, (.011, .008, .01), r=.002), k=.001))
    # The rolled blanket across the top: spiral ends, two buckled straps.
    rc = v(0, 1.372, .262); rr = .062; half = .205

    def blanket(p):
        q = p - rc
        rad = np.hypot(q[:, 1], q[:, 2]); ang = np.arctan2(q[:, 2], q[:, 1])
        d = np.maximum(rad - rr, np.abs(q[:, 0]) - half)
        # The roll's layers show as a spiral groove on both ends; the free edge makes a lip.
        spiral = np.sin((rad / rr * 3.2 - ang / math.tau) * math.tau)
        end = _ss(half - .012, half, np.abs(q[:, 0]))
        d += end * .0040 * spiral * (rad < rr * 1.05)
        lip = np.exp(-((ang - .9) / .16) ** 2) * .005
        d -= lip * (np.abs(q[:, 0]) < half - .004)
        d += .0016 * np.sin(q[:, 0] * 95 + ang * 3)
        return d - .006
    roll = Material(Field(blanket, rc - v(half + .02, rr + .02, rr + .02), rc + v(half + .02, rr + .02, rr + .02)), M['canvas'])
    for s in (-1, 1):
        straps.append(Torus(rc + v(s * .105, 0, 0), rr + .008, .0062, R=rot(roll=math.pi / 2), squash=2.2))
        bk = rc + v(s * .105, rr * .72, rr * .72 + .006)
        brass.append(Cut(RoundBox(bk, (.017, .013, .004), r=.003, R=rot(pitch=-.78)), RoundBox(bk, (.010, .007, .01), r=.002, R=rot(pitch=-.78)), k=.001))
    # Shoulder straps over the vest, from the pack over the shoulders down the chest to the side.
    vest_surface = Offset(parts['torso'], .030)
    for s in (-1, 1):
        path = [side(p, s) for p in ((.120, 1.300, .190), (.158, 1.408, .080), (.170, 1.410, -.050), (.178, 1.310, -.170), (.196, 1.160, -.215), (.226, 1.020, -.200))]
        path = on_surface(vest_surface, np.array(path, F), .007)
        straps.append(Loft(path, [.024] * len(path), [.0065] * len(path), side=(1, 0, 0)))
        bk = on_surface(vest_surface, side((.188, 1.235, -.22), s), .013)[0]
        brass.append(RoundBox(bk, (.017, .013, .0025), r=.004, R=rot(yaw=s * .45)))
    return bag, roll, Material(Union(straps, k=.003), M['strap']), Material(Union(brass), M['brass'])


def build():
    parts = body_parts()
    skin = Union([parts['torso'], parts['neck'], parts['head']], k=.06, mat=M['fur'])
    limbs = []
    for n in 'LR':
        limbs.append(Union([parts['upper_' + n], parts['fore_' + n]], k=.03, mat=M['fur']))
        limbs.append(Union([parts['fore_' + n], parts['paw_' + n]], k=.020))
        limbs.append(Union([parts['thigh_' + n], parts['shin_' + n], parts['foot_' + n]], k=.03, mat=M['fur']))
    body = Union([skin] + limbs, k=.03)
    leather, brass = belt(parts)
    bag, roll, straps, strap_brass = backpack(parts)
    shirt_cloth, cuffs, buttons = shirt(parts)
    denim, vest_brass, vest_tab = vest(parts)
    cargo, cargo_studs = trousers(parts)
    # A small fillet where the vest meets the shirt: no slit between the armhole and the sleeve
    # for the decimated game mesh to bridge with sliver triangles.
    garments = Union([shirt_cloth, denim], k=.008)
    gear = [garments, cuffs, buttons, shirt_collar(), vest_brass, vest_tab, cargo, cargo_studs, leather, brass,
            scarf(), hip_cloth(Union([cargo, leather], k=.01)), bag, roll, straps, strap_brass]
    # Nothing below the contact plane: the soles sit on the ground.
    return Intersect(Union([body] + gear, k=0.0), Plane((0, .0015, 0), (0, -1, 0))), parts


def eyes():
    return Union([Material(Sphere(eye_point(s)[0], EYE_R), M['eye']) for s in (-1, 1)])


EYE_R = .030

# A free strip along the left and bottom atlas edges holds flat swatches for unbaked geometry.
SWATCH_STRIP = .015
SWATCH = {'whisker': (.006, .006)}


BOUNDS = (v(-.72, -.01, -.66), v(.72, 1.90, .46))
