"""Four-digit capybara viewmodel, Blender 5, metres, +Y forward.

Shared paw topology, explicit weights, rolled canvas sleeves and UV PBR detail.
"""
import bpy
import bmesh
import json
import math
import sys
from pathlib import Path
from mathutils import Vector, Matrix

sys.path.insert(0, str(Path(__file__).resolve().parent))
from capy_paw import arm_geometry, digit_bones
from character_surfaces import make_material, map_surfaces, FUR, PAW, CLOTH, NAIL

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/fp'; OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)


def srgb(value):
    c = [int(value[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return Vector([x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c])


COLORS = {FUR: srgb('976440'), PAW: srgb('665044'), CLOTH: srgb('D4C9B2'), NAIL: srgb('3A302A')}
WRIST = Vector((0, .447, 0))
BONES = {'upper': (Vector((0, 0, 0)), Vector((0, .245, 0)), None),
         'fore': (Vector((0, .245, 0)), WRIST, 'upper'),
         'fore_twist': (Vector((0, .245, 0)), WRIST, 'fore'),
         'hand': (WRIST, WRIST + Vector((0, .052, 0)), 'fore_twist')}
for name, (a, b, parent) in digit_bones().items():
    BONES[name] = (a + WRIST, b + WRIST, parent)
verts, faces, weights, surfaces, _fine = arm_geometry()

mesh = bpy.data.meshes.new('capybara_arm'); mesh.from_pydata(verts, [], faces); mesh.update()
bm = bmesh.new(); bm.from_mesh(mesh); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(mesh); bm.free()
for poly in mesh.polygons:
    poly.use_smooth = True
color = mesh.color_attributes.new('Color', 'FLOAT_COLOR', 'POINT')
for v in mesh.vertices:
    kind = surfaces[v.index]; base = COLORS[kind].copy()
    if kind == FUR:
        base = base.lerp(srgb('BD9069'), max(0, -v.normal.z) * .44)
    if kind == PAW:
        base = base.lerp(srgb('896C58'), max(0, -v.normal.z) * .3)
    color.data[v.index].color = (*base, 1)
mesh.color_attributes.active_color = color
map_surfaces(mesh, [surfaces[poly.vertices[0]] for poly in mesh.polygons])
material = make_material('capybara_paw_surfaces', OUT)


def build_side(side):
    suffix = 'R' if side > 0 else 'L'
    data = mesh.copy(); data.name = f'arm_{suffix}'
    matrix = Matrix.Translation((side * .2, 0, 0)) @ Matrix.Diagonal((side, 1, 1, 1))
    data.transform(matrix)
    if side < 0:
        data.flip_normals()
    data.update()
    obj = bpy.data.objects.new(f'arm_{suffix}', data); bpy.context.scene.collection.objects.link(obj); data.materials.append(material)
    armature = bpy.data.armatures.new(f'rig_{suffix}')
    rig = bpy.data.objects.new(f'rig_{suffix}', armature); bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig; rig.select_set(True); bpy.ops.object.mode_set(mode='EDIT')
    for name, (a, b, parent) in BONES.items():
        bone = armature.edit_bones.new(f'{name}_{suffix}'); bone.head = matrix @ a; bone.tail = matrix @ b
        bone.align_roll(Vector((0, 0, 1)))
        if parent:
            bone.parent = armature.edit_bones[f'{parent}_{suffix}']
    bpy.ops.object.mode_set(mode='OBJECT'); rig.select_set(False)
    obj.parent = rig; modifier = obj.modifiers.new('Armature', 'ARMATURE'); modifier.object = rig
    groups = {name: obj.vertex_groups.new(name=f'{name}_{suffix}') for name in BONES}
    for i, influence in enumerate(weights):
        for name, weight in influence.items():
            if weight > 0:
                groups[name].add([i], weight, 'REPLACE')
    return rig, obj


rigs = [build_side(1), build_side(-1)]
report = {'triangles': sum(sum(len(p.vertices) - 2 for p in obj.data.polygons) for _, obj in rigs),
          'vertices': sum(len(obj.data.vertices) for _, obj in rigs), 'bones': list(BONES), 'shoulderOffsetX': .2,
          'material': 'UV fur/canvas/paw detail + normal + ORM', 'digits': 4, 'textureSize': 2048}
bpy.ops.export_scene.gltf(filepath=str(OUT / 'fp-arms.raw.glb'), export_format='GLB', export_vertex_color='ACTIVE',
                          export_skins=True, export_animations=False, export_yup=True, export_def_bones=False,
                          export_extras=True, export_image_format='WEBP', export_image_quality=95)
(OUT / 'fp-arms-report.json').write_text(json.dumps(report, indent=2))
print('FP_ARMS', json.dumps(report))
