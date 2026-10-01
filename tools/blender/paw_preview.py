"""Close studio stills of the first-person paw for art review. Blender 5.0.1.

Usage: blender -b --python tools/blender/paw_preview.py -- <outDir> [curl json] [glb] [distance m]
Renders the right arm of output/fp/fp-arms.raw.glb from the back, the palm, the
thumb side and three quarters, EEVEE, 1024x1024, under a warm key and a cool fill.
The optional curl json ({"index": [a, b, c], ...}, radians per joint) flexes the
digits toward the palm to preview a fist or a grip.
"""
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
out = Path(argv[0]); out.mkdir(parents=True, exist_ok=True)
curl = json.loads(argv[1]) if len(argv) > 1 and argv[1] else {}
glb = argv[2] if len(argv) > 2 and argv[2] else str(Path(__file__).resolve().parents[2] / 'output/fp/fp-arms.raw.glb')

distance = float(argv[3]) if len(argv) > 3 else .42
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = scene.render.resolution_y = 1024
scene.view_settings.view_transform = 'AgX'
world = scene.world or bpy.data.worlds.new('preview'); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes.get('Background')
bg.inputs['Color'].default_value = (.42, .44, .47, 1); bg.inputs['Strength'].default_value = .8
for name, rot, energy, color in [('key', (40, 10, 30), 4.0, (1, .92, .8)), ('fill', (70, 0, 210), 1.3, (.7, .8, 1)), ('rim', (110, 0, 120), 2.0, (1, .95, .9))]:
    light = bpy.data.lights.new(name, 'SUN'); light.energy = energy; light.color = color; light.angle = math.radians(10)
    obj = bpy.data.objects.new(name, light); obj.rotation_euler = [math.radians(a) for a in rot]
    scene.collection.objects.link(obj)

bpy.ops.import_scene.gltf(filepath=glb)
for obj in list(scene.objects):
    if obj.name.endswith('_L') or obj.name.startswith('arm_L') or obj.name.startswith('rig_L'):
        obj.hide_render = True
rig = next(o for o in scene.objects if o.type == 'ARMATURE' and o.name.endswith('R'))
if curl:
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    for finger, angles in curl.items():
        for i, angle in enumerate(angles):
            bone = rig.pose.bones.get(f'{finger}{i + 1}_R')
            if bone:
                bone.rotation_mode = 'XYZ'; bone.rotation_euler = (angle, 0, 0)
    bpy.ops.object.mode_set(mode='OBJECT')
bpy.context.view_layer.update()
hand = rig.pose.bones['hand_R']
wrist = rig.matrix_world @ hand.head
focus = rig.matrix_world @ (hand.head + (hand.tail - hand.head) * 1.3)
cam_data = bpy.data.cameras.new('cam'); cam_data.lens = 85
cam = bpy.data.objects.new('cam', cam_data); scene.collection.objects.link(cam); scene.camera = cam
# The glTF importer brings the arm back to Blender axes: along the arm is +Y, the back of the paw +Z.
views = {'back': Vector((0, -.05, 1)), 'palm': Vector((0, -.05, -1)), 'side': Vector((-1, 0, .15)), 'three': Vector((-.7, -.35, .6))}
for view, direction in views.items():
    cam.location = focus + direction.normalized() * distance
    look = focus - cam.location
    cam.rotation_euler = look.to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = str(out / f'paw-{view}.png')
    bpy.ops.render.render(write_still=True)
print('PAW_PREVIEW', out)
