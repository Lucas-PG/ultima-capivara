"""Original M0 capybara. Blender 5.0.1; metres, +Y forward, +Z up.
Generated parts start as quad rings, receive subdivision, then budget decimation.
Every LOD uses the same armature and flat 16 x 16 PNG palette atlas.
"""
import bpy
import json
import math
import os
from mathutils import Vector
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/characters'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for data in (bpy.data.actions, bpy.data.materials, bpy.data.images):
    for item in list(data):
        data.remove(item)
scene = bpy.context.scene
scene.render.fps = 30
PALETTE = json.loads((ROOT / 'src/render/capybara-palette.json').read_text())
image = bpy.data.images.new('capybara_palette', width=16, height=16, alpha=False)
pixels = []
for y in range(16):
    for h in PALETTE:
        pixels.extend([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)] + [1])
image.pixels = pixels
image.filepath_raw = str(OUT / 'palette.png')
image.file_format = 'PNG'
image.save()
image.pack()
mat = bpy.data.materials.new('Capivara_palette')
mat.use_nodes = True
bsdf = mat.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Roughness'].default_value = .83
bsdf.inputs['Specular IOR Level'].default_value = .22
texture = mat.node_tree.nodes.new('ShaderNodeTexImage')
texture.image = image
texture.interpolation = 'Closest'
mat.node_tree.links.new(texture.outputs['Color'], bsdf.inputs['Base Color'])

# Coordinates are written in game space, converted to Blender only here.
def V(p):
    return Vector((p[0], -p[2], p[1]))

arm = bpy.data.armatures.new('Capivara_rig')
rig = bpy.data.objects.new('Capivara', arm)
scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
def bone(name, start, end, parent=None):
    b = arm.edit_bones.new(name)
    b.head, b.tail = V(start), V(end)
    if parent:
        b.parent = arm.edit_bones[parent]
    return b
bone('root', (0, 0, 0), (0, .18, 0))
bone('spine', (0, .6, 0), (0, 1.15, 0), 'root')
bone('neck', (0, 1.15, 0), (0, 1.45, -.02), 'spine')
bone('head', (0, 1.6, -.04), (0, 1.78, -.04), 'neck')
bone('jaw', (0, 1.5, -.1), (0, 1.52, -.25), 'head')
bone('tail', (0, .62, .23), (0, .66, .29), 'spine')
for s, side in [(-1, 'L'), (1, 'R')]:
    bone('ear_' + side, (s * .15, 1.755, .005), (s * .16, 1.815, .005), 'head')
    bone('blink_' + side, (s * .137, 1.688, -.172), (s * .137, 1.72, -.172), 'head')
    bone('thigh_' + side, (s * .137, .55, .01), (s * .137, .3, .01), 'root')
    bone('shin_' + side, (s * .137, .3, .01), (s * .137, .09, -.02), 'thigh_' + side)
    bone('foot_' + side, (s * .137, .09, -.02), (s * .137, .09, -.16), 'shin_' + side)
    # Forward hold matches the existing weapon socket at (.1, 1.05, -.4).
    hand = (s * .1, 1.045, -.39 if s == 1 else -.49)
    elbow = (s * .27, 1.00, -.19)
    bone('arm_' + side, (s * .23, 1.2, -.015), elbow, 'spine')
    bone('forearm_' + side, elbow, hand, 'arm_' + side)
    bone('paw_' + side, hand, (hand[0], hand[1], hand[2] - .1), 'forearm_' + side)
bpy.ops.object.mode_set(mode='OBJECT')
rig.select_set(False)
parts = []

