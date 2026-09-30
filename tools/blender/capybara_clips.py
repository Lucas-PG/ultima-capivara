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
    """Place one leg: ankle `travel` forward of rest, `lift` above the ground, `lateral` outward,
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
    pole = Vector((s * spread, -1, 0))  # knees point forward (Blender -Y is game forward)
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


def gait(n, phase, stride, lift, contact=.55, lateral=0.0, reverse=False, drop=0.0, roll=1.0):
    """A planted-foot gait: stance for `contact` of the cycle (the foot slides back under the
    body), then a lifted swing. Toes roll up at push-off, the heel lifts before the swing."""
    c = phase % 1.0
    if c < contact:
        u = c / contact
        travel = stride * (1 - 2 * u)
        up = 0.0
        pitch = -.22 * roll * ease((u - .68) / .32)            # heel peels off before toe-off
        toe = -pitch                                            # toes stay flat on the ground
        up = .12 * math.sin(-pitch)                             # rolling over the toe base
    else:
        u = (c - contact) / (1 - contact)
        travel = stride * (-1 + 2 * ease(u))
        up = lift * math.sin(math.pi * u) ** 1.2
        pitch = -.22 * roll * (1 - ease(u / .35)) + .14 * roll * bump(u, .45, 1.0)  # toes up to reach
        toe = .22 * roll * (1 - ease(u / .3)) + .25 * roll * bump(u, .05, .45)      # the toes flick
    if reverse:
        travel = -travel; pitch = -pitch * .6
    leg(n, travel, up, lateral * (1 - 2 * abs(.5 - (c % 1.0))) if lateral else 0.0, drop, pitch, toe)


def key_all(frame):
    for p in pb:
        p.keyframe_insert('rotation_euler', frame=frame, group=p.name)
        p.keyframe_insert('location', frame=frame, group=p.name)
        p.keyframe_insert('scale', frame=frame, group=p.name)
        # Leg bones were posed through matrices: their basis is what gets keyed.


def secondary(t, bounce, sway, gust=0.0):
    """Ears, pack and hip rag lag the body: `bounce` is the vertical bob signal, `sway` the roll."""
    for s, n in SIDES:
        pb['ear_' + n].rotation_euler.x = -.10 * bounce - .14 * gust + .03 * math.sin(t * 7 + s)
        pb['ear_' + n].rotation_euler.z = s * .05 * sway
    pb['pack'].rotation_euler.x = .05 * bounce
    pb['pack'].location.z = .004 * bounce
    pb['hipcloth'].rotation_euler.x = -.12 * bounce - .2 * gust
    pb['hipcloth'].rotation_euler.z = .10 * sway


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


def author(name, seconds, fn, loop=True, stabilize=0.0):
    action = bpy.data.actions.new(name); action.use_fake_user = True
    rig.animation_data.action = action
    frames = max(2, round(seconds * FPS))
    for frame in range(frames + 1):
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


# ------------------------------------------------------------------ idle: a calm, heavy breath
def idle(t, sec):
    ph = math.tau * t
    breath = math.sin(ph * 2)           # two slow breaths in the 4 s loop
    shift = math.sin(ph)                # one weight shift from foot to foot
    pb['belly'].scale.x = 1 + .012 * breath; pb['belly'].scale.z = 1 + .030 * breath
    pb['chest'].rotation_euler.x = -.012 * breath
    pb['spine'].rotation_euler.z = .018 * shift
    pb['chest'].rotation_euler.z = -.010 * shift
    pb['neck'].rotation_euler.z = -.006 * shift
    look = .05 * math.sin(ph + .6) + .03 * math.sin(ph * 3)
    pb['head'].rotation_euler.z = look          # a slow look around
    pb['head'].rotation_euler.x = .02 * math.sin(ph * 2 + 1)
    for s, n in SIDES:
        leg(n, 0, 0, 0, .004 + .004 * (1 + s * shift) * .5)
        flick = bump(t, .30, .36) if n == 'L' else bump(t, .71, .76)
        pb['ear_' + n].rotation_euler.x = .03 * math.sin(ph + s) - .30 * flick
        pb['blink_' + n].scale.y = blink(t, .62)
    pb['jaw'].rotation_euler.x = .02 * bump(t, .45, .52)        # a chew
    pb['pack'].rotation_euler.x = .01 * breath
    pb['hipcloth'].rotation_euler.z = .04 * math.sin(ph + 1)


author('idle', 4.0, idle, stabilize=.9)


# ------------------------------------------------------------------ walk: the waddle
def walk_like(stride, lift, cadence_drop, lean, reverse=False, lateral=0.0, crouch=0.0, name_side=None):
    def fn(t, sec):
        ph = math.tau * t
        for i, (s, n) in enumerate(SIDES):
            gait(n, t + i * .5, stride, lift, lateral=lateral, reverse=reverse, drop=crouch + cadence_drop * (.5 + .5 * math.cos(2 * ph)), roll=.7 if crouch else 1.0)
        bob = math.cos(2 * ph)                              # low at each contact
        pb['spine'].location.y = -crouch - cadence_drop * (.5 + .5 * bob)
        roll = math.sin(ph)
        pb['spine'].rotation_euler.z = .07 * roll           # the waddle: weight over the stance foot
        pb['spine'].rotation_euler.y = .06 * roll * (-1 if reverse else 1)
        pb['chest'].rotation_euler.z = -.035 * roll
        pb['chest'].rotation_euler.y = -.05 * roll
        pb['spine'].rotation_euler.x = lean
        pb['chest'].rotation_euler.x = lean * .5 + .012 * bob
        pb['neck'].rotation_euler.x = -lean * 1.2
        pb['head'].rotation_euler.x = -lean * .3 - .012 * bob  # the head floats level
        pb['neck'].rotation_euler.z = -.02 * roll
        pb['belly'].scale.y = 1 - .03 * bob                 # belly settles at contact
        if lateral:
            pb['spine'].rotation_euler.z += (.05 if lateral > 0 else -.05)
        secondary(sec, bob, roll)
        for s, n in SIDES:
            pb['arm_' + n].rotation_euler.x = .10 * math.sin(ph + (0 if n == 'L' else math.pi)) * (-1 if reverse else 1)
            pb['blink_' + n].scale.y = blink(t, .8, .05)
    return fn


report['locomotionSpeed'] = {'walk': 3.9, 'run': 6.4, 'crouch_walk': 2.1}
author('walk', .56, walk_like(.24, .10, .030, -.04), stabilize=.9)
author('backpedal', .60, walk_like(.17, .075, .018, .04, reverse=True), stabilize=.9)
author('strafe_l', .58, walk_like(.08, .075, .018, -.02, lateral=-.10), stabilize=.9)
author('strafe_r', .58, walk_like(.08, .075, .018, -.02, lateral=.10), stabilize=.9)


# ------------------------------------------------------------------ run: a bounding scurry
def run(t, sec):
    ph = math.tau * t
    for i, (s, n) in enumerate(SIDES):
        gait(n, t + i * .5, .27, .17, contact=.42, drop=.030 * (.5 + .5 * math.cos(2 * ph - .5)))
    bob = math.cos(2 * ph - .5)
    pb['spine'].location.y = -.030 * (.5 + .5 * bob) + .012
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


author('run', .40, run, stabilize=.9)


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


def crouch_walk(t, sec):
    ph = math.tau * t
    for i, (s, n) in enumerate(SIDES):
        gait(n, t + i * .5, .15, .06, drop=CROUCH_DROP + .012 * (.5 + .5 * math.cos(2 * ph)), roll=.6)
    crouch_pose(ph)
    roll = math.sin(ph)
    pb['spine'].rotation_euler.z = .05 * roll
    pb['spine'].rotation_euler.y = .05 * roll
    pb['spine'].location.y -= .012 * (.5 + .5 * math.cos(2 * ph))
    secondary(sec, math.cos(2 * ph), roll)


author('crouch_walk', .64, crouch_walk, stabilize=.95)


# ------------------------------------------------------------------ air
def jump(t, sec):
    # Launch: legs extend and trail, then tuck; arms rise; ears stream back.
    ext = ease(t / .25); tuck = ease((t - .25) / .5)
    for s, n in SIDES:
        leg(n, .04 * tuck - .06 * ext * (1 - tuck), .10 * tuck + .02 * ext, .01, .02 * (1 - ext), -.25 * ext * (1 - tuck) + .1 * tuck, .3 * ext * (1 - tuck))
        pb['arm_' + n].rotation_euler.x = -.25 * ext
        pb['arm_' + n].rotation_euler.z = -.25 * (1 if n == 'L' else -1) * ext
    pb['spine'].rotation_euler.x = .04 * ext - .05 * tuck
    pb['neck'].rotation_euler.x = .03 * tuck
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
            if expression == 'determined':
                lid.scale.y = .66
                brow.location.y = -.005
                brow.rotation_euler.z = sign * .22
                ear.rotation_euler.x = -.14
            elif expression == 'hit':
                lid.scale.y = .28
                brow.location.y = .007
                ear.rotation_euler.x = -.45
                mouth.location.y = -.006
                pb['jaw'].rotation_euler.x = .10
            elif expression == 'stunned':
                lid.scale.y = 1.22 if side == 'R' else .52
                brow.location.y = .008 if side == 'R' else -.003
                ear.rotation_euler.z = sign * .40
                ear.location.y = -.012
                pb['jaw'].rotation_euler.x = .16
            elif expression == 'victory':
                lid.scale.y = .42
                brow.location.y = .004
                mouth.location.y = .009
                ear.rotation_euler.x = .12
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
bpy.ops.export_scene.gltf(filepath=str(OUT / 'capybara.raw.glb'), export_format='GLB', export_vertex_color='NAME', export_vertex_color_name='Color', export_animations=True, export_animation_mode='ACTIONS', export_nla_strips=False, export_frame_range=False, export_force_sampling=True, export_skins=True, export_influence_nb=4, export_yup=True, export_extras=True, export_cameras=False, export_lights=False, export_attributes=True, export_tangents=True, export_image_format='WEBP', export_image_quality=95)
(OUT / 'blender-report.json').write_text(json.dumps(report, indent=2) + '\n')
print('CAPYBARA_REPORT ' + json.dumps(report))
