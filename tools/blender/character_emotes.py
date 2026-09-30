"""Social clips for the v6 capybara, in place (host-owned durations), with IK arms.

Called from capybara_clips.py with its leg/author/secondary/blink helpers. The capybara's
emotes are unhurried and a little smug: a lazy wave, a hip-rolling samba, a two-paw cheer,
sitting back on its haunches, and the iconic belly-down loaf ("chill").
"""
import math
import bpy
from mathutils import Matrix, Vector


def add_emotes(rig, scene, report, leg, author, secondary, blink):
    pb = rig.pose.bones
    REST = {b.name: b.bone.matrix_local.copy() for b in pb}
    LEN = {b.name: b.bone.length for b in pb}

    def ease(t):
        t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)

    def Vg(p):
        return Vector((p[0], -p[2], p[1]))

    def mix(a, b, t):
        return tuple(x + (y - x) * t for x, y in zip(a, b))

    def update():
        bpy.context.view_layer.update()

    def aim(name, head, tail):
        rest = REST[name]
        rest_dir = (rest.to_3x3() @ Vector((0, 1, 0))).normalized()
        swing = rest_dir.rotation_difference((tail - head).normalized())
        m = (swing.to_matrix() @ rest.to_3x3()).to_4x4(); m.translation = head
        pb[name].matrix = m; update()

    def arm(n, hand, elbow):
        """Two-bone IK in armature space from the current shoulder to `hand`, bending toward `elbow`
        (both game space). The twist bone follows the forearm."""
        shoulder = pb['arm_' + n].matrix.to_translation()
        target, hint = Vg(hand), Vg(elbow)
        l1, l2 = LEN['arm_' + n], LEN['forearm_' + n]
        d = target - shoulder
        dist = min(max(d.length, abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3)
        axis = d.normalized(); target = shoulder + axis * dist
        pole = hint - shoulder; pole = (pole - axis * pole.dot(axis)).normalized()
        a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
        knee = shoulder + axis * a + pole * math.sqrt(max(0.0, l1 * l1 - a * a))
        aim('arm_' + n, shoulder, knee)
        aim('forearm_' + n, knee, target)

    def paw(n, fwd, palm, weight=1.0):
        """Orient the paw: knuckles along `fwd`, palm facing `palm` (game space), blended by weight."""
        bone = pb['paw_' + n]
        y = Vg(fwd).normalized(); z = -Vg(palm).normalized()
        x = y.cross(z).normalized(); z = x.cross(y).normalized()
        want = Matrix((x, y, z)).transposed().to_4x4()
        cur = bone.matrix.copy()
        q = cur.to_quaternion().slerp(want.to_quaternion(), weight)
        m = q.to_matrix().to_4x4(); m.translation = cur.translation
        bone.matrix = m; update()

    def curl(n, amount):
        for f in ('index', 'middle', 'ring'):
            for k in (1, 2, 3):
                pb[f'paw_{f}{k}_{n}'].rotation_euler.x = amount * (.8 if k == 1 else 1.0)
        for k in (1, 2, 3):
            pb[f'paw_thumb{k}_{n}'].rotation_euler.x = amount * .5

    SIDES = [(-1, 'L'), (1, 'R')]
    # Resting arm targets (game space): hanging at the sides, paws by the belt pouches.
    REST_HAND = {s: (s * .33, .80, -.16) for s, _ in SIDES}
    REST_ELBOW = {s: (s * .34, 1.02, .02) for s, _ in SIDES}

    specs = [('wave', 3, False), ('dance', 8, True), ('victory', 4, False),
             ('sit', 12, True), ('chill', 12, True), ('boing', 1.05, False)]

    def emote(name, seconds, loop):
        def fn(t, sec):
            ph = math.tau * t
            env = 1 if loop else ease(t / .14) * (1 - ease((t - .84) / .16))
            spine = pb['spine']
            breath = math.sin(ph * (seconds / 2))
            pb['belly'].scale.z = 1 + .025 * breath
            hands = {}
            if name == 'wave':
                # A lazy, friendly wave: weight on one hip, the paw swinging from the wrist.
                for s, n in SIDES:
                    leg(n, 0, 0, .01, .006, 0, 0)
                spine.rotation_euler.z = -.04 * env
                pb['chest'].rotation_euler.z = .03 * env
                pb['head'].rotation_euler.z = .06 * env + .02 * math.sin(ph * 3)
                pb['head'].rotation_euler.y = -.10 * env
                swing = math.sin(sec * 7.5)
                hands[-1] = (REST_HAND[-1], REST_ELBOW[-1])
                hands[1] = (mix(REST_HAND[1], (.46 + .05 * swing, 1.74, -.12), env), mix(REST_ELBOW[1], (.52, 1.38, .02), env))
            elif name == 'dance':
                # Samba: hips roll on the beat, knees pump, paws roll forward and clap every bar.
                beat = ph * 8
                hop = .025 * max(0, math.sin(beat)) ** 2
                for i, (s, n) in enumerate(SIDES):
                    pump = max(0, math.sin(beat + i * math.pi))
                    leg(n, .03 * math.sin(beat / 2 + i * math.pi), .05 * pump, .03, .05 - hop, .1 * pump, .2 * pump, spread=.3)
                spine.rotation_euler.z = .12 * math.sin(beat / 2)
                spine.rotation_euler.y = .10 * math.sin(beat / 2 + .7)
                pb['chest'].rotation_euler.z = -.08 * math.sin(beat / 2)
                spine.location.y = -.05 + hop
                pb['head'].rotation_euler.z = -.06 * math.sin(beat / 2) + .03 * math.sin(beat)
                pb['head'].rotation_euler.x = .04 * math.sin(beat + .5)
                clap = max(0, math.cos(beat / 2)) ** 10
                for s, n in SIDES:
                    roll = math.sin(beat / 2 + (0 if s < 0 else math.pi))
                    hand = (s * (.26 + .07 * roll), 1.02 + .10 * roll, -.34)
                    hands[s] = (mix(hand, (s * .05, 1.16, -.36), clap), (s * (.36 + .04 * roll), 1.06 + .05 * roll, -.08))
                secondary(sec, math.sin(beat), math.sin(beat / 2))
            elif name == 'victory':
                # Both paws punch up, a proud little bounce on the toes.
                bounce = .02 * max(0, math.sin(ph * 6)) * env
                for s, n in SIDES:
                    leg(n, 0, bounce * .6, .02, .01 - bounce, -.3 * bounce / .02, .3 * bounce / .02)
                spine.rotation_euler.x = .04 * env
                pb['neck'].rotation_euler.x = -.06 * env
                pb['head'].rotation_euler.x = -.10 * env
                for s, n in SIDES:
                    hands[s] = (mix(REST_HAND[s], (s * .42, 1.86 + .02 * math.sin(ph * 6), -.06), env), mix(REST_ELBOW[s], (s * .52, 1.50, .02), env))
            elif name == 'sit':
                # Back on the haunches, belly out, paws resting on the knees.
                for s, n in SIDES:
                    leg(n, -.14, 0, .06, .42, .0, 0, spread=.9)
                spine.location.y = -.42
                spine.rotation_euler.x = .12
                pb['chest'].rotation_euler.x = -.04
                pb['neck'].rotation_euler.x = -.08
                pb['head'].rotation_euler.z = .05 * math.sin(ph * 3)
                pb['belly'].scale.x = 1 + .04 + .01 * breath
                for s, n in SIDES:
                    hands[s] = ((s * .24, .44, -.33), (s * .36, .62, -.12))
            elif name == 'chill':
                # The loaf: belly down, legs folded under, chin up, eyes half shut.
                for s, n in SIDES:
                    leg(n, .10, 0, .04, .50, -.4, .5, spread=.8)
                spine.location.y = -.42
                spine.rotation_euler.x = -1.30
                pb['chest'].rotation_euler.x = -.12
                pb['neck'].rotation_euler.x = 1.05
                pb['head'].rotation_euler.x = .32 + .02 * math.sin(ph * 2)
                pb['belly'].scale.z = 1 + .03 * breath
                for s, n in SIDES:
                    hands[s] = ((s * .22, .07, -.78), (s * .34, .22, -.52))
            elif name == 'boing':
                # Airborne tuck opening into a happy star (the host owns the flight).
                elapsed = t * seconds
                tuck = ease(elapsed / .10) * (1 - ease((elapsed - .18) / .20))
                star = ease((elapsed - .12) / .23) * (1 - ease((elapsed - .74) / .25))
                for s, n in SIDES:
                    leg(n, .06 * tuck, .16 * tuck, .10 * star, 0, .2 * tuck, 0, spread=.5 * star)
                spine.rotation_euler.x = -.035 * tuck + .025 * star
                pb['head'].rotation_euler.x = -.065 * star
                pb['jaw'].rotation_euler.x = .045 * star
                for s, n in SIDES:
                    hand = mix(mix(REST_HAND[s], (s * .17, 1.28, -.33), tuck), (s * .50, 1.52, -.14), star)
                    elbow = mix(mix(REST_ELBOW[s], (s * .30, 1.10, -.20), tuck), (s * .46, 1.28, -.04), star)
                    hands[s] = (hand, elbow)
                secondary(elapsed, -star, 0, gust=star)
            update()
            for s, n in SIDES:
                hand, elbow = hands.get(s, (REST_HAND[s], REST_ELBOW[s]))
                arm(n, hand, elbow)
                if name == 'wave' and n == 'R':
                    paw(n, (0, 1, -.2), (0, .1, -1), env)
                    pb['paw_' + n].rotation_euler.z += .35 * math.sin(sec * 7.5) * env
                elif name == 'victory':
                    paw(n, (0, 1, 0), (0, 0, -1), env); curl(n, 1.1 * env)
                elif name == 'dance':
                    paw(n, (s * .2, .4, -1), (-s, 0, 0), .8)
                elif name == 'chill':
                    paw(n, (0, 0, -1), (0, -1, 0))
                elif name == 'boing':
                    paw(n, (s * .3, 1, 0), (0, 0, -1), 1.0)
                else:
                    curl(n, .25)
                pb['blink_' + n].scale.y = (.30 + .02 * math.sin(ph)) if name == 'chill' else blink(t, .68, .03)
                pb['ear_' + n].rotation_euler.x += .03 * math.sin(ph * 2 + s)
        return fn

    for name, seconds, loop in specs:
        action = author(name, seconds, emote(name, seconds, loop), loop=loop)
        action['loop'] = loop
        action['inPlace'] = True
    report['emotes'] = {name: dict(seconds=seconds, loop=loop, inPlace=True) for name, seconds, loop in specs if name != 'boing'}
    report['bounce'] = dict(clip='boing', seconds=1.05, starAt=.35, inPlace=True)
