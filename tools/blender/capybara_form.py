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
             'trouser', 'brass', 'eye', 'ear_in', 'hipcloth', 'lip', 'button', 'strap', 'sole']
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
        b['mouth_' + n] = (side(v(.052, 1.540, -.262), s), side(v(.052, 1.570, -.262), s), 'mouth_cavity')
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
    return Union([Ellipsoid((0, 1.440, -.010), (.132, .105, .135)), Ellipsoid((0, 1.500, -.030), (.112, .060, .125))], k=.05, mat=M['fur'])


# Head profile stations: (z, top, bottom, half-width at the crown, half-width at the jaw, exponent).
HEAD_STATIONS = [
    (0.182, 1.690, 1.600, 0.040, 0.052, 2.0),
    (0.165, 1.742, 1.560, 0.098, 0.122, 2.0),
    (0.125, 1.778, 1.495, 0.152, 0.172, 2.1),
    (0.070, 1.795, 1.462, 0.176, 0.196, 2.2),
    (0.000, 1.793, 1.455, 0.182, 0.198, 2.3),
    (-0.070, 1.781, 1.465, 0.170, 0.186, 2.3),
    (-0.140, 1.763, 1.484, 0.146, 0.164, 2.4),
    (-0.209, 1.742, 1.500, 0.122, 0.130, 2.5),
    (-0.260, 1.722, 1.512, 0.112, 0.116, 2.5),
    (-0.299, 1.708, 1.530, 0.104, 0.104, 2.4),
    (-0.320, 1.700, 1.548, 0.093, 0.090, 2.3),
    (-0.324, 1.690, 1.575, 0.080, 0.080, 2.2),
    (-0.330, 1.676, 1.610, 0.043, 0.040, 2.0),
]


def head_mass():
    """Big forms of the capybara head: lofted skull-to-muzzle, jowl pads and a small set-back chin."""
    loft = ZLoft(HEAD_STATIONS)
    chin = Ellipsoid((0, 1.508, -.222), (.050, .028, .056))
    return Union([loft, chin], k=.045, mat=M['fur'])


_EYES = {}


def eye_point(s):
    """Eye centre, seated half into the head surface high on the side, looking out and a little forward."""
    if s not in _EYES:
        out = norm(side((.86, .14, -.49), s))
        surface = on_surface(head_mass(), side(EYE, s))[0]
        _EYES[s] = (surface - out * EYE_R * .70, out)
    return _EYES[s]


def eye_frame(s):
    """Columns: along the eye towards the nose, out of the head, up."""
    e, out = eye_point(s)
    fwd = v(0, -.12, -1); fwd = norm(fwd - out * float(fwd @ out))
    up = np.cross(fwd, out) * (1 if s > 0 else -1)
    if up[1] < 0:
        up = -up
    return np.stack([fwd, out, norm(up)], 1).astype(F)


def head():
    """The long blunt capybara head: flat top line to a tall rounded muzzle, broad jowls."""
    mass = head_mass()
    rhinarium = Union([Ellipsoid((0, 1.655, -.306), (.074, .046, .025), R=rot(pitch=-.18)), Ellipsoid((0, 1.690, -.290), (.052, .026, .030))], k=.02)
    lips = Union([Ellipsoid((s * .031, 1.572, -.288), (.044, .038, .034)) for s in (-1, 1)], k=.02)
    face = Union([mass, rhinarium, lips], k=.028, mat=M['fur'])
    nostrils = Union([Ellipsoid((s * .036, 1.668, -.333), (.014, .0062, .014), R=rot(pitch=-.3) @ rot(roll=s * .6)) for s in (-1, 1)])
    face = Cut(face, nostrils, k=.004)
    mouth = Union([RoundCone(side((.0, 1.556, -.315), s), side((.036, 1.532, -.298), s), .003, .0028) for s in (-1, 1)] +
                  [RoundCone((0, 1.606, -.333), (0, 1.584, -.329), .0022, .0026)])
    face = Cut(face, mouth, k=.003)
    for s in (-1, 1):
        e, out = eye_point(s)
        E = eye_frame(s)
        # An almond opening in a raised lid rim, the upper lid heavier; the eyeball shows through.
        rim = Ellipsoid(e + out * .006, (.031, .013, .019), R=E)
        upper = Ellipsoid(e + out * .006 + E[:, 2] * .010, (.030, .010, .010), R=E)
        brow = Ellipsoid(e + E[:, 2] * .030 - out * .004, (.036, .012, .030), R=E)
        face = Union([face, brow], k=.022, mat=M['fur'])
        face = Union([face, rim, upper], k=.007, mat=M['fur'])
        face = Cut(face, Ellipsoid(e + out * .010 - E[:, 2] * .001, (.024, .016, .0115), R=E), k=.003)
    ears = []
    for s in (-1, 1):
        c = side(EAR, s)
        R = rot(yaw=s * .85) @ rot(roll=-s * .30) @ rot(pitch=-.15)
        shell = Ellipsoid(c, (.036, .034, .019), R=R, mat=M['fur'])
        cup = Ellipsoid(c + (R @ v(0, .005, -.013)), (.025, .023, .012), R=R)
        ears.append(Cut(shell, cup, k=.004, edge_mat=M['ear_in']))
    return Union([face] + ears, k=.014, mat=M['fur'])


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
    folds = lambda p: (.0035 * np.sin(p[:, 0] * 55 + p[:, 1] * 23) * np.sin(p[:, 2] * 41 + p[:, 1] * 9) +
                       .002 * np.sin(p[:, 1] * 90 + p[:, 0] * 30))
    placket = RoundBox((0, 1.12, -.222), (.017, .20, .004), r=.003, R=rot(pitch=.06))
    return Material(Union([Displace(Union([body] + sleeves, k=.02), folds, .006), placket], k=.004), M['shirt'])


