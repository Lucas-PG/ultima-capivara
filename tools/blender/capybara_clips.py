"""Clip library for the v6 capybara (executed inside capybara_v6.py with `rig`, `scene`, `report`,
`OUT`, `lods` in scope). Authored at 60 Hz, in place (the runtime owns travel and time-scales
the gaits to the actor's speed).

Personality: a heavy, unhurried animal. Weight rolls over each stance foot (the waddle), the
belly breathes and jiggles, the ears, backpack and hip rag lag behind the body, the head stays
level and calm while the body works underneath it. Legs are solved in world space (two-bone IK
with planted feet), everything else is keyed as local rotations.
"""
import math
from mathutils import Vector, Matrix, Quaternion

scene.render.fps = 60
FPS = 60
for obj in lods:
    for mod in obj.modifiers:
        mod.show_viewport = False  # authoring poses must not evaluate three skinned meshes


def Vg(p):
    """Game -> Blender vector."""
    return Vector((p[0], -p[2], p[1]))


def ease(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def bump(t, a, b):
    """0 -> 1 -> 0 over [a, b] (sine)."""
    if t <= a or t >= b:
        return 0.0
    return math.sin(math.pi * (t - a) / (b - a))


pb = rig.pose.bones
REST_M = {b.name: b.bone.matrix_local.copy() for b in pb}
LEN = {b.name: b.bone.length for b in pb}
SIDES = [(-1, 'L'), (1, 'R')]


def reset():
    for p in pb:
        p.rotation_mode = 'XYZ'
        p.rotation_euler = (0, 0, 0); p.location = (0, 0, 0); p.scale = (1, 1, 1)


def update():
    bpy.context.view_layer.update()


def head_of(name):
    return REST_M[name].to_translation()


def leg(n, travel=0.0, lift=0.0, lateral=0.0, drop=0.0, foot_pitch=0.0, toe=0.0, spread=0.0):
    """Place one leg: ankle `travel` behind its rest spot (toward game +z), `lift` above the ground, `lateral` outward,
    the hip lowered by `drop` (the knee bends to keep the foot there). Pitch rolls the foot,
    toe curls the toes (positive = toes up at push-off)."""
    s = -1 if n == 'L' else 1
    hip = head_of('thigh_' + n) + Vector((0, 0, -drop))
    ankle0 = head_of('foot_' + n)
    ankle = ankle0 + Vector((s * lateral, -travel, lift))
    l1, l2 = LEN['thigh_' + n], LEN['shin_' + n]
    d = ankle - hip
    dist = min(max(d.length, abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4)
    axis = d.normalized()
    ankle = hip + axis * dist
    # Knees point forward: game forward (-z) is Blender +Y (Vg maps game z to Blender -y). A -Y
    # pole bent every authored knee backwards, the hock read of round 2.
    pole = Vector((s * spread, 1, 0))
    pole = (pole - axis * pole.dot(axis)).normalized()
    a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
    h = math.sqrt(max(0.0, l1 * l1 - a * a))
    knee = hip + axis * a + pole * h
    for name, head, tail in (('thigh_' + n, hip, knee), ('shin_' + n, knee, ankle)):
        rest = REST_M[name]
        rest_dir = (rest.to_3x3() @ Vector((0, 1, 0))).normalized()
        swing = rest_dir.rotation_difference((tail - head).normalized())
        m = (swing.to_matrix() @ rest.to_3x3()).to_4x4(); m.translation = head
        pb[name].matrix = m
        update()
    for name, angle in (('foot_' + n, foot_pitch), ('toes_' + n, foot_pitch + toe)):
        rest = REST_M[name]
        m = (Matrix.Rotation(angle, 3, 'X') @ rest.to_3x3()).to_4x4()
        m.translation = ankle if name.startswith('foot') else (pb['foot_' + n].matrix @ Vector((0, LEN['foot_' + n], 0)))
        pb[name].matrix = m
        update()


def gait(n, phase, front, back, lift, contact=.40, direction=(0.0, 1.0), drop=0.0, roll=1.0):
    """A planted-foot gait. Stance (a `contact` share of the cycle): the foot lands `front` ahead
    of its rest spot along the travel `direction` (right, forward) and is carried back at constant
    speed (the runtime matches that speed to the actor) to `back` behind it; stepping forward, the
    heel peels up over the last third while the toe hinge stays on the ground. Swing: lifted and
    eased forward again. `drop` lowers the hip; callers lower the body by the same amount, so the
    pelvis never stretches away from the legs."""
    c = phase % 1.0
    span = front + back
    right, forward = direction
    roll *= max(0.0, forward) ** 2                               # side and back steps stay flat
    if c < contact:
        u = c / contact
        fwd = front - span * u
        up = 0.0
        pitch = -.22 * roll * ease((u - .62) / .38)            # heel peels off before toe-off
        toe = -pitch                                            # toes stay flat on the ground
    else:
        u = (c - contact) / (1 - contact)
        fwd = -back + span * ease(u)
        up = lift * math.sin(math.pi * u) ** .8          # clears the ground quickly at lift-off
        pitch = -.22 * roll * (1 - ease(u / .35)) + .14 * roll * bump(u, .45, 1.0)  # toes up to reach
        toe = .22 * roll * (1 - ease(u / .3)) + .25 * roll * bump(u, .05, .45)      # the toes flick
    # Rolling about the toe hinge: the ankle rises and moves forward while that contact point stays.
    up += .112 * (1 - math.cos(pitch)) - .105 * math.sin(pitch)
    peel = -.105 * (1 - math.cos(pitch)) + .112 * math.sin(pitch)
    s = -1 if n == 'L' else 1
    # `leg` travel is positive toward game +z (behind the body), lateral positive outward.
    leg(n, -forward * fwd + peel, up, s * right * fwd, drop, pitch, toe)


def key_all(frame):
    for p in pb:
        p.keyframe_insert('rotation_euler', frame=frame, group=p.name)
        p.keyframe_insert('location', frame=frame, group=p.name)
        p.keyframe_insert('scale', frame=frame, group=p.name)
        # Leg bones were posed through matrices: their basis is what gets keyed.


def secondary(t, bounce, sway, gust=0.0):
    """Ears, pack, blanket, bandana tails and hip rag lag the body: `bounce` is the vertical bob
    signal, `sway` the roll, `gust` the headwind of a fast gait. The runtime adds springs on top."""
    for s, n in SIDES:
        pb['ear_' + n].rotation_euler.x = -.10 * bounce - .14 * gust + .03 * math.sin(t * 7 + s)
        pb['ear_' + n].rotation_euler.z = s * .05 * sway
        pb['scarf_' + n].rotation_euler.x = .10 * bounce + .45 * gust
        pb['scarf_' + n].rotation_euler.z = .10 * sway + s * .06 * gust
    pb['pack'].rotation_euler.x = .05 * bounce
    pb['pack'].location.z = .004 * bounce
    pb['bedroll'].rotation_euler.x = .06 * bounce
    pb['hipcloth'].rotation_euler.x = -.12 * bounce - .2 * gust
    pb['hipcloth'].rotation_euler.z = .10 * sway


def keyed(t, keys):
    """Piecewise eased value through (time, value) keys on the 0..1 loop: holds with quick moves."""
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1:
            return v0 + (v1 - v0) * ease((t - t0) / max(t1 - t0, 1e-6))
    return keys[-1][1]


def blink(t, at, width=.07):
    x = abs(t - at) / width
    return .04 + .96 * min(1.0, x ** 1.5) if x < 1 else 1.0


HEAD_REST = None


def stabilize_head(amount=1.0):
    """Shift the torso under a steady head: the waddle and the lean roll the body, the head
    (and so the face and its hit volume) stays where it is horizontally."""
    update()
    now = pb['head'].matrix.to_translation()
    d = now - HEAD_REST
    pb['spine'].location.x -= d.x * amount
    pb['spine'].location.z += d.y * amount


def author(name, seconds, fn, loop=True, stabilize=0.0, step=1):
    action = bpy.data.actions.new(name); action.use_fake_user = True
    rig.animation_data.action = action
    frames = max(2, round(seconds * FPS))
    # Long, slow clips are keyed every `step` frames (the export resamples at 60 Hz).
    for frame in sorted(set(range(0, frames + 1, step)) | {frames}):
        scene.frame_set(frame)
        # Loops close exactly: the last frame repeats the first pose.
        t = (0 if loop and frame == frames else frame / frames)
        reset(); update()
        fn(t, t * seconds)
        if stabilize:
            stabilize_head(stabilize)
        key_all(frame)
    if name not in report['clips']:
        report['clips'].append(name)
    return action


rig.animation_data_create()
report['clips'] = []
reset(); update()
HEAD_REST = pb['head'].matrix.to_translation().copy()


# ------------------------------------------------------------------ idle: alive while standing
# A 10 s loop: four breaths in the chest and belly, the weight going from foot to foot twice, the
# head looking around in small quick turns with holds, ear flicks, three blinks and a nose twitch.
LOOK_YAW = [(0, 0), (.06, 0), (.09, .15), (.24, .15), (.27, .09), (.38, .09), (.42, -.08), (.55, -.08), (.59, -.16), (.72, -.16), (.76, -.11), (.86, -.11), (.91, 0), (1, 0)]
LOOK_PITCH = [(0, 0), (.06, 0), (.09, .03), (.24, .03), (.27, -.05), (.38, -.05), (.42, .02), (.55, .02), (.59, -.03), (.72, -.03), (.76, .04), (.86, .04), (.91, 0), (1, 0)]
BLINKS = (.17, .50, .83)


def breathing(t, breaths, depth=1.0):
    """Chest and belly fill and the shoulders rise a little with each breath."""
    b = math.sin(math.tau * t * breaths)
    inhale = .5 + .5 * b
    pb['belly'].scale.z = 1 + .040 * b * depth; pb['belly'].scale.x = 1 + .018 * b * depth
    pb['chest'].rotation_euler.x += .022 * b * depth
    pb['chest'].location.y += .0045 * inhale * depth
    pb['neck'].rotation_euler.x += -.012 * b * depth
    for s, n in SIDES:
        pb['arm_' + n].rotation_euler.z += s * .020 * b * depth
    pb['pack'].rotation_euler.x += .012 * b * depth
    return b


def alive_face(t, look=1.0):
    """Looks, ear flicks, blinks and the nose twitch shared by the idles."""
    pb['head'].rotation_euler.z = keyed(t, LOOK_YAW) * look          # a look around: quick turns, holds
    pb['head'].rotation_euler.x += keyed(t, LOOK_PITCH) * look
    pb['neck'].rotation_euler.z += keyed(t, LOOK_YAW) * .25 * look
    for s, n in SIDES:
        flick = max(bump(t, .13, .17), bump(t, .62, .655)) if n == 'L' else max(bump(t, .33, .365), bump(t, .88, .915))
        pb['ear_' + n].rotation_euler.x = .03 * math.sin(math.tau * t * 3 + s) - .38 * flick
        pb['ear_' + n].rotation_euler.z = s * .10 * flick
        pb['blink_' + n].scale.y = min(blink(t, at, .018) for at in BLINKS)
    twitch = max(bump(t, .30, .325), bump(t, .335, .36), bump(t, .70, .725))
    pb['nose'].rotation_euler.x = .10 * twitch
    pb['nose'].scale = (1 + .06 * twitch, 1 + .04 * twitch, 1)
    pb['jaw'].rotation_euler.x = .02 * bump(t, .45, .49) + .02 * bump(t, .49, .53)   # a chew


def idle(t, sec):
    breath = breathing(t, 4)
    shift = math.sin(math.tau * t * 2 + .4)     # weight from foot to foot, 5 s per cycle
    settle = ease(abs(shift)) * (1 if shift > 0 else -1)
    pb['spine'].location.x = .020 * settle       # the body rides over the loaded foot
    pb['spine'].rotation_euler.z = .030 * settle
    pb['chest'].rotation_euler.z = -.018 * settle
    pb['neck'].rotation_euler.z += -.010 * settle
    alive_face(t)
    for s, n in SIDES:
        # The loaded leg straightens, the free knee softens.
        leg(n, 0, 0, 0, .006 + .012 * max(0, -s * settle) + .003 * (.5 + .5 * breath))
        pb['scarf_' + n].rotation_euler.z = .03 * settle
    pb['hipcloth'].rotation_euler.z = .05 * settle
    pb['bedroll'].rotation_euler.x = .01 * breath


author('idle', 10.0, idle, stabilize=.9, step=3)


# ------------------------------------------------------------------ armed idle: low ready, leaning in
def idle_armed(t, sec):
    """Holding a gun: the left foot forward, knees bent, the weight low and leaning into the gun
    (the runtime turns the shoulders and places the arms)."""
    drop = .050
    breath = breathing(t, 4, .8)
    sway = math.sin(math.tau * t * 2)
    leg('L', -.085, 0, .010, drop + .004 * (.5 + .5 * breath), 0, 0)
    leg('R', .070, 0, .020, drop + .004 * (.5 + .5 * breath), 0, 0)
    pb['spine'].location.y = -drop - .003 * (.5 + .5 * breath)
    pb['spine'].location.x = .008 * sway
    pb['spine'].rotation_euler.x = -.11
    pb['chest'].rotation_euler.x += -.06
    pb['neck'].rotation_euler.x += .10
    pb['head'].rotation_euler.x = .07
    alive_face(t, .45)
    secondary(sec, 0, .3 * sway)


author('idle_armed', 10.0, idle_armed, stabilize=.9, step=3)


# ------------------------------------------------------------------ walk: the waddle
# Gait table: (front, back, contact, seconds, body drop). The stance moves span = front + back
# in contact * seconds, so the stance speed below is what the runtime plays each clip at. The
# walk family shares one table row so its clips blend at one phase without skating; the legs
# reach by bending (the whole body sinks by `drop`), never by stretching away from the hips.
D = 0.70710678
# Eight walk and eight crouch directions (right, forward), so a blend spans at most 45 degrees:
# blending leg rotations between wider apart clips swings the stance foot below the floor.
WALK_DIRS = {'walk': (0, 1), 'walk_fr': (D, D), 'strafe_r': (1, 0), 'backpedal_r': (D, -D), 'backpedal': (0, -1),
             'backpedal_l': (-D, -D), 'strafe_l': (-1, 0), 'walk_fl': (-D, D)}
CROUCH_DIRS = {'crouch_walk': (0, 1), 'crouch_fr': (D, D), 'crouch_strafe_r': (1, 0), 'crouch_br': (D, -D), 'crouch_back': (0, -1),
               'crouch_bl': (-D, -D), 'crouch_strafe_l': (-1, 0), 'crouch_fl': (-D, D)}
# Gait table: (front, back, contact, seconds, body drop). The stance moves span = front + back in
# contact * seconds: that stance speed is what the runtime plays each clip at. One row per family,
# so its clips blend at one phase without skating; the legs reach by bending (the whole body sinks
# by `drop`), never by stretching away from the hips.
WALK_ROW = (.22, .28, .40, 20 / 60, .045)
CROUCH_ROW = (.13, .17, .50, 24 / 60, 0)
GAITS = {**{k: WALK_ROW for k in WALK_DIRS}, 'run': (.24, .30, .30, 18 / 60, .045), **{k: CROUCH_ROW for k in CROUCH_DIRS}}
report['locomotionSpeed'] = {k: (f + b) / (c * sec) for k, (f, b, c, sec, d) in GAITS.items()}
report['locomotionContact'] = {k: c for k, (f, b, c, sec, d) in GAITS.items()}
report['locomotionDirection'] = {**{k: list(v) for k, v in WALK_DIRS.items()}, 'run': [0, 1], **{k: list(v) for k, v in CROUCH_DIRS.items()}}


def walk_like(name, lift, cadence_drop):
    front, back, contact, seconds, sink = GAITS[name]
    right, forward = WALK_DIRS[name]
    lean = -.05 * max(0, forward) + .015 * max(0, -forward) - .02 * abs(right)
    def fn(t, sec):
        ph = math.tau * t
        bob = math.cos(2 * ph)                              # low at each contact
        drop = sink + cadence_drop * (.5 + .5 * bob)
        for i, (s, n) in enumerate(SIDES):
            gait(n, t + i * .5, front, back, lift, contact, direction=(right, forward), drop=drop)
        pb['spine'].location.y = -drop
        roll = math.sin(ph)
        pb['spine'].rotation_euler.z = .07 * roll + .05 * right   # the waddle: weight over the stance foot
        pb['spine'].rotation_euler.y = .06 * roll * (1 if forward >= 0 else -1)
        pb['chest'].rotation_euler.z = -.035 * roll
        pb['chest'].rotation_euler.y = -.05 * roll
        pb['spine'].rotation_euler.x = lean
        pb['chest'].rotation_euler.x = lean * .5 + .012 * bob
        pb['neck'].rotation_euler.x = -lean * 1.2
        pb['head'].rotation_euler.x = -lean * .3 - .012 * bob  # the head floats level
        pb['neck'].rotation_euler.z = -.02 * roll
        pb['belly'].scale.y = 1 - .03 * bob                 # belly settles at contact
        secondary(sec, bob, roll)
        for s, n in SIDES:
            pb['arm_' + n].rotation_euler.x = .10 * math.sin(ph + (0 if n == 'L' else math.pi)) * (1 if forward >= 0 else -1)
            pb['blink_' + n].scale.y = blink(t, .8, .05)
    return fn


for name, (right, forward) in WALK_DIRS.items():
    author(name, GAITS[name][3], walk_like(name, .10 if forward > .5 else .08, .022 if forward > .5 else .016), stabilize=.9)


# ------------------------------------------------------------------ run: a bounding scurry
def run(t, sec):
    ph = math.tau * t
    front, back, contact, seconds, sink = GAITS['run']
    bob = math.cos(2 * ph - .5)
    drop = sink + .020 * (.5 + .5 * bob)
    for i, (s, n) in enumerate(SIDES):
        gait(n, t + i * .5, front, back, .17, contact, drop=drop)
    pb['spine'].location.y = -drop
    roll = math.sin(ph)
    # A forward drive from the hips; the head is stabilised (it stays in its hit volume and
    # level), so the body leans in under it while the ears, pack and rag lag behind.
    pb['spine'].rotation_euler.x = -.10 + .015 * bob
    pb['chest'].rotation_euler.x = -.05 + .01 * bob
    pb['neck'].rotation_euler.x = .11 - .012 * bob
    pb['head'].rotation_euler.x = .04 - .012 * bob
    pb['spine'].rotation_euler.y = .08 * roll
    pb['chest'].rotation_euler.y = -.10 * roll               # shoulders counter the hips
    pb['spine'].rotation_euler.z = .03 * roll
    pb['belly'].scale.y = 1 - .06 * bob                      # belly jiggle
    pb['belly'].scale.z = 1 + .03 * bob
    secondary(sec, bob * 1.8, roll, gust=.6)
    for s, n in SIDES:
        pump = math.sin(ph + (0 if n == 'L' else math.pi))
        pb['arm_' + n].rotation_euler.x = .45 * pump
        pb['forearm_' + n].rotation_euler.x = -.25 - .2 * max(0, pump)


author('run', GAITS['run'][3], run, stabilize=.9)


# ------------------------------------------------------------------ crouch: low on the haunches
# The crouched hit shape is the standing one scaled by 1.3/1.8 (head centre ~1.16 m): the
# capybara hunkers down on folded legs with its belly low and its back rounded.
CROUCH_DROP = .34


def crouch_pose(ph, drop=CROUCH_DROP):
    pb['spine'].location.y = -drop
    pb['spine'].rotation_euler.x = -.40
    pb['chest'].rotation_euler.x = -.16
    pb['neck'].rotation_euler.x = -.08      # the neck folds forward and down into the shoulders
    pb['head'].rotation_euler.x = .62       # the face still looks ahead


def crouch_idle(t, sec):
    ph = math.tau * t
    breath = math.sin(ph * 2)
    for s, n in SIDES:
        leg(n, -.02, 0, .02, CROUCH_DROP, 0, 0, spread=.35)
    crouch_pose(ph)
    pb['belly'].scale.z = 1 + .03 * breath
    pb['belly'].scale.x = 1 + .012 * breath
    pb['head'].rotation_euler.z = .04 * math.sin(ph + .4)
    for s, n in SIDES:
        pb['ear_' + n].rotation_euler.x = -.10 + .03 * math.sin(ph + s)
        pb['blink_' + n].scale.y = blink(t, .4)
    secondary(sec, 0, 0)


author('crouch_idle', 4.0, crouch_idle, stabilize=.95)


def crouch_gait(name):
    front, back, contact, seconds, sink = GAITS[name]
    right, forward = CROUCH_DIRS[name]
    def fn(t, sec):
        ph = math.tau * t
        bounce = .012 * (.5 + .5 * math.cos(2 * ph))
        for i, (s, n) in enumerate(SIDES):
            gait(n, t + i * .5, front, back, .06, contact, direction=(right, forward), drop=CROUCH_DROP + bounce, roll=.6)
        crouch_pose(ph, CROUCH_DROP + bounce)
        roll = math.sin(ph)
        pb['spine'].rotation_euler.z = .05 * roll + .04 * right
        pb['spine'].rotation_euler.y = .05 * roll
        secondary(sec, math.cos(2 * ph), roll)
    return fn


for name in CROUCH_DIRS:
    author(name, GAITS[name][3], crouch_gait(name), stabilize=.95)


# ------------------------------------------------------------------ air
def jump(t, sec):
    # Launch: legs extend and trail, then tuck; arms rise; ears stream back.
    ext = ease(t / .25); tuck = ease((t - .25) / .5)
    for s, n in SIDES:
        leg(n, .04 * tuck - .06 * ext * (1 - tuck), .10 * tuck + .02 * ext, .01, .02 * (1 - ext), -.25 * ext * (1 - tuck) + .1 * tuck, .3 * ext * (1 - tuck))
        pb['arm_' + n].rotation_euler.x = -.25 * ext
        pb['arm_' + n].rotation_euler.z = -.25 * (1 if n == 'L' else -1) * ext
    pb['spine'].rotation_euler.x = .04 * ext - .05 * tuck
    pb['neck'].rotation_euler.x = .03 * tuck - .04 * ext * (1 - tuck)   # the long snout stays in the head volume
    pb['belly'].scale.y = 1 + .04 * ext * (1 - tuck)
    secondary(sec, -ext * .5, 0, gust=.25 * ext)


author('jump', .5, jump, loop=False, stabilize=.9)


def fall(t, sec):
    ph = math.tau * t
    for i, (s, n) in enumerate(SIDES):
        kick = math.sin(ph * 2 + i * math.pi)
        leg(n, .05 + .04 * kick, .14 + .03 * kick, .03, 0, .15 + .1 * kick, 0)
        pb['arm_' + n].rotation_euler.x = -.35 + .05 * math.sin(ph * 2 + i)
        pb['arm_' + n].rotation_euler.z = (.35 if n == 'L' else -.35)
    pb['spine'].rotation_euler.x = -.04
    pb['neck'].rotation_euler.x = .05
    for s, n in SIDES:
        pb['ear_' + n].rotation_euler.x = .30 + .05 * math.sin(ph * 4 + s)   # wind lifts the ears
    pb['hipcloth'].rotation_euler.x = .5 + .1 * math.sin(ph * 5)
    pb['pack'].rotation_euler.x = -.04


author('fall', 1.2, fall)


def land(t, sec):
    squash = math.sin(math.pi * min(1, t / .45)) ** 1.1 if t < .45 else 0
    settle = math.sin((t - .45) / .55 * math.pi) * .25 if t >= .45 else 0
    drop = .10 * squash - .02 * settle
    for s, n in SIDES:
        leg(n, 0, 0, .015 * squash, drop, 0, 0, spread=.3 * squash)
    pb['spine'].location.y = -drop
    pb['spine'].rotation_euler.x = -.12 * squash
    pb['neck'].rotation_euler.x = .10 * squash
    pb['belly'].scale.y = 1 - .08 * squash
    pb['belly'].scale.x = 1 + .04 * squash
    pb['belly'].scale.z = 1 + .05 * squash
    for s, n in SIDES:
        pb['arm_' + n].rotation_euler.x = .12 * squash
    secondary(sec, squash * 2 - settle, 0)


author('land', .45, land, loop=False)


# ------------------------------------------------------------------ third-person reload (arms, additive)
def reload_tp(t, sec):
    tilt = ease(t / .12) * (1 - ease((t - .82) / .18))
    fetch = math.sin(math.pi * max(0, min(1, (t - .16) / .46)))
    shove = math.sin(math.pi * max(0, min(1, (t - .62) / .12)))
    slap = math.sin(math.pi * max(0, min(1, (t - .78) / .08)))
    pb['arm_R'].rotation_euler.x = .22 * tilt + .06 * shove
    pb['arm_R'].rotation_euler.z = -.3 * tilt
    pb['forearm_R'].rotation_euler.y = .35 * tilt
    pb['arm_L'].rotation_euler.x = -.55 * fetch + .12 * shove
    pb['arm_L'].rotation_euler.z = -.25 * fetch
    pb['forearm_L'].rotation_euler.x = .5 * fetch - .2 * slap
    pb['paw_L'].rotation_euler.y = .4 * fetch


author('reload_tp', 2.2, reload_tp, loop=False)


# ------------------------------------------------------------------ death: stagger, buckle, flop
def death(t, sec):
    stagger = ease(t / .18) * (1 - ease((t - .25) / .2))
    buckle = ease((t - .12) / .35)
    fall_t = ease((t - .30) / .38)
    bounce = math.sin(max(0, min(1, (t - .68) / .2)) * math.pi) * (1 - t) * .5
    for i, (s, n) in enumerate(SIDES):
        leg(n, (.05 if n == 'L' else -.04) * stagger, 0, .02 * buckle, .20 * buckle * (1 - fall_t), 0, 0, spread=.5 * buckle)
    pb['root'].rotation_euler.z = -1.45 * fall_t + .06 * bounce         # onto its side
    pb['root'].location.z = .0
    pb['root'].location.y = .24 * fall_t
    pb['spine'].rotation_euler.x = .10 * stagger - .15 * buckle * (1 - fall_t)
    pb['neck'].rotation_euler.x = .25 * stagger - .1 * fall_t
    pb['head'].rotation_euler.z = .2 * fall_t
    for s, n in SIDES:
        pb['arm_' + n].rotation_euler.z = (.6 if n == 'R' else -.2) * fall_t
        pb['arm_' + n].rotation_euler.x = -.3 * stagger + .3 * fall_t
        pb['forearm_' + n].rotation_euler.x = .3 * fall_t
        pb['ear_' + n].rotation_euler.x = -.4 * stagger + .2 * fall_t
        pb['blink_' + n].scale.y = 1 - .8 * ease((t - .5) / .3)
    pb['hipcloth'].rotation_euler.z = .6 * fall_t
    pb['jaw'].rotation_euler.x = .12 * fall_t


author('death', 1.6, death, loop=False)

from character_emotes import add_emotes
add_emotes(rig, scene, report, leg, author, secondary, blink)

# ------------------------------------------------------------------ faces (additive over neutral)
face_parts = [p for p in pb if p.name.startswith(('blink_', 'socket_', 'glint_', 'brow_', 'ear_', 'mouth_')) or p.name == 'jaw']
for expression in ['neutral', 'determined', 'hit', 'stunned', 'victory', 'blink']:
    action = bpy.data.actions.new('face_' + expression)
    action.use_fake_user = True
    rig.animation_data.action = action
    for frame in [0, 8]:
        scene.frame_set(frame)
        for p in face_parts:
            p.rotation_euler = (0, 0, 0); p.location = (0, 0, 0); p.scale = (1, 1, 1)
        # v6 face: lid skin and eyeball follow blink_* (scale.y closes the lids onto the eye
        # centre line), brow pads brow_*, mouth corners mouth_*, the chin jaw, ears ear_*.
        for sign, side in SIDES:
            lid = pb['blink_' + side]
            brow = pb['brow_' + side]
            ear = pb['ear_' + side]
            mouth = pb['mouth_' + side]
            # Poses sized to read at 3 to 15 m: lids, brows and ears carry most of it (they break the
            # head silhouette), the mouth corners and jaw the rest.
            if expression == 'determined':
                lid.scale.y = .50
                brow.location.y = -.013
                brow.rotation_euler.z = sign * .45            # inner ends down: a frown
                ear.rotation_euler.x = -.45
                mouth.location.y = -.006
            elif expression == 'hit':
                lid.scale.y = .12
                brow.location.y = .014
                brow.rotation_euler.z = -sign * .35           # inner ends up: pain
                ear.rotation_euler.x = -1.0
                mouth.location.y = -.010
                pb['jaw'].rotation_euler.x = .16
            elif expression == 'stunned':
                lid.scale.y = 1.30 if side == 'R' else .40
                brow.location.y = .015 if side == 'R' else -.008
                ear.rotation_euler.z = sign * .70
                ear.location.y = -.014
                mouth.location.y = -.006 if side == 'R' else .004
                pb['jaw'].rotation_euler.x = .22
            elif expression == 'victory':
                lid.scale.y = .30
                brow.location.y = .014
                brow.rotation_euler.z = -sign * .15
                mouth.location.y = .016
                ear.rotation_euler.x = .35
                pb['jaw'].rotation_euler.x = .09
            elif expression == 'blink':
                lid.scale.y = .04
        for p in face_parts:
            p.keyframe_insert('rotation_euler', frame=frame, group=p.name)
            p.keyframe_insert('location', frame=frame, group=p.name)
            p.keyframe_insert('scale', frame=frame, group=p.name)

rig.animation_data.action = None
scene.frame_set(0)
reset()
for obj in lods:
    for mod in obj.modifiers:
        mod.show_viewport = True
scene.frame_start, scene.frame_end = 0, 120
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'v6/character.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT / 'capybara.raw.glb'), export_format='GLB', export_vertex_color='NAME', export_vertex_color_name='Color', export_animations=True, export_animation_mode='ACTIONS', export_nla_strips=False, export_frame_range=False, export_force_sampling=True, export_skins=True, export_influence_nb=4, export_yup=True, export_extras=True, export_cameras=False, export_lights=False, export_attributes=True, export_tangents=True, export_image_format='WEBP', export_image_quality=95)
(OUT / 'blender-report.json').write_text(json.dumps(report, indent=2) + '\n')
print('CAPYBARA_REPORT ' + json.dumps(report))
