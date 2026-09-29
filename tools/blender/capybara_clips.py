"""Clip library shared by the capybara builds (executed inside the build script
with `rig`, `scene`, `report`, `OUT` in scope)."""
# Explicit actions on one rig. Blink bones scale their small eye meshes; no morph
# targets or per-instance face materials are required.
rig.animation_data_create()
for name, frames in [('idle', 75), ('jump', 30)]:
    action = bpy.data.actions.new(name)
    rig.animation_data.action = action
    action.use_fake_user = True
    for frame in range(frames + 1):
        scene.frame_set(frame)
        t = frame / frames
        phase = math.tau * t
        for p in rig.pose.bones:
            p.rotation_mode = 'XYZ'
            p.rotation_euler = (0, 0, 0)
            p.location = (0, 0, 0)
            p.scale = (1, 1, 1)
        rig.pose.bones['mouth_cavity'].scale.y = .6
        if name == 'idle':
            rig.pose.bones['spine'].scale.x = 1 + .003 * math.sin(phase)
            rig.pose.bones['head'].rotation_euler.z = .025 * math.sin(phase)
            blink = max(.04, 1 - max(0, 1 - abs(frame - 52) / 3))
            for side in ['L', 'R']:
                rig.pose.bones['blink_' + side].scale.y = blink
                rig.pose.bones['ear_' + side].rotation_euler.x = .04 * math.sin(phase + (0 if side == 'L' else 1))
        elif name == 'run':
            for s, side in [(-1, 'L'), (1, 'R')]:
                wave = math.sin(phase) * s
                rig.pose.bones['thigh_' + side].rotation_euler.x = .72 * wave
                rig.pose.bones['shin_' + side].rotation_euler.x = -.9 * max(0, -wave)
                rig.pose.bones['foot_' + side].rotation_euler.x = -.72 * wave + .9 * max(0, -wave)
                rig.pose.bones['arm_' + side].rotation_euler.x = -.08 * wave
        else:
            lift = math.sin(math.pi * t)
            for side in ['L', 'R']:
                rig.pose.bones['thigh_' + side].rotation_euler.x = .45 * lift
                rig.pose.bones['shin_' + side].rotation_euler.x = -.8 * lift
                rig.pose.bones['arm_' + side].rotation_euler.x = -.18 * lift
            rig.pose.bones['jaw'].rotation_euler.x = .06 * lift
        for p in rig.pose.bones:
            p.keyframe_insert('rotation_euler', frame=frame, group=p.name)
            p.keyframe_insert('location', frame=frame, group=p.name)
            p.keyframe_insert('scale', frame=frame, group=p.name)
# Phase A locomotion uses a fixed foot-contact interval and smooth airborne return.
# Clips are in-place; runtime alone owns position and time-scales the authored gait.
def smooth01(t):
    return t * t * (3 - 2 * t)


def contact_leg(side, phase, stride, lift, lateral=0, reverse=False, crouch=0):
    cycle = phase % 1
    contact = .52
    if cycle < contact:
        travel = 1 - 2 * cycle / contact
        height = .065
    else:
        swing = (cycle - contact) / (1 - contact)
        travel = -1 + 2 * smooth01(swing)
        height = .065 + lift * math.sin(math.pi * swing) ** 1.4
    forward = travel * stride * (-1 if reverse else 1)
    thigh_rest = rig.data.bones['thigh_' + side]
    shin_rest = rig.data.bones['shin_' + side]
    down = thigh_rest.head_local.z - .055 - crouch - height
    # Read the authored lengths so proportion changes retain planted feet.
    upper, lower = thigh_rest.length, shin_rest.length
    reach = min(upper + lower - .0002, max(.055, math.hypot(forward, down)))
    knee = math.acos(max(-1, min(1, (reach * reach - upper * upper - lower * lower) / (2 * upper * lower))))
    hip = math.atan2(forward, max(.025, down)) + math.atan2(lower * math.sin(knee), upper + lower * math.cos(knee))
    rest_shin = shin_rest.tail_local - shin_rest.head_local
    shin = -knee - math.atan2(abs(rest_shin.y), abs(rest_shin.z))
    thigh_bone = rig.pose.bones['thigh_' + side]
    thigh_bone.location.y = .055 + crouch
    thigh_bone.rotation_euler.x = hip
    thigh_bone.rotation_euler.z = lateral * travel
    rig.pose.bones['shin_' + side].rotation_euler.x = shin
    rig.pose.bones['foot_' + side].rotation_euler.x = -hip - shin
    rig.pose.bones['foot_' + side].rotation_euler.z = -lateral * travel