def vest(parts):
    t = parts['torso']
    shell = Offset(t, .030)
    region = slab(.915, 1.415)
    body = Intersect(shell, region)
    for s in (-1, 1):
        body = Cut(body, Ellipsoid(side(SHOULDER, s) + side((.02, -.03, 0), s), (.105, .165, .135)), k=.01)
    opening = Field(lambda p: (np.abs(p[:, 0]) - (.030 + .075 * np.clip((p[:, 1] - .95) / .45, 0, 1) ** 1.4)) * np.where(p[:, 2] < -.05, 1, -1) + np.where(p[:, 2] < -.05, 0, 1),
                    (-.3, .8, -.4), (.3, 1.5, 0))
    body = Cut(body, opening, k=.004)
    pockets = []
    for s in (-1, 1):
        c = side((.112, 1.105, -.215), s)
        pockets.append(RoundBox(c, (.042, .046, .006), r=.006, R=rot(yaw=s * .42) @ rot(pitch=.12)))
        pockets.append(RoundBox(c + v(0, .046, -.006), (.046, .014, .006), r=.005, R=rot(yaw=s * .42) @ rot(pitch=.2)))
    return Material(Union([body] + pockets, k=.004), M['denim'])


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
    rolls = []
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
        rolls.append(RoundBox(pc, (.002, .058, .050), r=.007, R=R))
        rolls.append(RoundBox(pc + nrm * .003 + up * .058, (.003, .015, .054), r=.006, R=R))
    folds = lambda p: (.004 * np.sin(p[:, 1] * 70 + np.sin(p[:, 0] * 30) * 2) * np.clip(1 - np.abs(p[:, 1] - .43) / .12, 0, 1) +
                       .0025 * np.sin(p[:, 0] * 40 + p[:, 1] * 35 + p[:, 2] * 20))
    return Material(Union([Displace(body, folds, .006)] + rolls, k=.01), M['trouser'])


def belt(parts):
    band = Intersect(Offset(parts['torso'], .036), slab(.905, .958))
    buckle = RoundBox((0, .931, -.262), (.030, .022, .006), r=.004)
    loops = []
    pouches = []
    for s in (-1, 1):
        for yaw, x, z in ((.62, .160, -.212), (1.35, .238, -.035)):
            c = side((x, .872, z), s)
            R = rot(yaw=s * yaw)
            pouches.append(RoundBox(c, (.040, .050, .026), r=.012, R=R))
            pouches.append(RoundBox(c + (R @ v(0, .044, -.004)), (.044, .014, .028), r=.008, R=R))
            loops.append(Sphere(c + (R @ v(0, .040, -.034)), .006))
    return (Material(Union([band] + pouches, k=.004), M['leather']), Material(Union([buckle] + loops), M['brass']))


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
    pack = Material(Intersect(Union([bag, flap, pocket, sides], k=.012), inside), M['pack'])
    canvas = Material(Intersect(roll, inside), M['canvas'])
    # Shoulder straps over the vest, from the pack over the shoulders down the front.
    vest_surface = Offset(parts['torso'], .030)
    straps = []
    for s in (-1, 1):
        path = [side(p, s) for p in ((.090, 1.300, .185), (.118, 1.405, .080), (.128, 1.405, -.060), (.132, 1.300, -.175), (.140, 1.150, -.218), (.150, 1.000, -.232))]
        path = on_surface(vest_surface, np.array(path, F), .006)
        straps.append(Loft(path, [.020] * len(path), [.0055] * len(path), side=(1, 0, 0)))
    buckles = [RoundBox(side((.132, 1.26, -.205), s) + v(0, 0, -.012), (.018, .013, .004), r=.002, R=rot(yaw=s * .25)) for s in (-1, 1)]
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
    gear = [shirt(parts), vest(parts), trousers(parts), leather, brass, scarf(), hip_cloth(), pack, canvas, straps, strap_brass]
    # Nothing below the contact plane: the soles sit on the ground.
    return Intersect(Union([body] + gear, k=0.0), Plane((0, .0015, 0), (0, -1, 0))), parts


def eyes():
    return Union([Material(Sphere(eye_point(s)[0], EYE_R), M['eye']) for s in (-1, 1)])


EYE_R = .0195


BOUNDS = (v(-.60, -.01, -.62), v(.60, 1.90, .40))