def mesh_part(name, verts, faces, color, weights):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([V(p) for p in verts], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    uv = mesh.uv_layers.new(name='Palette')
    for loop in uv.data:
        loop.uv = ((color + .5) / 16, .5)
    groups = {}
    for i, p in enumerate(verts):
        influences = weights(p) if callable(weights) else weights
        for name, weight in influences.items():
            if name not in groups:
                groups[name] = obj.vertex_groups.new(name=name)
            if weight > 0:
                groups[name].add([i], weight, 'REPLACE')
    for poly in mesh.polygons:
        poly.use_smooth = True
    bpy.context.view_layer.objects.active = obj
    sub = obj.modifiers.new('Quad smoothing', 'SUBSURF')
    sub.levels = 1
    bpy.ops.object.modifier_apply(modifier=sub.name)
    # Face, muzzle and ears stay inside the head hit sphere, with 6 mm clearance.
    facial = {g.index for g in obj.vertex_groups if g.name == 'head' or g.name == 'jaw' or g.name.startswith(('ear_', 'blink_'))}
    centre = V((0, 1.6, -.04))
    for vert in obj.data.vertices:
        if sum(g.weight for g in vert.groups if g.group in facial) > .5:
            offset = vert.co - centre
            if offset.length > .244:
                vert.co = centre + offset.normalized() * .244
    parts.append(obj)
    return obj

def blend(a, b, value):
    t = max(0, min(1, value))
    return {a: 1 - t, b: t}

def ellipsoid(name, center, scale, color, weights, square=1, segments=16, rings=10):
    # Ring-based superellipsoid makes the muzzle broad and blunt, never conical.
    verts, faces = [], []
    for j in range(rings + 1):
        lat = -math.pi / 2 + math.pi * j / rings
        radius = max(.001, math.cos(lat))
        for i in range(segments):
            ang = math.tau * i / segments
            def shape(x): return math.copysign(abs(x) ** square, x)
            verts.append((center[0] + scale[0] * radius * shape(math.cos(ang)), center[1] + scale[1] * math.sin(lat), center[2] + scale[2] * radius * shape(math.sin(ang))))
    for j in range(rings):
        for i in range(segments):
            a, b = j * segments + i, j * segments + (i + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    faces.extend([tuple(reversed(range(segments))), tuple(rings * segments + i for i in range(segments))])
    return mesh_part(name, verts, faces, color, weights)

def tube(name, points, radii, color, names):
    verts, faces, weights = [], [], []
    # Continuous quad tube with smoothly blended joints and rounded end caps.
    for j, (p, r) in enumerate(zip(points, radii)):
        normal = (Vector(points[min(j + 1, len(points) - 1)]) - Vector(points[max(0, j - 1)])).normalized()
        axis = normal.cross(Vector((0, 0, 1))).normalized()
        other = normal.cross(axis).normalized()
        for i in range(12):
            off = axis * (math.cos(math.tau * i / 12) * r) + other * (math.sin(math.tau * i / 12) * r)
            verts.append(tuple(Vector(p) + off))
            t = j / (len(points) - 1) * (len(names) - 1)
            k = min(len(names) - 2, int(t))
            weights.append(blend(names[k], names[k + 1], t - k))
    for j in range(len(points) - 1):
        for i in range(12):
            a, b = j * 12 + i, j * 12 + (i + 1) % 12
            faces.append((a, b, b + 12, a + 12))
    faces.extend([tuple(reversed(range(12))), tuple((len(points) - 1) * 12 + i for i in range(12))])
    lookup = {tuple(v): w for v, w in zip(verts, weights)}
    return mesh_part(name, verts, faces, color, lambda p: lookup[tuple(p)])

# Pear torso fits the normal .30 m body cylinder with animation clearance.
# A continuous pear-to-neck surface avoids a stack-of-spheres silhouette.
profile = [(.46, .04, .04), (.49, .14, .14), (.60, .235, .221), (.78, .281, .259), (.96, .283, .263), (1.12, .257, .224), (1.26, .209, .177), (1.35, .163, .143), (1.42, .122, .112), (1.45, .045, .045)]
verts, faces = [], []
for y, rx, rz in profile:
    for i in range(20):
        a = math.tau * i / 20
        verts.append((rx * math.cos(a), y, .005 + rz * math.sin(a)))
for j in range(len(profile) - 1):
    for i in range(20):
        a, b = j * 20 + i, j * 20 + (i + 1) % 20
        faces.append((a, b, b + 20, a + 20))
faces.extend([tuple(reversed(range(20))), tuple((len(profile) - 1) * 20 + i for i in range(20))])
mesh_part('Torso_pear', verts, faces, 0, lambda p: blend('spine', 'neck', (p[1] - 1.04) / .33))
ellipsoid('Chest_cream', (0, .95, -.181), (.204, .285, .083), 4, {'spine': .9, 'neck': .1})
# All facial surfaces fit sphere centred (0,1.6,-.04), radius .25.
ellipsoid('Head', (0, 1.606, -.018), (.224, .214, .197), 0, {'head': 1}, square=.82)
ellipsoid('Muzzle', (0, 1.553, -.168), (.172, .084, .089), 1, {'head': .86, 'jaw': .14}, square=.42)
ellipsoid('Nose', (0, 1.578, -.248), (.088, .035, .023), 3, {'head': 1}, square=.55, segments=12, rings=6)
ellipsoid('Lower_lip', (0, 1.498, -.206), (.094, .013, .028), 3, {'jaw': 1}, segments=12, rings=6)
for s, side in [(-1, 'L'), (1, 'R')]:
    ellipsoid('Eye_' + side, (s * .137, 1.688, -.172), (.035, .038, .020), 9, {'blink_' + side: 1}, segments=12, rings=8)
    ellipsoid('Glint_' + side, (s * .137 - .009, 1.70, -.191), (.010, .011, .005), 10, {'blink_' + side: 1}, segments=8, rings=6)
    ellipsoid('Ear_' + side, (s * .137, 1.75, .012), (.043, .045, .027), 0, {'ear_' + side: .88, 'head': .12}, segments=12, rings=8)
    ellipsoid('Ear_inner_' + side, (s * .137, 1.754, -.009), (.026, .028, .012), 2, {'ear_' + side: 1}, segments=12, rings=6)
    tube('Leg_' + side, [(s * .137, .56, .01), (s * .137, .48, .01), (s * .137, .33, .01), (s * .137, .22, -.008), (s * .137, .11, -.022)], [.075, .117, .103, .095, .066], 0, ['thigh_' + side, 'shin_' + side, 'foot_' + side])
    ellipsoid('Foot_' + side, (s * .137, .075, -.065), (.12, .072, .159), 2, {'foot_' + side: 1}, square=.6)
    hand_z = -.39 if s == 1 else -.49
    tube('Arm_' + side, [(s * .225, 1.195, -.015), (s * .267, 1.12, -.08), (s * .27, 1.0, -.19), (s * .2, 1.016, (hand_z - .19) / 2), (s * .1, 1.045, hand_z)], [.056, .095, .084, .077, .065], 0, ['arm_' + side, 'forearm_' + side, 'paw_' + side])
    ellipsoid('Paw_' + side, (s * .1, 1.045, hand_z - .014), (.089, .083, .103), 1, {'paw_' + side: 1}, square=.65)
# Capybaras have no prominent external tail. Rig a tiny rump nub, kept in cylinder.
ellipsoid('Tail_nub', (0, .66, .255), (.036, .03, .025), 0, {'tail': .8, 'spine': .2}, segments=10, rings=6)
ellipsoid('Bandana_collar', (0, 1.324, -.006), (.192, .044, .171), 5, {'neck': 1})
mesh_part('Bandana_point', [(-.13, 1.315, -.136), (.13, 1.315, -.136), (0, 1.11, -.272), (0, 1.29, -.184), (-.12, 1.31, -.127), (.12, 1.31, -.127), (0, 1.12, -.264)], [(0, 2, 3), (1, 3, 2), (0, 3, 1), (4, 5, 6), (0, 1, 5, 4), (1, 2, 6, 5), (2, 0, 4, 6)], 5, {'neck': .55, 'spine': .45})

bpy.ops.object.select_all(action='DESELECT')
for obj in parts: obj.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
base = bpy.context.object
base.name = 'Capybara_source'
# Recalculate consistent outward normals after ring construction.
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode='OBJECT')
base.data.calc_loop_triangles()
source_tris = len(base.data.loop_triangles)
report = {'sourceTriangles': source_tris, 'palette': PALETTE, 'lods': [], 'hitbox': {'head': {'center': [0, 1.6, -.04], 'radius': .25}, 'body': {'radius': .3, 'top': 1.42}}, 'clips': ['idle', 'run', 'jump']}
for level, budget in enumerate([14000, 4800, 1400]):
    obj = base.copy()
    obj.data = base.data.copy()
    scene.collection.objects.link(obj)
    obj.name = f'Capybara_LOD{level}'
    obj.data.name = obj.name
    bpy.context.view_layer.objects.active = obj
    decimate = obj.modifiers.new('Triangle budget', 'DECIMATE')
    decimate.ratio = min(1, budget / source_tris)
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    obj.parent = rig
    skin = obj.modifiers.new('Smooth skin', 'ARMATURE')
    skin.object = rig
    obj.data.calc_loop_triangles()
    report['lods'].append({'name': obj.name, 'triangles': len(obj.data.loop_triangles)})
bpy.data.objects.remove(base, do_unlink=True)

# Explicit actions on one rig. Blink bones scale their small eye meshes; no morph
# targets or per-instance face materials are required.
rig.animation_data_create()
for name, frames in [('idle', 120), ('run', 24), ('jump', 30)]:
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
        if name == 'idle':
            rig.pose.bones['spine'].scale.x = 1 + .003 * math.sin(phase)
            rig.pose.bones['head'].rotation_euler.z = .025 * math.sin(phase)
            blink = max(.04, 1 - max(0, 1 - abs(frame - 83) / 3))
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
rig.animation_data.action = None
scene.frame_set(0)
for p in rig.pose.bones:
    p.rotation_euler = (0, 0, 0)
    p.location = (0, 0, 0)
    p.scale = (1, 1, 1)
scene.frame_start, scene.frame_end = 0, 120
bpy.ops.export_scene.gltf(filepath=str(OUT / 'capybara.raw.glb'), export_format='GLB', export_animations=True, export_animation_mode='ACTIONS', export_nla_strips=False, export_frame_range=False, export_force_sampling=True, export_skins=True, export_influence_nb=4, export_yup=True, export_extras=True, export_cameras=False, export_lights=False)
(OUT / 'blender-report.json').write_text(json.dumps(report, indent=2) + '\n')
print('CAPYBARA_REPORT ' + json.dumps(report))
