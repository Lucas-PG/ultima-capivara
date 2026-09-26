"""Original painted toucan balloon, supply crate and parachute, in game metres."""
import bpy
import bmesh
import json
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/supply-drop'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

# Hand-authored pigment washes, weave and wood strokes, plus an original toucan
# emblem. Each padded cell is opaque, so no alpha fringe can leak into the sky.
PALETTE = ['176E69', '32B8AA', 'E8AD35', 'CB6336', 'F3DCAB', 'A46A39',
           'D3B780', 'B89043', '263C39', 'B75335', '668044', 'EAD5A7',
           '86B9A0', '69452D', 'EEDFB5', '247E73']


def rgb(code):
    return [int(code[i:i + 2], 16) / 255 for i in [0, 2, 4]]


def ellipse(x, y, cx, cy, rx, ry):
    return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1


def toucan(x, y, tile):
    # A large gold bill and cream bib keep the silhouette legible at a distance.
    result = rgb(PALETTE[tile])
    if tile == 14 and max(abs(x - .5), abs(y - .5)) > .45:
        result = rgb('745132')
    if ellipse(x, y, .35, .36, .18, .27):
        result = rgb('254039')
    if ellipse(x, y, .39, .37, .105, .205):
        result = rgb('F4DFA4')
    if ellipse(x, y, .34, .61, .185, .18):
        result = rgb('263B36')
    if x > .39 and ellipse(x, y, .56, .60, .32, .16):
        result = rgb('EBAB32' if y > .59 else 'CC6433')
        if y > .68:
            result = rgb('F7CC66')
        if x > .80 - .15 * (y - .60):
            result = rgb('30382E')
        if abs(y - (.574 + .024 * (x - .4))) < .012:
            result = rgb('8B5830')
    if ellipse(x, y, .32, .675, .052, .054):
        result = rgb('EAE0B8')
    if ellipse(x, y, .326, .673, .028, .032):
        result = rgb('1B302C')
    if ellipse(x, y, .318, .688, .010, .011):
        result = rgb('FFF0D0')
    return result


pixels, rough = [], []
size = 512
for y in range(size):
    for x in range(size):
        col, row = x // 128, y // 128
        tile = col + (3 - row) * 4
        u, v = (x % 128 + .5) / 128, (y % 128 + .5) / 128
        base = toucan(u, v, tile) if tile >= 14 else rgb(PALETTE[tile])
        wash = .026 * math.sin(u * 9 + v * 5) + .015 * math.sin(u * 27 - v * 18)
        grain = .008 * math.sin(u * 417 + v * 51) * math.sin(v * 281 - u * 38)
        if tile in [5, 13]:
            wash += .055 * math.sin(v * 79 + math.sin(u * 6) * 3)
            wash += .018 * math.sin(v * 190 + u * 8)
        elif tile in [0, 1, 2, 3, 4, 11, 12]:
            grain += .010 * math.sin(u * 390) * math.sin(v * 390)
        elif tile == 6:
            wash += .035 * math.sin((u + v * .6) * 100)
        pixels.extend([max(0, min(1, channel + wash + grain)) for channel in base] + [1])
        value = .49 if tile == 7 else .78 if tile in [5, 13] else .92
        rough.extend([value, value, value, 1])


def image(name, data, non_color=False):
    result = bpy.data.images.new(name, width=size, height=size, alpha=False)
    if non_color:
        result.colorspace_settings.name = 'Non-Color'
    result.pixels = data
    result.filepath_raw = str(OUT / (name + '.png'))
    result.file_format = 'PNG'
    result.save()
    result.pack()
    return result


material = bpy.data.materials.new('Tucano_painted_canvas_wood_brass')
material.use_nodes = True
material.use_backface_culling = True
bsdf = material.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Specular IOR Level'].default_value = .18
for name, data, slot, linear in [('Tucano_paint', pixels, 'Base Color', False),
                                  ('Tucano_roughness', rough, 'Roughness', True)]:
    texture = material.node_tree.nodes.new('ShaderNodeTexImage')
    texture.image = image(name, data, linear)
    material.node_tree.links.new(texture.outputs['Color'], bsdf.inputs[slot])


def V(p):
    return Vector((p[0], -p[2], p[1]))


