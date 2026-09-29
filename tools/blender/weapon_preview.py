"""Turntable-style stills of built weapons for art review. Blender 5.0.1.

Usage: blender -b --python tools/blender/weapon_preview.py -- <outDir> <glb> [<glb> ...]
Renders each GLB (as exported to output/arsenal) from the right, the left and a
three-quarter view under a warm key and a cool fill, EEVEE, 1280x720.
"""
import bpy
import math
import sys
from pathlib import Path
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
out, glbs = Path(argv[0]), argv[1:]
out.mkdir(parents=True, exist_ok=True)


def reset():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    scene.view_settings.view_transform = 'AgX'
    world = scene.world or bpy.data.worlds.new('preview')
    scene.world = world; world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (.42, .45, .5, 1); bg.inputs['Strength'].default_value = .9
    for name, rot, energy, color in [('key', (50, 0, 35), 4.5, (1, .9, .78)), ('fill', (65, 0, 215), 1.4, (.7, .8, 1))]:
        light = bpy.data.lights.new(name, 'SUN'); light.energy = energy; light.color = color; light.angle = math.radians(8)
        obj = bpy.data.objects.new(name, light); obj.rotation_euler = [math.radians(a) for a in rot]
        scene.collection.objects.link(obj)


for glb in glbs:
    reset()
    bpy.ops.import_scene.gltf(filepath=glb)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    lo = Vector((1e9, 1e9, 1e9)); hi = -lo
    for o in meshes:
        for corner in o.bound_box:
            w = o.matrix_world @ Vector(corner); lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    centre, radius = (lo + hi) / 2, (hi - lo).length / 2
    cam_data = bpy.data.cameras.new('cam'); cam_data.lens = 50
    cam = bpy.data.objects.new('cam', cam_data); bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    stem = Path(glb).stem
    for view, (yaw, pitch) in {'right': (90, 8), 'left': (-90, 8), 'three': (35, 22), 'front': (170, 12)}.items():
        d = radius * 2.35
        direction = Vector((math.sin(math.radians(yaw)) * math.cos(math.radians(pitch)), -math.cos(math.radians(yaw)) * math.cos(math.radians(pitch)),
                            math.sin(math.radians(pitch))))
        cam.location = centre + direction * d
        cam.rotation_euler = (centre - cam.location).to_track_quat('-Z', 'Y').to_euler()
        bpy.context.scene.render.filepath = str(out / f'{stem}-{view}.png')
        bpy.ops.render.render(write_still=True)
    print('PREVIEW', stem)
