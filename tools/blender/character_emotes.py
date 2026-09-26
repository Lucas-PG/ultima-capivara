"""Original in-place social clips on the existing 35-joint capybara rig."""
import math
import bpy
from mathutils import Matrix, Vector


def add_emotes(rig, scene, report, contact_leg):
    def ease(t):
        t = max(0, min(1, t))
        return t * t * (3 - 2 * t)

    def V(p):
        return Vector((p[0], -p[2], p[1]))

    def point(a, b, t):
        return tuple(x + (y - x) * t for x, y in zip(a, b))

    rest = {bone.name: bone.bone.matrix_local.copy() for bone in rig.pose.bones}
    relative = {bone.name: rest[bone.parent.name].inverted() @ rest[bone.name] if bone.parent else rest[bone.name]
                for bone in rig.pose.bones}

    def posed(bone):
        # This rig has no constraints or nonstandard inheritance. Compose its
        # local transform directly so solving four arm aims does not repeatedly
        # evaluate all three skinned meshes for each authored frame.
        basis = Matrix.Translation(bone.location) @ bone.rotation_euler.to_matrix().to_4x4() @ Matrix.Diagonal((*bone.scale, 1))
        parent = posed(bone.parent) if bone.parent else Matrix.Identity(4)
        return parent @ relative[bone.name] @ basis

    def aim(name, target):
        # Rotate in the evaluated parent frame; preserve the authored bone head
        # and its length, rather than translating a hand away from the forearm.
        bone = rig.pose.bones[name]
        current = posed(bone)
        head, tail = current.translation, current @ Vector((0, bone.bone.length, 0))
        swing = (tail - head).rotation_difference(V(target) - head)
        desired = swing @ current.to_quaternion()
        frame = (posed(bone.parent) if bone.parent else Matrix.Identity(4)) @ relative[name]
        bone.rotation_euler = (frame.to_quaternion().inverted() @ desired).to_euler('XYZ')

    def arms(side, elbow, hand):
        # Solve both lengths before aiming. In particular, the two forearms have
        # different bind lengths, so independent aims would miss a shared clap.
        arm, forearm = rig.pose.bones['arm_' + side], rig.pose.bones['forearm_' + side]
        shoulder = posed(arm).translation
        delta = V(hand) - shoulder
        reach = max(.001, delta.length)
        axis = delta / reach
        upper, lower = arm.bone.length, forearm.bone.length
        reach = max(abs(upper - lower) + .001, min(upper + lower - .001, reach))
        pole = V(elbow) - shoulder
        pole -= axis * pole.dot(axis)
        pole.normalize()
        along = (upper * upper - lower * lower + reach * reach) / (2 * reach)
        height = math.sqrt(max(0, upper * upper - along * along))
        solved = shoulder + axis * along + pole * height
        aim('arm_' + side, (solved.x, solved.z, -solved.y))
        aim('forearm_' + side, hand)

    def paw_direction(side, direction, palm_normal, weight=1):
        bone = rig.pose.bones['paw_' + side]
        y_axis, z_axis = V(direction).normalized(), -V(palm_normal).normalized()
        x_axis = y_axis.cross(z_axis).normalized()
        z_axis = x_axis.cross(y_axis).normalized()
        desired = Matrix((x_axis, y_axis, z_axis)).transposed().to_quaternion()
        frame = posed(bone.parent) @ relative[bone.name]
        local = frame.to_quaternion().inverted() @ desired
        bone.rotation_euler = bone.rotation_euler.to_quaternion().slerp(local, weight).to_euler('XYZ')

    specs = [('wave', 3, False), ('dance', 8, True), ('victory', 4, False),
             ('sit', 12, True), ('chill', 12, True)]
    for name, seconds, loop in specs:
        frames = seconds * scene.render.fps
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        action['loop'] = loop
        action['inPlace'] = True
        rig.animation_data.action = action
        # 15 Hz authored poses interpolate smoothly; export resamples to 30 Hz.
        for frame in range(0, frames + 1, 2):
            scene.frame_set(frame)
            # Identical endpoint inputs avoid one-step quaternion quantization
            # differences from sin(2*pi) floating-point residue after export.
            t = 0 if loop and frame == frames else frame / frames
            phase = math.tau * t
            beat = phase * 4
            for bone in rig.pose.bones:
                bone.rotation_mode = 'XYZ'
                bone.rotation_euler = (0, 0, 0)
                bone.location = (0, 0, 0)
                bone.scale = (1, 1, 1)
            rig.pose.bones['mouth_cavity'].scale.y = .18
            envelope = 1 if loop else ease(t / .16) * (1 - ease((t - .82) / .18))
            spine = rig.pose.bones['spine']
            spine.scale.x = 1 + .003 * math.sin(phase)
            if name == 'dance':
                hop = .03 * max(0, math.sin(beat * 2)) ** 2
                spine.rotation_euler.z = .14 * math.sin(beat)
                spine.rotation_euler.x = .035 * math.sin(beat * 2)
                spine.location.x = .038 * math.sin(beat)
                spine.location.y = hop
                for index, side in enumerate(['L', 'R']):
                    contact_leg(side, (t * 4 + index * .5) % 1, .065, .06, lateral=.16)
                    rig.pose.bones['thigh_' + side].location.y -= hop
            elif name == 'sit':
                # Root stays exactly at the contact surface. The existing
                # crouch solver folds the short legs while the torso settles.
                spine.location.y = -.49
                spine.rotation_euler.x = -.035
                rig.pose.bones['neck'].rotation_euler.x = .035
                for side in ['L', 'R']:
                    contact_leg(side, .26, .035, 0, crouch=.18)
            elif name == 'chill':
                # Iconic belly-down capybara loaf. The torso lies forward from
                # the unchanged root while the head counter-rotates to look out.
                spine.location.y = -.36
                spine.rotation_euler.x = -1.46
                rig.pose.bones['head'].rotation_euler.x = 1.46
                for side in ['L', 'R']:
                    contact_leg(side, .26, 0, 0, crouch=.13)
            elif name == 'victory':
                spine.rotation_euler.x = -.025 * envelope
                spine.scale.y = 1 + .018 * math.sin(phase * 2) * envelope

            for sign, side in [(-1, 'L'), (1, 'R')]:
                rest_elbow = (sign * .31, .96, -.055)
                rest_hand = (sign * .33, .77, -.24)
                elbow, hand = rest_elbow, rest_hand
                if name == 'wave' and side == 'R':
                    elbow = point(rest_elbow, (sign * .40, 1.30, -.09), envelope)
                    hand = point(rest_hand, (sign * (.31 + .055 * math.sin(phase * 3)), 1.62, -.17), envelope)
                elif name == 'victory':
                    elbow = point(rest_elbow, (sign * .40, 1.37, -.10), envelope)
                    hand = point(rest_hand, (sign * .30, 1.69 + .014 * math.sin(phase * 2), -.15), envelope)
                elif name == 'dance':
                    roll = math.sin(beat + (0 if sign < 0 else math.pi))
                    clap = max(0, math.cos(beat)) ** 8
                    elbow = (sign * (.32 + .03 * roll), 1.02 + .045 * roll, -.11)
                    hand = point((sign * (.28 + .08 * roll), .91 + .10 * roll, -.39), (sign * .072, 1.14, -.35), clap)
                elif name == 'sit':
                    elbow = (sign * .29, .56, -.08)
                    hand = (sign * .22, .37, -.31)
                elif name == 'chill':
                    elbow = (sign * .32, .19, -.74)
                    hand = (sign * .25, .056 + .002 * math.sin(phase), -.96)
                arms(side, elbow, hand)
                if name in ['wave', 'victory']:
                    rig.pose.bones['paw_' + side].rotation_euler.y = sign * .20 * envelope
                    if name == 'wave' and side == 'R':
                        rig.pose.bones['paw_' + side].rotation_euler.z = .22 * math.sin(phase * 3) * envelope
                elif name == 'dance':
                    paw_direction(side, (0, 1, 0), (-sign, 0, 0), clap)
                elif name == 'chill':
                    paw_direction(side, (0, 0, -1), (0, -1, 0))
                rig.pose.bones['ear_' + side].rotation_euler.x = .022 * math.sin(phase + (0 if sign < 0 else .4))
                if name == 'chill':
                    rig.pose.bones['blink_' + side].scale.y = .12 + .012 * math.sin(phase)
                    rig.pose.bones['glint_' + side].scale = (.01, .01, .01)
                else:
                    blink = max(.06, 1 - max(0, 1 - abs(t - .68) / .02))
                    rig.pose.bones['blink_' + side].scale.y = blink
            rig.pose.bones['head'].rotation_euler.z = .035 * math.sin(beat if name == 'dance' else phase) * envelope
            if name == 'dance':
                rig.pose.bones['head'].rotation_euler.x = .045 * math.sin(beat + .7)
            if frame in [0, frames // 8 * 2, frames]:
                bpy.context.view_layer.update()
                for side in ['L', 'R']:
                    for prefix in ['arm_', 'forearm_']:
                        bone = rig.pose.bones[prefix + side]
                        expected = posed(bone)
                        error = max(abs(expected[row][col] - bone.matrix[row][col]) for row in range(4) for col in range(4))
                        assert error < .0001, (name, frame, bone.name, 'pose composition', error)
            for bone in rig.pose.bones:
                bone.keyframe_insert('rotation_euler', frame=frame, group=bone.name)
                bone.keyframe_insert('location', frame=frame, group=bone.name)
                bone.keyframe_insert('scale', frame=frame, group=bone.name)
        report['clips'].append(name)
    report['emotes'] = {name: dict(seconds=seconds, loop=loop, inPlace=True)
                        for name, seconds, loop in specs}
