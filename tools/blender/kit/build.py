"""Build the modular island kit, three LODs and vertex-baked ambient occlusion."""
import bpy
import bmesh
import math
import json
import sys
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from spec import PIECES, ROOT, write_metadata

OUT = ROOT / 'output/kit'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
image = bpy.data.images.load(str(HERE / 'painted-atlas-source.png'))
image.scale(1024, 1024)
image.filepath_raw = str(ROOT / 'public/textures/kit/painted-atlas.jpg')
image.file_format = 'JPEG'
bpy.context.scene.render.image_settings.quality = 88
image.save()
image.pack()
material = bpy.data.materials.new('Ilha_painted_atlas')
material.use_nodes = True
material.use_backface_culling = True
bsdf = material.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Roughness'].default_value = .92
bsdf.inputs['Specular IOR Level'].default_value = .12
tex = material.node_tree.nodes.new('ShaderNodeTexImage')
tex.image = image
tex.interpolation = 'Linear'
material.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])


def V(p):
    return Vector((p[0], -p[2], p[1]))


def make_part(part, level=0):
    shape = part['shape']
    if shape == 'box':
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1)
        w, h, d = part['size']
        bmesh.ops.scale(bm, vec=Vector((w, d, h)), verts=bm.verts)
        bevel = min(part['bevel'], min(w, h, d) * .24)
        if bevel:
            bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=1, affect='EDGES', profile=.5)
        vertices = [v.co.copy() for v in bm.verts]
        bm.verts.index_update()
        faces = [[v.index for v in f.verts] for f in bm.faces]
        bm.free()
        rotation = Matrix.Rotation(part['yaw'], 4, 'Z') @ Matrix.Rotation(part['roll'], 4, 'Y')
        vertices = [rotation @ v + V(part['center']) for v in vertices]
    elif shape == 'cylinder':
        n = part['sides']
        vertices = []
        for y, r in [(-part['height'] / 2, part['radius']), (part['height'] / 2, part['top'])]:
            for i in range(n):
                a = math.tau * i / n
                v = Vector((r * math.cos(a), r * math.sin(a), y))
                if part['axis'] == 'x':
                    v = Matrix.Rotation(math.pi / 2, 4, 'Y') @ v
                elif part['axis'] == 'z':
                    v = Matrix.Rotation(math.pi / 2, 4, 'X') @ v
                vertices.append(v + V(part['center']))
        faces = [list(reversed(range(n))), list(range(n, 2 * n))]
        faces += [[i, (i + 1) % n, (i + 1) % n + n, i + n] for i in range(n)]
    elif shape == 'orb':
        n, rings = (6, 3) if level == 2 else (8, 5) if level == 1 else (8, 4) if max(part['size']) < .18 else (12, 8)
        vertices = []
        w, h, d = part['size']
        for j in range(rings + 1):
            b = -math.pi / 2 + math.pi * j / rings
            for i in range(n):
                a = math.tau * i / n
                vertices.append(V((part['center'][0] + w * .5 * math.cos(a) * math.cos(b), part['center'][1] + h * .5 * math.sin(b), part['center'][2] + d * .5 * math.sin(a) * math.cos(b))))
        faces = [[j * n + i, (j + 1) * n + i, (j + 1) * n + (i + 1) % n, j * n + (i + 1) % n] for j in range(rings) for i in range(n)]
    else:
        a, b = V(part['a']), V(part['b'])
        direction = b - a
        rotation = Vector((0, 0, 1)).rotation_difference(direction.normalized())
        vertices = [rotation @ Vector((x * part['width'] / 2, y * part['depth'] / 2, z * direction.length / 2)) + (a + b) / 2 for x, y, z in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
        faces = [[3,2,1,0],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]
    return vertices, faces


report = dict(materials=1, atlas='public/textures/kit/painted-atlas.jpg', pieces=[])
# Eight deterministic hemisphere rays bake local contact shading into COLOR_0.
# No runtime AO is needed on Low. Rays sample actual exported surfaces.
directions = []
for i in range(8):
    a = i * 2.39996323
    z = (i + .5) / 8
    directions.append(Vector((math.sqrt(1 - z * z) * math.cos(a), math.sqrt(1 - z * z) * math.sin(a), z)))
for name, piece in PIECES.items():
    parent = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(parent)
    parent['pieceId'] = name
    parent['origin'] = 'bottom-centre'
    lod_metrics = []
    for level in [0, 1, 2]:
        vertices, faces, tiles, paint_uv, smooth_faces = [], [], [], [], []
        for part in piece.parts:
            if level and part.get('detail'):
                continue
            vv, ff = make_part(part, level)
            offset = len(vertices)
            vertices.extend(vv)
            faces.extend([[i + offset for i in face] for face in ff])
            tiles.extend([part['tile']] * len(ff))
            smooth_faces.extend([part['shape'] == 'orb' and not name.startswith('cliff_')] * len(ff))
            for face_index, face in enumerate(ff):
                if part['shape'] == 'cylinder' and part['axis'] == 'y' and part['tile'] in [6, 14] and face_index >= 2:
                    step = (face_index - 2) % 8
                    coords = [(step / 8, 0), ((step + 1) / 8, 0), ((step + 1) / 8, 1), (step / 8, 1)]
                    paint_uv.append({offset + v: coord for v, coord in zip(face, coords)})
                else:
                    paint_uv.append(None)
        mesh = bpy.data.meshes.new(name + '_LOD' + str(level))
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(mesh.name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.parent = parent
        obj.data.materials.append(material)
        uv = mesh.uv_layers.new(name='Atlas')
        color = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
        # Adding a custom-data layer invalidates Blender RNA layer references.
        uv = mesh.uv_layers.get('Atlas')
        bvh = BVHTree.FromPolygons(vertices, faces, all_triangles=False)
        for poly, tile, authored_uv, smooth in zip(mesh.polygons, tiles, paint_uv, smooth_faces):
            col, row = tile % 4, tile // 4
            normal = poly.normal.normalized()
            rotation = Vector((0, 0, 1)).rotation_difference(normal)
            # Per-face contact sample is stable on bevels and avoids pinprick noise.
            center = poly.center + normal * .012
            blocked = sum(1 for direction in directions if bvh.ray_cast(center, rotation @ direction, .8)[0] is not None)
            ao = 1 - blocked / len(directions) * .38
            # Broad directional value on bevel faces, with all lighting left to runtime.
            for loop_index in poly.loop_indices:
                pos = mesh.vertices[mesh.loops[loop_index].vertex_index].co
                # Repeating planar UVs within an atlas cell, with safe cell padding.
                if abs(normal.z) > .6:
                    u, v = pos.x, pos.y
                elif abs(normal.x) > .6:
                    u, v = pos.y, pos.z
                else:
                    u, v = pos.x, pos.z
                # Face-local mapping keeps the atlas tile bounded without crossing seams.
                points = [mesh.vertices[index].co for index in poly.vertices]
                axis_u = 0 if abs(normal.x) <= .6 else 1
                axis_v = 1 if abs(normal.z) > .6 else 2
                low_u, high_u = min(q[axis_u] for q in points), max(q[axis_u] for q in points)
                low_v, high_v = min(q[axis_v] for q in points), max(q[axis_v] for q in points)
                uu = (pos[axis_u] - low_u) / max(.05, high_u - low_u)
                vv = (pos[axis_v] - low_v) / max(.05, high_v - low_v)
                if authored_uv:
                    uu, vv = authored_uv[mesh.loops[loop_index].vertex_index]
                uv.data[loop_index].uv = ((col + .06 + .88 * uu) / 4, 1 - (row + .06 + .88 * vv) / 4)
                color.data[loop_index].color = (ao * .78, ao * .87, ao * .98, 1) if name.startswith('cliff_') and tile in [6, 14] else (ao, ao, ao, 1)
            poly.use_smooth = smooth
        # Rounded fruit and plants share continuous contact values across faces.
        totals, counts = [0.0] * len(mesh.vertices), [0] * len(mesh.vertices)
        for poly in mesh.polygons:
            if not poly.use_smooth:
                continue
            for loop in poly.loop_indices:
                vertex = mesh.loops[loop].vertex_index
                totals[vertex] += color.data[loop].color[0]
                counts[vertex] += 1
        for poly in mesh.polygons:
            if poly.use_smooth:
                for loop in poly.loop_indices:
                    vertex = mesh.loops[loop].vertex_index
                    shade = totals[vertex] / max(1, counts[vertex])
                    color.data[loop].color = (shade, shade, shade, 1)
        # Collapse hidden bevel rings before tile silhouettes. Three LOD budgets
        # bound complete houses, not each submesh, while keeping one atlas draw.
        obj.data.calc_loop_triangles()
        budget = [12000, 2900, 780][level]
        if name in ['church', 'market_hall', 'warehouse']:
            budget = [15000, 3500, 900][level]
        if len(obj.data.loop_triangles) > budget:
            bpy.context.view_layer.objects.active = obj
            modifier = obj.modifiers.new('Distance triangle budget', 'DECIMATE')
            modifier.ratio = (budget - 12) / len(obj.data.loop_triangles)
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        # Decimation can create zero-area triangles at merged UV seams. Clean
        # those degeneracies, then require the exported mesh to validate cleanly.
        obj.data.validate(verbose=False, clean_customdata=False)
        assert not obj.data.validate(verbose=False, clean_customdata=False), obj.name
        obj.data.calc_loop_triangles()
        lod_metrics.append(len(obj.data.loop_triangles))
    report['pieces'].append(dict(id=name, triangles=lod_metrics, colliders=len(piece.colliders)))
    print('KIT_PIECE', name, lod_metrics, flush=True)
write_metadata()
bpy.ops.export_scene.gltf(filepath=str(OUT / 'kit.raw.glb'), export_format='GLB', export_animations=False, export_yup=True, export_extras=True, export_vertex_color='NAME', export_vertex_color_name='Color', export_cameras=False, export_lights=False)
(OUT / 'blender-report.json').write_text(json.dumps(report, indent=2) + '\n')
