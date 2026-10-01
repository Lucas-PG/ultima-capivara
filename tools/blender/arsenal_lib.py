"""Hard-surface helpers, bake and export for the first-person arsenal.

Blender 5.0.1, metres. Weapon space: X right, Y forward (muzzle), Z up.
The glTF exporter turns this into Three.js space (X right, Y up, -Z forward).

Every weapon is modelled from parts. Parts carry a named material; after the
geometry is final, all parts of a weapon share one UV layout and one baked
texture set (albedo with painted light, and roughness/metalness).
"""
import bpy
import bmesh
import math
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/arsenal'
OUT.mkdir(parents=True, exist_ok=True)


def reset_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for data in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.curves):
        for item in list(data):
            data.remove(item)


def srgb_to_linear(hex_value):
    c = [int(hex_value[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c]


# name: (albedo hex, roughness, metalness, edge highlight strength, edge tint hex)
PALETTE = {
    'wornsteel': ('626A71', .46, .62, .34, 'C3CDD2'),
    'coral': ('DE8568', .65, 0, .15, 'F8C9B4'),
    'gunmetal': ('4A5159', .40, .75, .5, 'C8D2D8'),
    'blued': ('2B3138', .34, .8, .45, '9DB0BF'),
    'steel': ('7D858A', .3, .85, .45, 'D8DEE0'),
    'dark': ('353B41', .55, .3, .38, '8F9AA1'),
    'polymer': ('3E4346', .68, 0, .34, '8A908A'),
    'tan': ('B39A6E', .7, 0, .4, 'E3D2A8'),
    'olive': ('5E6340', .72, 0, .4, '9EA27A'),
    'wood': ('9A5A32', .55, 0, .3, 'D29A63'),
    'wood_dark': ('5E3520', .55, 0, .3, 'A0673E'),
    'brass': ('C9973E', .3, .9, .6, 'F4DB8F'),
    'copper': ('B8683F', .35, .9, .5, 'F0B08A'),
    'teal': ('1E9E97', .45, 0, .45, 'CFEFE6'),
    'orange': ('E0662D', .45, 0, .6, 'FFD2A6'),
    'yellow': ('F0C23B', .45, 0, .5, 'FFF0B0'),
    'red': ('C8392E', .45, 0, .5, 'FFB3A0'),
    'rubber': ('27292B', .85, 0, .2, '55585A'),
    'leather': ('7A4A2C', .7, 0, .25, 'B98A62'),
    'rope': ('BFA674', .9, 0, .2, 'E6D6A8'),
    'fabric': ('4F5A3A', .92, 0, .15, '7D8A63'),
    'glass': ('1B3E4A', .05, .2, .2, '8FD3E0'),
    'coconut': ('6B4225', .85, 0, .25, 'A77850'),
    'coconut_fibre': ('8C6440', .95, 0, .15, 'BF9868'),
    'bone': ('E8DCC0', .6, 0, .2, 'FFFFFF'),
    'emissive_red': ('FF3B2E', .4, 0, 0, 'FF3B2E'),
    'blade': ('9AA3A6', .22, .9, .7, 'F2F6F7'),
    'bamboo': ('C8A657', .6, 0, .35, 'EDD9A0'),
    'stone': ('8F8C86', .8, 0, .3, 'C9C6BE'),
    'navy': ('3A5875', .5, .3, .35, 'A8B8C8'),
    # Livery pass (2026-09-29): appended so existing palette ids stay stable.
    'green': ('2F7D3B', .5, 0, .4, 'BFE3B0'),
    'wood_red': ('7A3A22', .48, 0, .3, 'C98A5E'),
    'case': ('5D5650', .36, .8, .45, 'C9C0B5'),
    'ivory': ('E6DCC4', .5, 0, .2, 'FFFFFF'),
    'rubber_red': ('A5382C', .82, 0, .15, 'D98A7E'),
    'sisal': ('C9A86A', .92, 0, .15, 'EAD7A8'),
    'leaf_green': ('4E7A2E', .8, 0, .2, '9BC56E'),
    'walnut': ('87502C', .5, 0, .32, 'C6945C'),
    'coconut_green': ('91A743', .76, 0, .2, 'CBD17A'),
}
MAT_IDS = {name: i + 1 for i, name in enumerate(PALETTE)}
_materials = {}


def mat(name):
    if name in _materials:
        return _materials[name]
    hex_value, roughness, metal, _edge, _tint = PALETTE[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*srgb_to_linear(hex_value), 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metal
    m['paletteId'] = MAT_IDS[name]
    _materials[name] = m
    return m


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def mesh_object(name, bm):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return link(bpy.data.objects.new(name, mesh))


def set_material(obj, material_name):
    obj.data.materials.clear()
    obj.data.materials.append(mat(material_name))
    return obj


def finish(obj, material_name, bevel=.003, segments=2, angle=30, smooth=True):
    """Bevel hard edges, shade smooth with weighted normals, assign material."""
    set_material(obj, material_name)
    bpy.context.view_layer.objects.active = obj
    if bevel > 0:
        b = obj.modifiers.new('bevel', 'BEVEL')
        b.width = bevel
        b.segments = segments
        b.limit_method = 'ANGLE'
        b.angle_limit = math.radians(angle)
        b.harden_normals = False
        b.miter_outer = 'MITER_ARC'
        b.profile = .6
    for poly in obj.data.polygons:
        poly.use_smooth = smooth
    w = obj.modifiers.new('wn', 'WEIGHTED_NORMAL')
    w.keep_sharp = True
    w.weight = 50
    apply_modifiers(obj)
    return obj


def apply_modifiers(obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=depsgraph)
    old = obj.data
    obj.modifiers.clear()
    obj.data = mesh
    bpy.data.meshes.remove(old)


def fillet(points, radius, steps=4):
    """Round the corners of a closed 2D polygon. radius: float or list per point."""
    n = len(points)
    radii = radius if isinstance(radius, (list, tuple)) else [radius] * n
    out = []
    for i in range(n):
        p = Vector(points[i])
        r = radii[i]
        if r <= 0:
            out.append(tuple(p))
            continue
        a = Vector(points[i - 1])
        c = Vector(points[(i + 1) % n])
        d1 = (a - p)
        d2 = (c - p)
        l1, l2 = d1.length, d2.length
        d1.normalize()
        d2.normalize()
        cos_t = max(-.999, min(.999, d1.dot(d2)))
        half = math.acos(cos_t) / 2
        if half < 1e-3:
            out.append(tuple(p))
            continue
        t = min(r / math.tan(half), l1 * .49, l2 * .49)
        p1, p2 = p + d1 * t, p + d2 * t
        # Quadratic Bezier through the corner approximates the arc well enough.
        for k in range(steps + 1):
            s = k / steps
            q = p1 * (1 - s) ** 2 + p * 2 * s * (1 - s) + p2 * s * s
            out.append((q.x, q.y))
    return out


def chaikin(points, iterations=3):
    """Corner-cutting subdivision of a closed polygon into a smooth outline.
    A point given as (y, z, 1) is a hard corner and is kept exactly."""
    pts = [(p[0], p[1], p[2] if len(p) > 2 else 0) for p in points]
    for _ in range(iterations):
        out = []
        n = len(pts)
        for i in range(n):
            a, b = pts[i], pts[(i + 1) % n]
            if a[2]:
                out.append(a)
            q = (a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25, 0)
            r = (a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75, 0)
            if not a[2]:
                out.append(q)
            out.append(r if not b[2] else (a[0] * .5 + b[0] * .5, a[1] * .5 + b[1] * .5, 0))
        pts = out
    return [(p[0], p[1]) for p in pts]


def prism(name, profile_yz, width, material, x=0.0, bevel=.003, radius=0.0, segments=2, steps=4, raw=False, smooth=0):
    """Side profile (y forward, z up) extruded across X; the classic gun part.
    smooth>0 rounds the outline by corner cutting; radius fillets polygon corners."""
    if smooth:
        pts = chaikin(profile_yz, smooth)
    else:
        pts = fillet([p[:2] for p in profile_yz], radius, steps) if radius else [p[:2] for p in profile_yz]
    bm = bmesh.new()
    left = [bm.verts.new((x - width / 2, y, z)) for y, z in pts]
    right = [bm.verts.new((x + width / 2, y, z)) for y, z in pts]
    n = len(pts)
    bm.faces.new(left)
    bm.faces.new(list(reversed(right)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([left[i], right[i], right[j], left[j]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = mesh_object(name, bm)
    if raw:
        _pending[obj.name] = (material, bevel, segments)
        return obj
    return finish(obj, material, bevel, segments)


_pending = {}


def cross_sections(obj, axis, positions):
    """Add contour stations before deforming a long prism into a grip waist."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    normal = Vector((1 if axis == 0 else 0, 1 if axis == 1 else 0, 1 if axis == 2 else 0))
    for position in positions:
        point = normal * position
        bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
                              dist=1e-8, plane_co=point, plane_no=normal)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def complete(obj):
    """Finish a part created with raw=True after its boolean cuts."""
    material, bevel, segments = _pending.pop(obj.name)
    return finish(obj, material, bevel, segments)


def plan(name, profile_xy, height, material, z=0.0, bevel=.003, radius=0.0, segments=2, steps=4):
    """Top-view profile (x right, y forward) extruded up along Z."""
    pts = fillet(profile_xy, radius, steps) if radius else profile_xy
    bm = bmesh.new()
    low = [bm.verts.new((px, py, z - height / 2)) for px, py in pts]
    high = [bm.verts.new((px, py, z + height / 2)) for px, py in pts]
    n = len(pts)
    bm.faces.new(low)
    bm.faces.new(list(reversed(high)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([low[i], high[i], high[j], low[j]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = mesh_object(name, bm)
    return finish(obj, material, bevel, segments)


def box(name, center, size, material, bevel=.003, segments=2, raw=False):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    obj = mesh_object(name, bm)
    if raw:
        _pending[obj.name] = (material, min(bevel, min(size) * .45), segments)
        return obj
    return finish(obj, material, min(bevel, min(size) * .45), segments)


def cyl(name, p0, p1, r0, material, r1=None, sides=24, bevel=.002, segments=2, cap=True):
    """Cylinder (or cone) between two points."""
    r1 = r0 if r1 is None else r1
    a, b = Vector(p0), Vector(p1)
    axis = b - a
    length = axis.length
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=sides, radius1=r0, radius2=r1, depth=length)
    rot = Vector((0, 0, 1)).rotation_difference(axis.normalized()).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation((a + b) / 2) @ rot, verts=bm.verts)
    obj = mesh_object(name, bm)
    return finish(obj, material, bevel, segments)


def tube(name, p0, p1, r_out, r_in, material, sides=28, bevel=.0015):
    """Open-ended pipe with wall thickness (muzzles, scope bodies, sleeves)."""
    a, b = Vector(p0), Vector(p1)
    axis = b - a
    rot = Vector((0, 0, 1)).rotation_difference(axis.normalized()).to_matrix().to_4x4()
    bm = bmesh.new()
    rings = []
    for z, r in [(0, r_out), (1, r_out), (1, r_in), (0, r_in)]:
        ring = []
        for i in range(sides):
            t = i / sides * math.tau
            ring.append(bm.verts.new((math.cos(t) * r, math.sin(t) * r, z * axis.length)))
        rings.append(ring)
    for k in range(4):
        r0, r1 = rings[k], rings[(k + 1) % 4]
        for i in range(sides):
            j = (i + 1) % sides
            bm.faces.new([r0[i], r0[j], r1[j], r1[i]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(a) @ rot, verts=bm.verts)
    obj = mesh_object(name, bm)
    return finish(obj, material, bevel, 2, angle=40)


def lathe(name, profile_rz, material, p0=(0, 0, 0), axis=(0, 1, 0), sides=32, bevel=0.0, smooth=True):
    """Revolve a (radius, distance) profile around an axis starting at p0."""
    bm = bmesh.new()
    rings = []
    for r, d in profile_rz:
        ring = []
        for i in range(sides):
            t = i / sides * math.tau
            ring.append(bm.verts.new((math.cos(t) * r, math.sin(t) * r, d)))
        rings.append(ring)
    for k in range(len(rings) - 1):
        for i in range(sides):
            j = (i + 1) % sides
            bm.faces.new([rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]])
    if profile_rz[0][0] > 1e-4:
        bm.faces.new(list(reversed(rings[0])))
    if profile_rz[-1][0] > 1e-4:
        bm.faces.new(rings[-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    rot = Vector((0, 0, 1)).rotation_difference(Vector(axis).normalized()).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation(Vector(p0)) @ rot, verts=bm.verts)
    obj = mesh_object(name, bm)
    return finish(obj, material, bevel, 2, smooth=smooth)


def sphere(name, center, radii, material, segments=24, rings=16):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=1)
    bmesh.ops.scale(bm, vec=Vector(radii), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    obj = mesh_object(name, bm)
    return finish(obj, material, 0)


def sweep(name, points, radii, material, sides=12, aspect=1.0, up=(0, 0, 1), cap=True):
    """A rounded tube along a polyline with per-point radius (straps, tubing, rope)."""
    pts = [Vector(p) for p in points]
    bm = bmesh.new()
    rings = []
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        u = Vector(up)
        side = d.cross(u)
        if side.length < 1e-4:
            side = d.cross(Vector((1, 0, 0)))
        side.normalize()
        across = side.cross(d).normalized()
        ring = []
        for k in range(sides):
            t = k / sides * math.tau
            ring.append(bm.verts.new(p + side * math.cos(t) * radii[i] + across * math.sin(t) * radii[i] * aspect))
        rings.append(ring)
    for k in range(len(rings) - 1):
        for i in range(sides):
            j = (i + 1) % sides
            bm.faces.new([rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]])
    if cap:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = mesh_object(name, bm)
    return finish(obj, material, 0)


def cut(target, cutter, remove=True):
    """Boolean difference; the cutter is deleted."""
    mod = target.modifiers.new('cut', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.solver = 'EXACT'
    mod.object = cutter
    cutter.hide_render = True
    apply_modifiers(target)
    if remove:
        bpy.data.objects.remove(cutter)
    return target


def cutter_box(center, size):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    return mesh_object('cutter', bm)


def cutter_cyl(p0, p1, r, sides=24):
    a, b = Vector(p0), Vector(p1)
    axis = b - a
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=sides, radius1=r, radius2=r, depth=axis.length)
    rot = Vector((0, 0, 1)).rotation_difference(axis.normalized()).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation((a + b) / 2) @ rot, verts=bm.verts)
    return mesh_object('cutter', bm)


def cutter_prism(profile_yz, width, x=0.0):
    bm = bmesh.new()
    left = [bm.verts.new((x - width / 2, y, z)) for y, z in profile_yz]
    right = [bm.verts.new((x + width / 2, y, z)) for y, z in profile_yz]
    n = len(profile_yz)
    bm.faces.new(left)
    bm.faces.new(list(reversed(right)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([left[i], right[i], right[j], left[j]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_object('cutter', bm)


def join(objects, name):
    objects = [o for o in objects if o is not None]
    if len(objects) == 1:
        objects[0].name = name
        return objects[0]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    obj.data.name = name
    return obj


def empty(name, location=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    link(obj)
    obj.location = location
    obj.parent = parent
    return obj


def mirror_x(obj):
    """Duplicate a part mirrored across X=0 (left/right details)."""
    dup = obj.copy()
    dup.data = obj.data.copy()
    link(dup)
    dup.data.transform(Matrix.Diagonal((-1, 1, 1, 1)))
    dup.data.flip_normals()
    dup.data.update()
    return dup


def array_along(obj, count, offset):
    parts = [obj]
    for i in range(1, count):
        dup = obj.copy()
        dup.data = obj.data.copy()
        link(dup)
        dup.data.transform(Matrix.Translation(Vector(offset) * i))
        parts.append(dup)
    return parts


# ---------------------------------------------------------------- bake
def _bake_image(name, size, non_color=False):
    img = bpy.data.images.new(name, width=size, height=size, alpha=False, float_buffer=True)
    if non_color:
        img.colorspace_settings.name = 'Non-Color'
    return img


def _set_bake_target(objects, image):
    for obj in objects:
        for m in obj.data.materials:
            nodes = m.node_tree.nodes
            node = nodes.get('bake_target') or nodes.new('ShaderNodeTexImage')
            node.name = 'bake_target'
            node.image = image
            nodes.active = node
            node.select = True


def _emission_override(objects, builder):
    """Temporarily swap each material's output to an emission built by builder."""
    saved = []
    for obj in objects:
        for m in obj.data.materials:
            nt = m.node_tree
            out = nt.nodes.get('Material Output')
            original = out.inputs['Surface'].links[0].from_socket if out.inputs['Surface'].links else None
            emission = nt.nodes.new('ShaderNodeEmission')
            color = builder(nt, m)
            nt.links.new(color, emission.inputs['Color'])
            nt.links.new(emission.outputs['Emission'], out.inputs['Surface'])
            saved.append((nt, out, original, emission))
    return saved


def _restore(saved):
    for nt, out, original, emission in saved:
        if original is not None:
            nt.links.new(original, out.inputs['Surface'])
        nt.nodes.remove(emission)


def _pixels(image):
    size = image.size[0]
    arr = np.empty(size * size * 4, dtype=np.float32)
    image.pixels.foreach_get(arr)
    return arr.reshape(size, size, 4)


def bake_weapon(objects, name, size=1024, samples=48, ao_distance=.04, edge_radius=.005, livery=()):
    """UV unwrap all parts together and bake albedo (with painted light) and ORM."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.render.bake.margin = 6
    scene.render.bake.use_clear = True
    # One shared UV space.
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
        if not obj.data.uv_layers:
            obj.data.uv_layers.new(name='UVMap')
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(58), island_margin=.006, area_weight=0, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=.006, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')

    def bake(kind, image, sample_count=None, **kw):
        # Flat emission passes need only coverage sampling. Reserve the full
        # ray budget for AO, and enough bevel samples for the edge mask.
        scene.cycles.samples = sample_count or samples
        _set_bake_target(objects, image)
        bpy.ops.object.bake(type=kind, **kw)
        return _pixels(image)

    # 1. Material id (flat emission) to recover per-pixel palette entries.
    id_img = _bake_image(f'{name}_id', size, True)
    saved = _emission_override(objects, lambda nt, m: _id_color(nt, m))
    ids = bake('EMIT', id_img, sample_count=4)
    _restore(saved)
    # 2. Ambient occlusion.
    scene.world = scene.world or bpy.data.worlds.new('world')
    ao_img = _bake_image(f'{name}_ao', size, True)
    scene.world.light_settings.distance = ao_distance
    ao = bake('AO', ao_img)
    # 3. Rounded-edge mask: how far the bevel-smoothed normal leans from the true normal.
    edge_img = _bake_image(f'{name}_edge', size, True)
    saved = _emission_override(objects, lambda nt, m: _edge_mask(nt, edge_radius))
    edge = bake('EMIT', edge_img, sample_count=16)
    _restore(saved)
    # 4. Object-space normal for the painted key/fill gradient.
    normal_img = _bake_image(f'{name}_n', size, True)
    saved = _emission_override(objects, lambda nt, m: _object_normal(nt))
    normals = bake('EMIT', normal_img, sample_count=4)
    _restore(saved)
    # 5. Weapon-space position (encoded p * .5 + .5) for stencils and wood grain.
    pos_img = _bake_image(f'{name}_p', size, True)
    saved = _emission_override(objects, lambda nt, m: _position(nt))
    pos = (bake('EMIT', pos_img, sample_count=4)[..., :3] - .5) * 2
    _restore(saved)
    albedo, orm = composite(ids, ao, edge, normals, size)
    albedo = wood_grain(albedo, ids, pos, size)
    albedo, orm, paint = apply_livery(albedo, orm, ids, pos, normals, livery)
    albedo, orm = weather(albedo, orm, ids, ao, edge, normals, size, seed=sum(map(ord, name)), paint=paint)
    return albedo, orm


def bake_relief(objects, name, size=2048):
    """Bake material grain into a proper tangent-space normal texture."""
    seen = set()
    for obj in objects:
        for material in obj.data.materials:
            if material.name in seen:
                continue
            seen.add(material.name)
            nt = material.node_tree
            noise = nt.nodes.new('ShaderNodeTexNoise')
            noise.inputs['Scale'].default_value = 650
            noise.inputs['Detail'].default_value = 2
            position = nt.nodes.new('ShaderNodeNewGeometry')
            nt.links.new(position.outputs['Position'], noise.inputs['Vector'])
            bump = nt.nodes.new('ShaderNodeBump')
            bump.inputs['Strength'].default_value = .24
            bump.inputs['Distance'].default_value = .00032
            nt.links.new(noise.outputs['Fac'], bump.inputs['Height'])
            nt.links.new(bump.outputs['Normal'], nt.nodes.get('Principled BSDF').inputs['Normal'])
    image = _bake_image(f'{name}_relief_bake', size, True)
    _set_bake_target(objects, image)
    bpy.context.scene.cycles.samples = 16
    bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT')
    return save_png(f'{name}_normal', _pixels(image)[..., :3], srgb=False)


def _id_color(nt, m):
    rgb = nt.nodes.new('ShaderNodeRGB')
    pid = m['paletteId']
    rgb.outputs[0].default_value = (pid / 64, 0, 0, 1)
    return rgb.outputs[0]


def _edge_mask(nt, radius):
    bevel = nt.nodes.new('ShaderNodeBevel')
    bevel.samples = 12
    bevel.inputs['Radius'].default_value = radius
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    dot = nt.nodes.new('ShaderNodeVectorMath')
    dot.operation = 'DOT_PRODUCT'
    nt.links.new(bevel.outputs['Normal'], dot.inputs[0])
    nt.links.new(geo.outputs['Normal'], dot.inputs[1])
    sub = nt.nodes.new('ShaderNodeMath')
    sub.operation = 'SUBTRACT'
    sub.inputs[0].default_value = 1
    nt.links.new(dot.outputs['Value'], sub.inputs[1])
    mul = nt.nodes.new('ShaderNodeMath')
    mul.operation = 'MULTIPLY'
    mul.inputs[1].default_value = 6
    nt.links.new(sub.outputs[0], mul.inputs[0])
    comb = nt.nodes.new('ShaderNodeCombineColor')
    nt.links.new(mul.outputs[0], comb.inputs[0])
    nt.links.new(mul.outputs[0], comb.inputs[1])
    nt.links.new(mul.outputs[0], comb.inputs[2])
    return comb.outputs[0]


def _object_normal(nt):
    coords = nt.nodes.new('ShaderNodeNewGeometry')
    xform = nt.nodes.new('ShaderNodeVectorTransform')
    xform.vector_type = 'NORMAL'
    xform.convert_from = 'WORLD'
    xform.convert_to = 'OBJECT'
    nt.links.new(coords.outputs['Normal'], xform.inputs[0])
    remap = nt.nodes.new('ShaderNodeVectorMath')
    remap.operation = 'MULTIPLY_ADD'
    remap.inputs[1].default_value = (.5, .5, .5)
    remap.inputs[2].default_value = (.5, .5, .5)
    nt.links.new(xform.outputs[0], remap.inputs[0])
    return remap.outputs[0]


def _position(nt):
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    remap = nt.nodes.new('ShaderNodeVectorMath'); remap.operation = 'MULTIPLY_ADD'
    remap.inputs[1].default_value = (.5, .5, .5); remap.inputs[2].default_value = (.5, .5, .5)
    nt.links.new(geo.outputs['Position'], remap.inputs[0])
    return remap.outputs[0]


STENCILS = ROOT / 'tools/art/stencils'
_stencil_cache = {}


def stencil(name):
    """A painted-motif mask (tools/art/stencils/<name>.png, white motif on black) as [0, 1] floats."""
    if name not in _stencil_cache:
        img = bpy.data.images.load(str(STENCILS / f'{name}.png'), check_existing=True)
        w, h = img.size
        px = np.empty(w * h * 4, np.float32); img.pixels.foreach_get(px)
        _stencil_cache[name] = px.reshape(h, w, 4)[..., 0]
    return _stencil_cache[name]


def _sample(mask, u, v):
    """Bilinear lookup; u right, v up, both in [0, 1]; zero outside."""
    h, w = mask.shape
    x = np.clip(u, 0, 1) * (w - 1); y = np.clip(v, 0, 1) * (h - 1)
    x0, y0 = np.floor(x).astype(np.int32), np.floor(y).astype(np.int32)
    x1, y1 = np.minimum(x0 + 1, w - 1), np.minimum(y0 + 1, h - 1)
    fx, fy = x - x0, y - y0
    val = (mask[y0, x0] * (1 - fx) + mask[y0, x1] * fx) * (1 - fy) + (mask[y1, x0] * (1 - fx) + mask[y1, x1] * fx) * fy
    inside = (u >= 0) & (u <= 1) & (v >= 0) & (v <= 1)
    return np.where(inside, val, 0)


def apply_livery(albedo, orm, ids, pos, normals, livery):
    """Paint stencilled motifs onto the baked albedo by planar projection.

    Each entry: stencil (name in tools/art/stencils), at (centre: (y, z) for axis 'x'
    or (x, y) for axis 'z'), size (metres, the stencil square), rotate (degrees),
    colour (hex), on (palette names it may paint), side (+1 right, -1 left, 0 both),
    mirror (flip on the left so the motif faces the muzzle on both sides), depth
    (min, max) along the projection axis, opacity, metal (brass or gold inlay).
    Returns the paint coverage so weathering chips it like the rest of the paint.
    """
    pid = np.rint(ids[..., 0] * 64).astype(np.int32)
    n = normals[..., :3] * 2 - 1
    names = list(PALETTE)
    base = np.zeros(albedo.shape, np.float32)
    for i, name in enumerate(names):
        base[pid == i + 1] = srgb_to_linear(PALETTE[name][0])
    lum = lambda c: c[..., 0] * .2126 + c[..., 1] * .7152 + c[..., 2] * .0722
    light = np.clip(lum(albedo) / np.maximum(lum(base), 1e-3), .45, 1.35)[..., None]
    paint = np.zeros(pid.shape, np.float32)
    for d in livery:
        axis = d.get('axis', 'x')
        if axis == 'x':
            a, b, depth, facing = pos[..., 1], pos[..., 2], pos[..., 0], n[..., 0]
        else:
            a, b, depth, facing = pos[..., 0], pos[..., 1], pos[..., 2], n[..., 2]
        side = d.get('side', 0)
        face = np.ones_like(facing) if d.get('wrap') else np.clip((np.abs(facing) - .3) / .25, 0, 1)
        if side:
            face *= (np.sign(facing) == side)
        if 'depth' in d:
            face *= (depth >= d['depth'][0]) & (depth <= d['depth'][1])
        if 'on' in d:
            face *= np.isin(pid, [MAT_IDS[k] for k in d['on']])
        ang = math.radians(d.get('rotate', 0))
        da, db = a - d['at'][0], b - d['at'][1]
        u = (da * math.cos(ang) + db * math.sin(ang)) / d['size'] + .5
        v = (-da * math.sin(ang) + db * math.cos(ang)) / d['size'] + .5
        if axis == 'x' and d.get('mirror', True):
            # Seen from the left the weapon's forward axis points the other way.
            u = np.where(facing < 0, 1 - u, u)
        if 'bands' in d:
            period, width = d['bands']
            phase = (da * math.cos(ang) + db * math.sin(ang)) % period
            mask = np.clip((width - phase) * 1800, 0, 1) * np.clip(phase * 1800, 0, 1)
        else:
            mask = _sample(stencil(d['stencil']), u, v)
        m = mask * face * d.get('opacity', .95)
        colour = np.array(srgb_to_linear(d['colour']), np.float32)
        albedo = albedo * (1 - m[..., None]) + colour * light * m[..., None]
        if d.get('metal'):
            orm[..., 1] = orm[..., 1] * (1 - m) + .3 * m; orm[..., 2] = orm[..., 2] * (1 - m) + .9 * m
        else:
            orm[..., 1] = orm[..., 1] * (1 - m) + .5 * m; orm[..., 2] = orm[..., 2] * (1 - m)
            paint = np.maximum(paint, m)
    return albedo, orm, paint


def wood_grain(albedo, ids, pos, size):
    """Streaky grain along the weapon's length, fine dark lines and pores on wood and bamboo."""
    pid = np.rint(ids[..., 0] * 64).astype(np.int32)
    wood = np.isin(pid, [MAT_IDS[k] for k in ('wood', 'wood_dark', 'wood_red', 'bamboo', 'walnut') if k in MAT_IDS])
    if not wood.any():
        return albedo
    p = pos[wood]
    streak = _vnoise(p * np.array([140, 9, 140], np.float32), 1) * .65 + _vnoise(p * np.array([420, 30, 420], np.float32), 2) * .35
    warp = _vnoise(p * np.array([35, 3, 35], np.float32), 3)
    rings = np.sin((p[:, 0] * 90 + p[:, 2] * 330 + warp * 7) * math.tau) * .5 + .5
    lines = rings ** 10
    pores = _vnoise(p * np.array([2600, 260, 2600], np.float32), 4)
    tone = (.82 + .26 * streak) * (1 - .22 * lines) * (.96 + .08 * pores)
    out = albedo.copy()
    out[wood] = albedo[wood] * tone[:, None]
    walnut = pid == MAT_IDS['walnut']
    if walnut.any():
        q = pos[walnut]
        flow = _vnoise(q * np.array([40, 6, 40], np.float32), 17)
        grain = np.sin((q[:, 2] * 112 + q[:, 0] * 38 + flow * 3.5) * math.tau) * .5 + .5
        ribbons = np.sin((q[:, 2] * 27 + flow * 1.5) * math.tau) * .5 + .5
        tone = (.84 + .3 * ribbons) * (1 - .46 * grain ** 12)
        out[walnut] = albedo[walnut] * tone[:, None]
    return out


def _vnoise(p, seed):
    """3D value noise in [0, 1] for an (n, 3) array."""
    i = np.floor(p).astype(np.int64); f = p - i; f = f * f * (3 - 2 * f)
    def h(x, y, z):
        v = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (seed * 2654435761)
        v = (v ^ (v >> 13)) * 1274126177
        return ((v ^ (v >> 16)) & 0xffffff).astype(np.float32) / 0xffffff
    out = np.zeros(len(p), np.float32)
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (f[:, 0] if dx else 1 - f[:, 0]) * (f[:, 1] if dy else 1 - f[:, 1]) * (f[:, 2] if dz else 1 - f[:, 2])
                out += w * h(i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz)
    return out


def composite(ids, ao, edge, normals, size):
    """Painted light: albedo x warm AO, rim highlight on rounded edges, a soft
    top-light gradient and a cool underside. Metal edges read as worn polish."""
    names = list(PALETTE)
    pid = np.clip(np.rint(ids[..., 0] * 64).astype(np.int32), 0, len(names))
    valid = pid > 0
    base = np.zeros((size, size, 3), np.float32)
    tint = np.zeros((size, size, 3), np.float32)
    rough = np.full((size, size), .8, np.float32)
    metal = np.zeros((size, size), np.float32)
    edge_k = np.zeros((size, size), np.float32)
    for i, name in enumerate(names):
        hex_value, r, m, e, t = PALETTE[name]
        sel = pid == i + 1
        if not sel.any():
            continue
        base[sel] = srgb_to_linear(hex_value)
        tint[sel] = srgb_to_linear(t)
        rough[sel] = r
        metal[sel] = m
        edge_k[sel] = e
    occ = np.clip(ao[..., 0], 0, 1)
    e = np.clip(edge[..., 0], 0, 1) ** .8
    n = normals[..., :3] * 2 - 1
    up = np.clip(n[..., 2], -1, 1)
    # Warm bounce in the occlusion, like painted cavities.
    cavity = np.stack([np.ones_like(occ), .82 + .18 * occ, .7 + .3 * occ], -1)
    shade = (.5 + .5 * occ ** 1.15)[..., None] * np.where(occ[..., None] < .999, cavity, 1)
    gradient = (1 + .16 * up)[..., None]
    albedo = base * shade * gradient
    albedo = albedo + (tint - albedo) * np.clip(e * edge_k * 1.15, 0, 1)[..., None]
    # Faint low-frequency tone variation so broad panels never look flat.
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32) / size
    wobble = 1 + .035 * np.sin(xx * 37 + np.sin(yy * 23) * 2) * np.sin(yy * 29 + xx * 7)
    albedo *= wobble[..., None]
    albedo[~valid] = base[valid].mean(0) if valid.any() else .5
    rough = np.clip(rough - e * edge_k * .25 * (metal > .5), .05, 1)
    orm = np.stack([np.ones_like(occ), rough, metal], -1)
    orm[~valid] = [1, .8, 0]
    return np.clip(albedo, 0, 1), orm


def _noise(rng, size, cells, rounds=4):
    """Smooth value noise in [0, 1] at roughly size/cells feature size."""
    grid = rng.random((cells, cells), dtype=np.float32)
    for _ in range(rounds):
        grid = (grid * 4 + np.roll(grid, 1, 0) + np.roll(grid, -1, 0) + np.roll(grid, 1, 1) + np.roll(grid, -1, 1)) / 8
    grid = (grid - grid.min()) / max(1e-6, grid.max() - grid.min())
    up = np.repeat(np.repeat(grid, size // cells, 0), size // cells, 1)
    for _ in range(2):
        up = (up * 4 + np.roll(up, 1, 0) + np.roll(up, -1, 0) + np.roll(up, 1, 1) + np.roll(up, -1, 1)) / 8
    return up


PAINTED = ('navy', 'teal', 'coral', 'orange', 'yellow', 'red', 'olive', 'tan', 'green')
METALS = ('wornsteel', 'gunmetal', 'blued', 'steel', 'dark', 'blade')


def weather(albedo, orm, ids, ao, edge, normals, size, seed=1, paint=None):
    """Stylised wear: paint chipped back to steel on exposed edges, cavity grime,
    mottled and scratched metal, scuffed wood, a whisper of dust on top faces."""
    rng = np.random.default_rng(seed)
    pid = np.rint(ids[..., 0] * 64).astype(np.int32)
    mask = lambda names: np.isin(pid, [MAT_IDS[k] for k in names])
    painted, metal, wood = mask(PAINTED), mask(METALS + ('case',)), mask(('wood', 'wood_dark', 'wood_red', 'bamboo', 'walnut'))
    if paint is not None:
        # Livery motifs chip like the paint they are (on wood they wear, not flake to steel).
        painted = painted | ((paint > .3) & ~wood)
    fine, mid, coarse = _noise(rng, size, size // 8), _noise(rng, size, size // 32), _noise(rng, size, 16)
    e = np.clip(edge[..., 0], 0, 1)
    occ = np.clip(ao[..., 0], 0, 1)
    up = np.clip(normals[..., 2] * 2 - 1, -1, 1)
    # Chipped paint: edges plus a broken noise front, revealing polished steel.
    chip = np.clip((e ** .7 * 1.35 + (mid - .5) * .8 + (fine - .5) * .45 - .62) * 7, 0, 1) * painted
    steel = np.array(srgb_to_linear('9AA3A8'), np.float32)
    albedo = albedo * (1 - chip[..., None]) + steel * chip[..., None] * (.85 + .3 * fine[..., None])
    orm[..., 1] = orm[..., 1] * (1 - chip) + .3 * chip
    orm[..., 2] = orm[..., 2] * (1 - chip) + .85 * chip
    # Case-hardened steel: blue, straw and plum mottling under the grime.
    case = mask(('case',))
    if case.any():
        hue = np.stack([coarse, mid, 1 - coarse], -1)
        tint = np.array(srgb_to_linear('3E4E7A'), np.float32) * hue[..., 2:3] + np.array(srgb_to_linear('9A7A48'), np.float32) * hue[..., :1] + np.array(srgb_to_linear('6A4A62'), np.float32) * hue[..., 1:2]
        albedo = np.where(case[..., None], albedo * .55 + tint * .55 * (albedo.mean(-1, keepdims=True) / .12).clip(.4, 1.4), albedo)
    # Metal: broad mottling, fine grain and short hairline scratches.
    variation = (coarse - .5) * .22 + (fine - .5) * .08
    albedo *= (1 + variation * metal)[..., None]
    scratches = np.zeros((size, size), np.float32)
    for _ in range(int(900 * (size / 1024) ** 2)):
        x, y = rng.integers(0, size, 2); length = int(rng.integers(3, 14) * size / 1024); slope = rng.uniform(-.7, .7)
        for step in range(length):
            xx, yy = x + step, int(y + slope * step)
            if xx < size and 0 <= yy < size: scratches[yy, xx] = max(scratches[yy, xx], .05 * math.sin(math.pi * step / max(1, length)))
    albedo += (scratches * (metal | (painted & (chip > .5))))[..., None]
    orm[..., 1] = np.clip(orm[..., 1] + variation * .5 * metal - scratches * 2.5, .1, .97)
    # Wood: lighter scuffed edges and grain-direction streaks.
    albedo *= (1 + (e * .35 + (fine - .5) * .12) * wood)[..., None]
    # Cavity grime (warm, darker, rougher) and faint dust on upward faces.
    cavity = np.clip(1 - occ, 0, 1) ** 1.4
    grime = np.array(srgb_to_linear('3B3027'), np.float32)
    g = np.clip(cavity * (.55 + .45 * mid), 0, .6)[..., None]
    albedo = albedo * (1 - g * .55) + grime * g * .55
    orm[..., 1] = np.clip(orm[..., 1] + cavity * .15, .1, .97)
    dust = np.clip((up - .55) * 2.5, 0, 1) * (.4 + .6 * coarse) * .07
    albedo = albedo * (1 - dust[..., None]) + np.array(srgb_to_linear('C9B79A'), np.float32) * dust[..., None]
    return np.clip(albedo, 0, 1), orm


def _dilate(arr, valid, steps=8):
    out = arr.copy()
    mask = valid.copy()
    for _ in range(steps):
        grow = np.zeros_like(mask)
        acc = np.zeros_like(out)
        cnt = np.zeros(mask.shape, np.float32)
        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            m = np.roll(np.roll(mask, dy, 0), dx, 1)
            v = np.roll(np.roll(out, dy, 0), dx, 1)
            add = m & ~mask
            acc[add] += v[add]
            cnt[add] += 1
            grow |= add
        out[grow] = acc[grow] / cnt[grow][..., None]
        mask |= grow
    return out


def save_png(name, rgb, srgb=True):
    size = rgb.shape[0]
    img = bpy.data.images.new(name, width=size, height=size, alpha=False)
    if not srgb:
        img.colorspace_settings.name = 'Non-Color'
    data = rgb
    if srgb:
        data = np.where(rgb <= .0031308, rgb * 12.92, 1.055 * np.power(np.clip(rgb, 0, 1), 1 / 2.4) - .055)
    rgba = np.concatenate([data, np.ones((size, size, 1), np.float32)], -1)
    img.pixels.foreach_set(rgba.astype(np.float32).ravel())
    img.filepath_raw = str(OUT / f'{name}.png')
    img.file_format = 'PNG'
    img.save()
    return img


def export_material(name, albedo_img, orm_img, normal_img=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = albedo_img
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    orm = nt.nodes.new('ShaderNodeTexImage')
    orm.image = orm_img
    orm_img.colorspace_settings.name = 'Non-Color'
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(orm.outputs['Color'], sep.inputs['Color'])
    nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    if normal_img is not None:
        tex_normal = nt.nodes.new('ShaderNodeTexImage'); tex_normal.image = normal_img
        normal = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(tex_normal.outputs['Color'], normal.inputs['Color'])
        nt.links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])
    return m