new_clips = [('run', 10), ('walk', 12), ('strafe_l', 13), ('strafe_r', 13), ('backpedal', 14),
             ('crouch_idle', 72), ('crouch_walk', 16), ('fall', 36), ('land', 16),
             ('reload_tp', 66), ('death', 48)]
report['locomotionSpeed'] = {'walk': 3.9, 'run': 6.4, 'crouch_walk': 2.1}
for name, frames in new_clips:
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.animation_data.action = action
    for frame in range(frames + 1):
        scene.frame_set(frame)
        t = frame / frames
        phase = math.tau * t
        for p in rig.pose.bones:
            p.rotation_mode = 'XYZ'
            p.rotation_euler = (0, 0, 0)
            p.location = (0, 0, 0)
            p.scale = (1, 1, 1)
        rig.pose.bones['mouth_cavity'].scale.y = .6
        if name == 'run':
            # A short-legged dash: quick pinwheel legs, forward lean, a bounce at
            # each push-off, shoulders counter-twisting the hips, ears flopping.
            for i, side in enumerate(['L', 'R']):
                contact_leg(side, (t + i * .5) % 1, .27, .17)
                rig.pose.bones['arm_' + side].rotation_euler.x = .07 * math.sin(2 * phase + .6)
                rig.pose.bones['ear_' + side].rotation_euler.x = -.12 + .14 * math.sin(2 * phase - .9 + i * .4)
            rig.pose.bones['spine'].location.y = .025 * max(0, math.sin(2 * phase - .5))
            rig.pose.bones['spine'].rotation_euler.x = -.03 + .015 * math.sin(2 * phase)
            rig.pose.bones['spine'].rotation_euler.y = .06 * math.sin(phase)
            rig.pose.bones['spine'].rotation_euler.z = .02 * math.sin(phase)
            rig.pose.bones['neck'].rotation_euler.x = .05 - .02 * math.sin(2 * phase)
            rig.pose.bones['neck'].rotation_euler.y = -.08 * math.sin(phase)
            rig.pose.bones['tail'].rotation_euler.z = .25 * math.sin(phase)
        elif name in ['walk', 'strafe_l', 'strafe_r', 'backpedal', 'crouch_walk']:
            crouch = .075 if name == 'crouch_walk' else 0
            lateral = (-.28 if name == 'strafe_l' else .28) if name.startswith('strafe') else 0
            for i, side in enumerate(['L', 'R']):
                leg_phase = (t + i * .5) % 1
                contact_leg(side, leg_phase, .1 if lateral else .15 if crouch else .21, .06 if crouch else .11,
                            lateral=lateral, reverse=name == 'backpedal', crouch=crouch)
                rig.pose.bones['arm_' + side].rotation_euler.x = (-1 if i else 1) * .04 * math.sin(phase - .2)
                rig.pose.bones['ear_' + side].rotation_euler.x = .05 * math.sin(2 * phase - .45 + i * .3)
            # The capybara waddle: weight rolls side to side over the stance foot.
            rig.pose.bones['spine'].rotation_euler.z = .035 * math.sin(phase)
            rig.pose.bones['spine'].rotation_euler.y = .05 * math.sin(phase)
            rig.pose.bones['neck'].rotation_euler.z = -.035 * math.sin(phase)
            rig.pose.bones['tail'].rotation_euler.z = .18 * math.sin(phase)
            rig.pose.bones['spine'].rotation_euler.x = -.07 if crouch else -.018
            rig.pose.bones['spine'].location.y = (-.12 if crouch else 0) + .018 * max(0, math.sin(2 * phase - .4))
            rig.pose.bones['neck'].rotation_euler.x = .07 if crouch else .018
        elif name == 'crouch_idle':
            for side in ['L', 'R']:
                contact_leg(side, .26, 0, 0, crouch=.075)
            rig.pose.bones['spine'].location.y = -.12
            rig.pose.bones['spine'].rotation_euler.x = -.07
            rig.pose.bones['neck'].rotation_euler.x = .07
            rig.pose.bones['spine'].scale.x = 1 + .003 * math.sin(phase)
        elif name == 'fall':
            for i, side in enumerate(['L', 'R']):
                rig.pose.bones['thigh_' + side].rotation_euler.x = .20 + .07 * math.sin(phase + i * math.pi)
                rig.pose.bones['shin_' + side].rotation_euler.x = -.48
                rig.pose.bones['arm_' + side].rotation_euler.x = -.22 + .018 * math.sin(phase)
                rig.pose.bones['arm_' + side].rotation_euler.z = (-1 if i else 1) * .19
                rig.pose.bones['ear_' + side].rotation_euler.x = -.09 + .02 * math.sin(phase)
        elif name == 'land':
            compression = math.sin(math.pi * min(1, t / .42)) ** 1.2 if t < .42 else 0
            settle = math.sin((t - .42) / .58 * math.pi) * .018 if t >= .42 else 0
            rig.pose.bones['spine'].location.y = -.07 * compression + settle
            for side in ['L', 'R']:
                contact_leg(side, .26, 0, 0, crouch=.035 * compression)
                rig.pose.bones['arm_' + side].rotation_euler.x = .08 * compression
                rig.pose.bones['ear_' + side].rotation_euler.x = -.08 * compression + .025 * math.sin(phase)
        elif name == 'reload_tp':
            # The gun cants in, the support paw drops the magazine, fetches a new
            # one from the belt, seats it with a shove and slaps the gun ready.
            tilt = smooth01(min(1, t / .12)) * (1 - smooth01(max(0, (t - .82) / .18)))
            fetch = math.sin(math.pi * max(0, min(1, (t - .16) / .46)))
            shove = math.sin(math.pi * max(0, min(1, (t - .62) / .12)))
            slap = math.sin(math.pi * max(0, min(1, (t - .78) / .08)))
            rig.pose.bones['arm_R'].rotation_euler.x = .22 * tilt + .06 * shove
            rig.pose.bones['arm_R'].rotation_euler.z = -.3 * tilt
            rig.pose.bones['forearm_R'].rotation_euler.y = .35 * tilt
            rig.pose.bones['arm_L'].rotation_euler.x = -.55 * fetch + .12 * shove
            rig.pose.bones['arm_L'].rotation_euler.z = -.25 * fetch
            rig.pose.bones['forearm_L'].rotation_euler.x = .5 * fetch - .2 * slap
            rig.pose.bones['paw_L'].rotation_euler.y = .4 * fetch
        else:
            anticipation = math.sin(math.pi * min(1, t / .14)) * .06 if t < .14 else 0
            collapse = smooth01(max(0, min(1, (t - .10) / .58)))
            rebound = math.sin(max(0, min(1, (t - .68) / .32)) * math.pi) * (1 - t) * .06
            rig.pose.bones['root'].rotation_euler.z = -1.52 * collapse + rebound
            rig.pose.bones['root'].location.y = .26 * collapse
            rig.pose.bones['spine'].rotation_euler.x = anticipation + .20 * collapse
            for i, side in enumerate(['L', 'R']):
                rig.pose.bones['thigh_' + side].rotation_euler.x = (.5 if i else -.24) * collapse
                rig.pose.bones['shin_' + side].rotation_euler.x = -.7 * collapse
                rig.pose.bones['arm_' + side].rotation_euler.z = (.7 if i else -.3) * collapse
                rig.pose.bones['forearm_' + side].rotation_euler.x = .3 * collapse
        for p in rig.pose.bones:
            p.keyframe_insert('rotation_euler', frame=frame, group=p.name)
            p.keyframe_insert('location', frame=frame, group=p.name)
            p.keyframe_insert('scale', frame=frame, group=p.name)
    report['clips'].append(name)

