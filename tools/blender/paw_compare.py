"""First-person paw next to the world character's paw, same framing and light. Blender 5.0.1.

Usage: blender -b --python tools/blender/paw_compare.py -- <outDir> [curl json]
Renders the right paw of fp-arms.glb and of capybara.glb (copies in output/fp/compare)
from the back, the palm, the thumb side and three quarters. Each camera and the lights are set in
that paw's own frame (wrist origin, digits +y, back +z) and the world paw's distances are 1.3
times the first-person ones (the gun scale), so equal size on screen means equal proportion to
a held gun. The optional curl json ({"index": [a, b, c], ...}) flexes both paws alike.
"""
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
out = Path(argv[0]); out.mkdir(parents=True, exist_ok=True)
curl = json.loads(argv[1]) if len(argv) > 1 and argv[1] else {}
ROOT = Path(__file__).resolve().parents[2]
# The remote build machine only receives tools/ and output/: build-fp.mjs copies the packed files there.
SRC = ROOT / 'output/fp/compare'
PAWS = {'fp': (SRC / 'fp-arms.glb', '', 1.0), 'tp': (SRC / 'capybara.glb', 'paw_', 1.3)}
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = scene.render.resolution_y = 768
scene.view_settings.view_transform = 'AgX'


def clear():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
    for data in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.images, bpy.data.lights, bpy.data.cameras):
        for item in list(data):
            data.remove(item)


def frame_of(rig, prefix, hand):
    b = lambda name: rig.matrix_world @ rig.data.bones[f'{prefix}{name}_R'].head_local
    wrist = rig.matrix_world @ rig.data.bones[f'{hand}_R'].head_local
    index1, ring1, middle1 = b('index1'), b('ring1'), b('middle1')
    x = (ring1 - index1).normalized()
    y = (middle1 - wrist); y = (y - x * y.dot(x)).normalized()
    return wrist, x, y, x.cross(y)


for key, (path, prefix, k) in PAWS.items():
    clear()
    world = bpy.data.worlds.get('cmp') or bpy.data.worlds.new('cmp'); scene.world = world; world.use_nodes = True
    bg = world.node_tree.nodes.get('Background'); bg.inputs['Color'].default_value = (.42, .44, .47, 1); bg.inputs['Strength'].default_value = .7
    bpy.ops.import_scene.gltf(filepath=str(path))
    for obj in list(scene.objects):
        # Close views only: the left arm, far LODs and the runtime-only shells stay hidden.
        if obj.type == 'MESH' and (obj.name.endswith('_L') or 'LOD1' in obj.name or 'LOD2' in obj.name):
            obj.hide_render = True
    rig = next(o for o in scene.objects if o.type == 'ARMATURE' and (prefix or o.name.endswith('R')))
    if curl:
        for finger, angles in curl.items():
            for i, angle in enumerate(angles):
                bone = rig.pose.bones.get(f'{prefix}{finger}{i + 1}_R')
                if bone:
                    bone.rotation_mode = 'XYZ'; bone.rotation_euler = (angle, 0, 0)
    bpy.context.view_layer.update()
    wrist, x, y, z = frame_of(rig, prefix, 'paw' if prefix else 'hand')
    F = lambda a, b, c: x * a + y * b + z * c
    focus = wrist + y * (.085 * k)
    for name, d, energy, color in [('key', F(-.4, .3, 1), 4.0, (1, .92, .8)), ('fill', F(.8, -.2, -.5), 1.2, (.7, .8, 1)), ('rim', F(.2, 1, -.3), 2.0, (1, .95, .9))]:
        light = bpy.data.lights.new(name, 'SUN'); light.energy = energy; light.color = color; light.angle = math.radians(10)
        obj = bpy.data.objects.new(name, light); scene.collection.objects.link(obj)
        obj.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cam_data = bpy.data.cameras.new('cam'); cam_data.lens = 70; cam_data.clip_start = .02 * k
    cam = bpy.data.objects.new('cam', cam_data); scene.collection.objects.link(cam); scene.camera = cam
    views = {'back': F(0, -.15, 1), 'palm': F(0, -.15, -1), 'side': F(-1, 0, .15), 'three': F(-.7, -.35, .6)}
    for view, direction in views.items():
        cam.location = focus + direction.normalized() * (.40 * k)
        # Digits point up the image in every view, so both paws sit alike in the frame.
        zc = (cam.location - focus).normalized()
        up = y if abs(y.dot(zc)) < .95 else z
        yc = (up - zc * up.dot(zc)).normalized(); xc = yc.cross(zc)
        cam.rotation_euler = Matrix((xc, yc, zc)).transposed().to_euler()
        scene.render.filepath = str(out / f'{key}-{view}.png')
        bpy.ops.render.render(write_still=True)
print('PAW_COMPARE', out)
