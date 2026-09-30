"""Redentora from the current player's head and paws, in a soapstone robe.
Standalone Blender build. Feet at y=0, character scale, facing -Z. One static mesh.
"""
import sys
import math
import json
from pathlib import Path
import bpy
import bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import capy_sdf as S
import capybara_form as C
from capybara_paint import srgb
OUT = HERE.parents[1] / 'output/characters'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)

# Same skull, muzzle, lids, brows, ears, nostrils and digits as the player source.
# The player's scarf, knotted at the chest, is the tie between the landmark and the character.
forms = [C.head(), C.eyes(), C.neck(), C.torso(), C.scarf()]
robe = S.Loft([(0, .12, .025), (0, .50, .025), (0, .94, .025), (0, 1.30, .005)],
              [.345, .305, .245, .225], [.24, .225, .20, .16])
def folds(p):
    ang = np.arctan2(p[:, 2] - .025, p[:, 0])
    # Deep vertical folds that open toward the hem, a belt line and a rolled hem at the feet.
    d = .014 * np.sin(ang * 9 + p[:, 1] * 1.4 + .6 * np.sin(ang * 3)) * np.clip((1.18 - p[:, 1]) / .45, 0, 1) ** .8
    d -= .010 * np.exp(-((p[:, 1] - .95) / .018) ** 2)
    d -= .008 * np.exp(-((p[:, 1] - .16) / .03) ** 2)
    return d
forms.append(S.Displace(robe, folds, .016))
for s in (-1, 1):
    # Draping sleeves with cuffs, and open paws facing the island.
    forms.append(S.Loft([(s * .20, 1.29, 0), (s * .47, 1.25, 0), (s * .78, 1.30, -.015)],
                        [.12, .19, .13], [.13, .09, .062], side=(0, 1, 0)))
    wrist = C.v(s * .86, 1.37, -.015)
    forms.append(S.RoundCone((s * .69, 1.36, -.015), wrist, .066, .045))
    frame = np.array([[0, s, 0], [-s, 0, 0], [0, 0, 1]], np.float32)
    forms.append(S.Transform(C.paw(s).a, wrist, frame, C.PAW_SCALE))
    forms.append(C.foot(s))
    forms.append(S.RoundCone((s * .08, 1.40, -.10), (s * .21, 1.02, -.16), .020, .013))
root = S.Intersect(S.Union(forms, k=.024), S.Plane((0, .0015, 0), (0, -1, 0)))
verts, quads = S.mesh(root, C.v(-1.08, -.01, -.40), C.v(1.08, 1.90, .35), .004)
verts = np.stack([verts[:, 0], -verts[:, 2], verts[:, 1]], 1)
me = bpy.data.meshes.new('Capivara_Redentora')
me.from_pydata(verts.tolist(), [], quads[:, ::-1].tolist()); me.update()
obj = bpy.data.objects.new('Capivara_Redentora', me); bpy.context.collection.objects.link(obj)
bpy.context.view_layer.objects.active = obj; obj.select_set(True)
d = obj.modifiers.new('landmark_budget', 'DECIMATE'); d.ratio = 10000 / (len(me.polygons) * 2); d.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=d.name)
me = obj.data
for face in me.polygons: face.use_smooth = True
bm = bmesh.new(); bm.from_mesh(me); tree = BVHTree.FromBMesh(bm); bm.free()
stone, warm = srgb('E9E4D6'), srgb('C8BEA7')
colors = me.color_attributes.new('Color', 'FLOAT_COLOR', 'POINT')
# Deterministic hemisphere samples, no texture upload.
dirs = [Vector((math.cos(i * 2.39996) * math.sqrt(1 - ((i + .5) / 24) ** 2),
                math.sin(i * 2.39996) * math.sqrt(1 - ((i + .5) / 24) ** 2), (i + .5) / 24)) for i in range(24)]
for vx in me.vertices:
    hits = total = 0.0
    for direction in dirs:
        dr = direction if direction.dot(vx.normal) >= 0 else -direction
        weight = dr.dot(vx.normal); total += weight
        hit = tree.ray_cast(vx.co + vx.normal * .002, dr, .13)
        if hit[0] is not None: hits += weight * (1 - hit[3] / .13)
    ao = 1 - hits / max(total, 1e-6)
    tone = stone * .85 + warm * .15
    colors.data[vx.index].color = (*map(float, tone * (.45 + .55 * ao ** 1.3)), 1)
me.color_attributes.active_color = colors
mat = bpy.data.materials.new('Pedra_sabao'); mat.use_nodes = True
node = mat.node_tree.nodes.new('ShaderNodeVertexColor'); node.layer_name = 'Color'
mat.node_tree.links.new(node.outputs['Color'], mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .9
me.materials.append(mat)
obj['characterSource'] = 'capybara_form.head + eyes + paw (v6)'
me.calc_loop_triangles()
report = {'triangles': len(me.loop_triangles), 'materials': 1, 'textures': 0, 'source': obj['characterSource']}
(OUT / 'statue-report.json').write_text(json.dumps(report, indent=2) + '\n')
bpy.ops.export_scene.gltf(filepath=str(OUT / 'statue.raw.glb'), export_format='GLB', use_selection=True,
                          export_vertex_color='ACTIVE', export_animations=False, export_extras=True,
                          export_cameras=False, export_lights=False, export_yup=True)
print('STATUE_REPORT', json.dumps(report), flush=True)