class Mesh:
    def __init__(self, name, level):
        self.name, self.level = name, level
        self.vertices, self.faces, self.tiles, self.smooth, self.uvs, self.shade = [], [], [], [], [], []

    def add(self, vertices, faces, tile, smooth=False, uv=None, shade=None):
        offset = len(self.vertices)
        self.vertices.extend(vertices)
        bounds = [(min(v[a] for v in vertices), max(v[a] for v in vertices)) for a in range(3)]
        for face in faces:
            self.faces.append([offset + i for i in face])
            self.tiles.append(tile)
            self.smooth.append(smooth)
            self.shade.append([shade[i] if shade else 1 for i in face])
            normal = (Vector(vertices[face[1]]) - Vector(vertices[face[0]])).cross(Vector(vertices[face[2]]) - Vector(vertices[face[0]]))
            axis = max(range(3), key=lambda a: abs(normal[a]))
            axes = [a for a in range(3) if a != axis]
            self.uvs.append([uv[i] if uv else tuple((vertices[i][a] - bounds[a][0]) / max(.0001, bounds[a][1] - bounds[a][0]) for a in axes) for i in face])

    def box(self, center, size, tile, bevel=.025):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1)
        for vertex in bm.verts:
            vertex.co = Vector([vertex.co[a] * size[a] for a in range(3)])
        if bevel and self.level < 2:
            bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(bevel, min(size) * .24),
                            segments=2 if self.level == 0 and min(size) > .16 else 1, affect='EDGES')
        bm.verts.index_update()
        vertices = [tuple(vertex.co[a] + center[a] for a in range(3)) for vertex in bm.verts]
        faces = [[v.index for v in face.verts] for face in bm.faces]
        bm.free()
        self.add(vertices, faces, tile)

    def tube(self, points, radius, tile, sides=None):
        sides = sides or [6, 4, 3][self.level]
        vertices = []
        for i, point in enumerate(points):
            before, after = Vector(points[max(0, i - 1)]), Vector(points[min(len(points) - 1, i + 1)])
            axis = (after - before).normalized()
            basis = Vector((1, 0, 0)) if abs(axis.x) < .8 else Vector((0, 0, 1))
            x = axis.cross(basis).normalized()
            y = axis.cross(x).normalized()
            vertices.extend([tuple(Vector(point) + radius * (math.cos(j * math.tau / sides) * x + math.sin(j * math.tau / sides) * y)) for j in range(sides)])
        faces = [(i * sides + j, i * sides + (j + 1) % sides, (i + 1) * sides + (j + 1) % sides, (i + 1) * sides + j)
                 for i in range(len(points) - 1) for j in range(sides)]
        faces.extend([tuple(reversed(range(sides))), tuple((len(points) - 1) * sides + j for j in range(sides))])
        self.add(vertices, faces, tile, True)

    def patch(self, center, width, height, tile, bow=0, sections=1, back=False):
        vertices, uv, faces = [], [], []
        for y in range(2):
            for x in range(sections + 1):
                u, v = x / sections, y
                vertices.append((center[0] + (u - .5) * width, center[1] + (v - .5) * height,
                                 center[2] - bow * (2 * u - 1) ** 2))
                uv.append((u, v))
        for x in range(sections):
            face = (x, x + 1, sections + 2 + x, sections + 1 + x)
            faces.append(tuple(reversed(face)) if back else face)
        self.add(vertices, faces, tile, True, uv)

    def finish(self):
        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata([V(p) for p in self.vertices], [], self.faces)
        mesh.update()
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.data.materials.append(material)
        mesh.uv_layers.new(name='Atlas')
        mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
        uv, color = mesh.uv_layers['Atlas'], mesh.color_attributes['Color']
        for face, tile, smooth, coords, shades in zip(mesh.polygons, self.tiles, self.smooth, self.uvs, self.shade):
            face.use_smooth = smooth
            # Calm painted contact value; runtime lighting remains responsible
            # for the sun direction. Atlas padding survives mipmaps and LODs.
            ao = .88 + .12 * max(0, face.normal.z)
            for index, coord, shade in zip(face.loop_indices, coords, shades):
                uv.data[index].uv = ((tile % 4 + .04 + .92 * coord[0]) / 4,
                                    (3 - tile // 4 + .04 + .92 * coord[1]) / 4)
                color.data[index].color = (ao * shade, ao * shade, ao * shade, 1)
        # Welding preserves corner UV/paint seams while sharing volume normals
        # across gores. Otherwise separately coloured panels would shade flat.
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
        bm.normal_update()
        bm.to_mesh(mesh)
        bm.free()
        mesh.update()
        obj['supplyPart'] = self.name.split('_LOD')[0]
        obj['origin'] = 'gondola-bottom' if 'carrier' in self.name else 'crate-bottom'
        obj['front'] = '+Z'
        mesh.calc_loop_triangles()
        return {'name': self.name, 'triangles': len(mesh.loop_triangles),
                'min': [round(min(v[a] for v in self.vertices), 5) for a in range(3)],
                'max': [round(max(v[a] for v in self.vertices), 5) for a in range(3)]}


def carrier(level):
    p = Mesh('drop_carrier_LOD' + str(level), level)
    n, rings = [32, 24, 16][level], [18, 12, 8][level]
    vertices, shades, uv = [], [], []
    for j in range(rings + 1):
        t = j / rings
        radius = max(.035, 2.0 * math.sin(math.pi * t) ** .65 * (.68 + .40 * t))
        for i in range(n):
            a = math.tau * i / n
            rib = 1 + .018 * math.cos(a * 8)
            vertices.append((radius * math.cos(a) * rib, 1.35 + 5.25 * t, radius * math.sin(a) * rib))
            shades.append(.94 + .06 * math.sin(a * 4) ** 2)
            uv.append(((i % max(1, n // 8)) / max(1, n // 8), t))
    for j in range(rings):
        for i in range(n):
            face = (j * n + i, (j + 1) * n + i, (j + 1) * n + (i + 1) % n, j * n + (i + 1) % n)
            gore = int(i * 8 / n)
            # Main teal fabric, narrow cream/gold gores, warm orange tail panels.
            tile = [0, 1, 0, 2, 0, 1, 0, 3][gore]
            p.add([vertices[k] for k in face], [(0, 1, 2, 3)], tile, True,
                  [(0, j / rings), (0, (j + 1) / rings), (1, (j + 1) / rings), (1, j / rings)], [shades[k] for k in face])
    p.add(vertices[:n], [tuple(range(n))], 8)
    p.add(vertices[-n:], [tuple(reversed(range(n)))], 2)
    # The emblem follows the broad forward face, with a curved cream border.
    # Its bottom fits inside the balloon silhouette at every LOD.
    columns, rows = [12, 8, 4][level], [8, 5, 3][level]
    vv, uv, ff = [], [], []
    for j in range(rows + 1):
        for i in range(columns + 1):
            u, v = i / columns, j / rows
            x, y = (u - .5) * 2.20, 3.225 + v * 2.05
            t = (y - 1.35) / 5.25
            radius = 2.0 * math.sin(math.pi * t) ** .65 * (.68 + .40 * t)
            angle = math.acos(x / radius)
            radius *= 1 + .018 * math.cos(angle * 8)
            vv.append((x, y, math.sqrt(max(0, radius * radius - x * x)) + .025))
            uv.append((u, v))
    for j in range(rows):
        for i in range(columns):
            a = j * (columns + 1) + i
            ff.append((a, a + 1, a + columns + 2, a + columns + 1))
    p.add(vv, ff, 14, True, uv)
    p.box((0, .30, 0), (1.36, .60, 1.08), 5, .065)
    for x in [-.65, .65]:
        p.box((x, .40, 0), (.10, .55, 1.12), 0)
    for z in [-.52, .52]:
        p.box((0, .58, z), (1.4, .10, .10), 6)
        p.box((0, .09, z), (1.35, .09, .10), 13)
    p.patch((0, .32, .546), .44, .38, 14)
    for x in [-.55, .55]:
        for z in [-.42, .42]:
            angle, t = math.atan2(z, x), (2.15 - 1.35) / 5.25
            contact = 2.0 * math.sin(math.pi * t) ** .65 * (.68 + .40 * t)
            contact *= (1 + .018 * math.cos(angle * 8)) * .965
            p.tube([(x, .59, z), (x * .86, 1.35, z * .86),
                    (contact * math.cos(angle), 2.15, contact * math.sin(angle))], .025, 6)
            # Release sling reaches the crate lid when carrier is crate +Y1.2.
            p.tube([(x, .04, z), (math.copysign(.34, x), -.42, math.copysign(.30, z))], .016, 6)
    if level < 2:
        for x in [-.61, .61]:
            p.box((x, .32, .573), (.04, .35, .035), 7, .008)
        for i in range(6 if level == 0 else 3):
            x = -.50 + i / (5 if level == 0 else 2)
            p.box((x, .35, -.55), (.14, .25, .035), 13, .01)
    return p.finish()


def crate(level):
    p = Mesh('drop_crate_LOD' + str(level), level)
    p.box((0, .39, 0), (.89, .68, .77), 5, .045)
    p.box((0, .055, 0), (.95, .11, .85), 13, .025)
    p.box((0, .72, 0), (.95, .12, .85), 5, .032)
    for x in [-.38, .38]:
        for z in [-.372, .372]:
            p.box((x, .39, z), (.09, .63, .09), 0, .018)
        p.box((x, .758, 0), (.09, .035, .78), 1, .008)
    for z in [-.389, .389]:
        p.box((0, .40, z), (.12, .60, .035), 1, .009)
        p.box((0, .57, z * 1.025), (.17, .13, .038), 7, .014)
        if level < 2:
            for y in [.23, .40, .57]:
                p.box((0, y, z), (.72, .013, .013), 13, .001)
    p.patch((.205, .40, .407), .25, .29, 14)
    p.patch((-.205, .39, -.407), .19, .24, 11, back=True)
    if level == 0:
        for x in [-.38, .38]:
            for y in [.17, .60]:
                for z in [-.423, .423]:
                    p.tube([(x, y, z - math.copysign(.01, z)), (x, y, z)], .012, 7, 8)
        # Folded carrying loops stay inside the landing footprint and top plane.
        for x in [-.45, .45]:
            p.tube([(x, .36, -.14), (x, .43, -.12), (x, .43, .12), (x, .36, .14)], .017, 6)
    return p.finish()


def chute(level):
    p = Mesh('drop_chute_LOD' + str(level), level)
    n, rings = [24, 16, 12][level], [7, 5, 3][level]
    vertices = []
    for layer in range(2):
        for j in range(rings + 1):
            t = j / rings
            for i in range(n):
                a = math.tau * i / n
                radius = max(.012, 1.20 * t * (1 + .018 * math.cos(a * 8)))
                y = 3.48 - .78 * t * t + .06 * math.cos(a * 8) * t ** 6 - layer * .018
                vertices.append((radius * math.cos(a), y, radius * math.sin(a)))
    offset = (rings + 1) * n
    for layer in range(2):
        for j in range(rings):
            for i in range(n):
                face = (layer * offset + j * n + i, layer * offset + (j + 1) * n + i,
                        layer * offset + (j + 1) * n + (i + 1) % n, layer * offset + j * n + (i + 1) % n)
                if not layer:
                    face = tuple(reversed(face))
                tile = [4, 1, 2, 1][int(i * 8 / n) % 4]
                p.add([vertices[k] for k in face], [(0, 1, 2, 3)], tile, True)
    for i in range(n):
        face = (rings * n + i, rings * n + (i + 1) % n,
                offset + rings * n + (i + 1) % n, offset + rings * n + i)
        p.add([vertices[k] for k in face], [(0, 1, 2, 3)], 2, True)
    for layer in range(2):
        p.add(vertices[layer * offset:layer * offset + n], [tuple(range(n)) if layer else tuple(reversed(range(n)))], 4)
    cords = 8 if level < 2 else 4
    for i in range(cords):
        a = math.tau * (i + .5) / cords
        at = (i + .5) / cords * n
        index, mix = math.floor(at), at % 1
        a0, a1 = vertices[rings * n + index % n], vertices[rings * n + (index + 1) % n]
        upper = tuple(a0[k] * (1 - mix) + a1[k] * mix + (.006 if k == 1 else 0) for k in range(3))
        lower = (math.copysign(.36, upper[0]), .76, math.copysign(.32, upper[2]))
        p.tube([lower, upper], .008 if level == 0 else .011, 6, 4)
    return p.finish()


report = {'components': [], 'origins': {'drop_carrier': 'crate bottom +Y1.2 at attachment',
           'drop_crate': 'bottom-centre at landing/release', 'drop_chute': 'same as crate'},
          'texture': {'width': size, 'height': size, 'tiles': [4, 4]}, 'front': '+Z', 'up': '+Y', 'units': 'metres'}
for level in range(3):
    report['components'].extend([carrier(level), crate(level), chute(level)])
for level, budget in enumerate([6000, 3200, 1300]):
    count = sum(item['triangles'] for item in report['components'] if item['name'].endswith('LOD' + str(level)))
    assert count <= budget, ('supply triangle budget', level, count, budget)
(OUT / 'blender-report.json').write_text(json.dumps(report, indent=2) + '\n')
bpy.ops.export_scene.gltf(filepath=str(OUT / 'supply-drop.raw.glb'), export_format='GLB',
                          export_animations=False, export_yup=True, export_extras=True,
                          export_vertex_color='NAME', export_vertex_color_name='Color',
                          export_cameras=False, export_lights=False)
print('SUPPLY_REPORT', json.dumps(report))