from character_emotes import add_emotes
add_emotes(rig, scene, report, contact_leg)

# Facial clips key only eyelids, brow tufts, ears and mouth. Skull and muzzle
# have no tracks here. Runtime can blend these additively over locomotion,
# referencing face_neutral through AnimationUtils.makeClipAdditive.
face_parts = [p for p in rig.pose.bones if p.name.startswith(('blink_', 'socket_', 'glint_', 'brow_', 'ear_', 'mouth_')) or p.name == 'jaw']
for expression in ['neutral', 'determined', 'hit', 'stunned', 'victory', 'blink']:
    action = bpy.data.actions.new('face_' + expression)
    action.use_fake_user = True
    rig.animation_data.action = action
    for frame in [0, 8]:
        scene.frame_set(frame)
        for p in face_parts:
            p.rotation_euler = (0, 0, 0)
            p.location = (0, 0, 0)
            p.scale = (1, 1, 1)
        rig.pose.bones['mouth_cavity'].scale.y = 1 if expression in ['hit', 'stunned', 'victory'] else .6
        if expression == 'victory':
            rig.pose.bones['mouth_cavity'].scale.x = 1.25
            # Almost closed, with raised corners: a grin rather than an open O.
            rig.pose.bones['mouth_cavity'].scale.y = .08
        for sign, side in [(-1, 'L'), (1, 'R')]:
            lid = rig.pose.bones['blink_' + side]
            if expression in ['hit', 'victory', 'blink']:
                rig.pose.bones['glint_' + side].scale = (.001, .001, .001)
            brow = rig.pose.bones['brow_' + side]
            ear = rig.pose.bones['ear_' + side]
            mouth = rig.pose.bones['mouth_' + side]
            if expression == 'determined':
                lid.scale.y = .5
                brow.rotation_euler.z = sign * .28
                brow.location.y = -.006
                ear.rotation_euler.x = -.10
            elif expression == 'hit':
                lid.scale.x = .12
                lid.scale.y = .72
                rig.pose.bones['blink_tip_' + side].location.x = -sign * .33
                brow.rotation_euler.z = -sign * .28
                brow.location.y = .010
                ear.rotation_euler.x = -.436
                ear.location.y = -.014
                ear.location.z = -.012
                mouth.location.y = -.005 if side == 'L' else -.003
                mouth.location.z = .005
                rig.pose.bones['jaw'].location.y = -.015
                rig.pose.bones['jaw'].location.z = .005
            elif expression == 'stunned':
                lid.scale.y = 1.50 if side == 'R' else .65
                lid.scale.x = 1.22 if side == 'R' else .82
                rig.pose.bones['socket_' + side].scale = lid.scale.copy()
                brow.rotation_euler.z = sign * (.12 if side == 'L' else -.12)
                ear.rotation_euler.z = sign * .36
                ear.location.y = -.025
                rig.pose.bones['jaw'].location.y = -.018
                rig.pose.bones['jaw'].location.z = .005
            elif expression == 'victory':
                lid.scale.y = .14
                rig.pose.bones['blink_peak_' + side].location.y = .22
                brow.location.y = .006
                # Corner bones inherit the cavity's vertical scale.
                mouth.location.y = .10
                ear.rotation_euler.x = .10
                rig.pose.bones['jaw'].scale.x = 1.04
            elif expression == 'blink':
                lid.scale.y = .04
        for p in face_parts:
            p.keyframe_insert('rotation_euler', frame=frame, group=p.name)
            p.keyframe_insert('location', frame=frame, group=p.name)
            p.keyframe_insert('scale', frame=frame, group=p.name)

rig.animation_data.action = None
scene.frame_set(0)
for p in rig.pose.bones:
    p.rotation_euler = (0, 0, 0)
    p.location = (0, 0, 0)
    p.scale = (1, 1, 1)
scene.frame_start, scene.frame_end = 0, 120
bpy.ops.export_scene.gltf(filepath=str(OUT / 'capybara.raw.glb'), export_format='GLB', export_vertex_color='NAME', export_vertex_color_name='Color', export_animations=True, export_animation_mode='ACTIONS', export_nla_strips=False, export_frame_range=False, export_force_sampling=True, export_skins=True, export_influence_nb=4, export_yup=True, export_extras=True, export_cameras=False, export_lights=False, export_attributes=True, export_image_format='WEBP', export_image_quality=95)
(OUT / 'blender-report.json').write_text(json.dumps(report, indent=2) + '\n')
print('CAPYBARA_REPORT ' + json.dumps(report))
