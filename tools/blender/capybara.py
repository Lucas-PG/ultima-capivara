"""Direction A capybara. Blender 5.0.1; metres, +Y forward, +Z up.
Generated parts start as quad rings, receive subdivision, then budget decimation.
Every LOD uses the same armature and painted 4x4-tile, 1024-square atlas.
"""
import bpy
import bmesh
import json
import math
import os
import sys
import random
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
sys.path.insert(0, str(Path(__file__).resolve().parent))
from character_paint import atlas_arrays, semantic_array


def painted_image(name, pixels, non_color=False, alpha=False):
    size = pixels.shape[0]
    image = bpy.data.images.new(name, width=size, height=size, alpha=alpha)
    if non_color:
        image.colorspace_settings.name = 'Non-Color'
    if alpha:
        image.alpha_mode = 'CHANNEL_PACKED'
    image.pixels.foreach_set(pixels.ravel())
    image.filepath_raw = str(OUT / (name + '.png'))
    image.file_format = 'PNG'
    image.save()
    image.pack()
    return image


color_pixels, normal_pixels, roughness_pixels = atlas_arrays(PALETTE)
image = painted_image('capybara_painted', color_pixels)
mat = bpy.data.materials.new('Capivara_palette')
mat['paintAtlas'] = '4x4'
mat.use_nodes = True
bsdf = mat.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Roughness'].default_value = .87
bsdf.inputs['Specular IOR Level'].default_value = .22
texture = mat.node_tree.nodes.new('ShaderNodeTexImage')
texture.image = image
texture.interpolation = 'Linear'
mat.node_tree.links.new(texture.outputs['Color'], bsdf.inputs['Base Color'])
normal_texture = mat.node_tree.nodes.new('ShaderNodeTexImage')
normal_texture.image = painted_image('capybara_strand_normals', normal_pixels, non_color=True)
normal_node = mat.node_tree.nodes.new('ShaderNodeNormalMap')
normal_node.inputs['Strength'].default_value = .5
mat.node_tree.links.new(normal_texture.outputs['Color'], normal_node.inputs['Color'])
mat.node_tree.links.new(normal_node.outputs['Normal'], bsdf.inputs['Normal'])
roughness_texture = mat.node_tree.nodes.new('ShaderNodeTexImage')
roughness_texture.image = painted_image('capybara_surface_roughness', roughness_pixels, non_color=True)
mat.node_tree.links.new(roughness_texture.outputs['Color'], bsdf.inputs['Roughness'])
# Only eyes, nose and nails catch a soft specular. Fur and mouth stay matte.
specular = painted_image('capybara_nose_eye_specular', semantic_array('specular'), non_color=True, alpha=True)
specular_node = mat.node_tree.nodes.new('ShaderNodeTexImage')
specular_node.image = specular
specular_node.interpolation = 'Linear'
mat.node_tree.links.new(specular_node.outputs['Alpha'], bsdf.inputs['Specular IOR Level'])
# A shared emissive atlas lights only white eye glints, retaining one draw material.
emission = painted_image('capybara_eye_glints', semantic_array('emission'))
emission_node = mat.node_tree.nodes.new('ShaderNodeTexImage')
emission_node.image = emission
emission_node.interpolation = 'Closest'
mat.node_tree.links.new(emission_node.outputs['Color'], bsdf.inputs['Emission Color'])
bsdf.inputs['Emission Strength'].default_value = 1


# Coordinates are written in game space, converted to Blender only here.
def V(p):
    return Vector((p[0], -p[2], p[1]))

arm = bpy.data.armatures.new('Capivara_rig')
rig = bpy.data.objects.new('Capivara', arm)
rig['paintAtlas'] = '4x4'
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
bone('jaw', (0, 1.535, -.21), (0, 1.58, -.21), 'head')
bone('mouth_cavity', (0, 1.535, -.263), (0, 1.565, -.263), 'head')
bone('tail', (0, .62, .23), (0, .66, .29), 'spine')
for s, side in [(-1, 'L'), (1, 'R')]:
    bone('ear_' + side, (s * .115, 1.718, .085), (s * .115, 1.765, .085), 'head')
    bone('socket_' + side, (s * .176, 1.654, -.12), (s * .176, 1.698, -.12), 'head')
    bone('blink_' + side, (s * .176, 1.654, -.12), (s * .176, 1.698, -.12), 'head')
    for part in ['tip', 'peak']:
        bone('blink_' + part + '_' + side, (s * .176, 1.654, -.12), (s * .176, 1.698, -.12), 'blink_' + side)
    bone('glint_' + side, (s * .176 - .006, 1.662, -.132), (s * .176 - .006, 1.707, -.132), 'blink_' + side)
    bone('brow_' + side, (s * .13, 1.704, -.10), (s * .13, 1.736, -.10), 'head')
    bone('mouth_' + side, (s * .034, 1.535, -.263), (s * .034, 1.565, -.263), 'mouth_cavity')
    bone('thigh_' + side, (s * .137, .39, .01), (s * .137, .22, .01), 'root')
    bone('shin_' + side, (s * .137, .22, .01), (s * .137, .08, -.04), 'thigh_' + side)
    bone('foot_' + side, (s * .137, .08, -.04), (s * .137, .08, -.17), 'shin_' + side)
    # Forward hold matches the existing weapon socket at (.1, 1.05, -.4).
    hand = (s * .1, 1.045, -.39 if s == 1 else -.49)
    elbow = (s * .27, 1.00, -.19)
    bone('arm_' + side, (s * .23, 1.2, -.015), elbow, 'spine')
    bone('forearm_' + side, elbow, hand, 'arm_' + side)
    bone('paw_' + side, hand, (hand[0], hand[1], hand[2] - .1), 'forearm_' + side)
bpy.ops.object.mode_set(mode='OBJECT')
rig.select_set(False)
parts = []

def mesh_part(name, verts, faces, color, weights, subdivide=True):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([V(p) for p in verts], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    uv = mesh.uv_layers.new(name='Palette')
    for loop in uv.data:
        loop.uv = ((color + .5) / 16, .5)
    vertex_color = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
    for item in vertex_color.data:
        item.color = (1, 1, 1, 1)
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
    if subdivide:
        sub = obj.modifiers.new('Quad smoothing', 'SUBSURF')
        sub.levels = 1
        bpy.ops.object.modifier_apply(modifier=sub.name)
    # Fur sits 4 mm behind facial linework, avoiding coincident surfaces at the hit sphere.
    radius = .240 if obj.name == 'Head_and_muzzle' else .237 if obj.name == 'Torso_barrel' else .244
    # Face, muzzle and ears stay inside the head hit sphere.
    facial = {g.index for g in obj.vertex_groups if g.name == 'head' or g.name == 'jaw' or g.name.startswith(('ear_', 'blink_', 'socket_', 'glint_', 'brow_', 'mouth_'))}
    centre = V((0, 1.6, -.04))
    for vert in obj.data.vertices:
        if sum(g.weight for g in vert.groups if g.group in facial) > .5 or vert.co.z > 1.42:
            offset = vert.co - centre
            if offset.length > radius:
                vert.co = centre + offset.normalized() * radius
    parts.append(obj)
    return obj

def rounded_block(name, center, dimensions, color, weights, bevel=.02, yaw=0):
    # Real flat faces with three bevel rings, not a squashed sphere.
    bpy.ops.mesh.primitive_cube_add(size=1, location=V(center))
    obj = bpy.context.object
    obj.scale = (dimensions[0], dimensions[2], dimensions[1])
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    mod = obj.modifiers.new('Soft edges', 'BEVEL')
    mod.width, mod.segments = bevel, 3
    bpy.ops.object.modifier_apply(modifier=mod.name)
    verts = [(v.co.x, v.co.z, -v.co.y) for v in obj.data.vertices]
    # Yaw turns the front face (-z) toward direction (sin yaw, 0, -cos yaw).
    c, s = math.cos(yaw), math.sin(yaw)
    verts = [(center[0] + (x - center[0]) * c - (z - center[2]) * s, y, center[2] + (x - center[0]) * s + (z - center[2]) * c) for x, y, z in verts]
    faces = [tuple(poly.vertices) for poly in obj.data.polygons]
    bpy.data.objects.remove(obj, do_unlink=True)
    return mesh_part(name, verts, faces, color, weights, subdivide=False)

def blend(a, b, value):
    if a == b:
        return {a: 1}
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


def fine_line(name, points, radius, color, weights, near=True):
    # A low-cost smooth strand or stitch, independent from body subdivision.
    verts, faces = [], []
    for j, point in enumerate(points):
        normal = (Vector(points[min(j + 1, len(points) - 1)]) - Vector(points[max(0, j - 1)])).normalized()
        axis = normal.cross(Vector((0, 0, 1)))
        if axis.length < .001:
            axis = normal.cross(Vector((1, 0, 0)))
        axis.normalize()
        other = normal.cross(axis).normalized()
        for i in range(5):
            offset = axis * math.cos(math.tau * i / 5) + other * math.sin(math.tau * i / 5)
            verts.append(tuple(Vector(point) + offset * radius))
    for j in range(len(points) - 1):
        for i in range(5):
            a, b = j * 5 + i, j * 5 + (i + 1) % 5
            faces.append((a, b, b + 5, a + 5))
    faces.extend([tuple(reversed(range(5))), tuple((len(points) - 1) * 5 + i for i in range(5))])
    obj = mesh_part(name, verts, faces, color, weights, subdivide=False)
    obj['detail_near'] = near
    return obj


def paint_surface(obj):
    # Project each authored semantic tile over a real surface, with ample inset
    # for colour mipmaps and the smaller specular/emission masks.
    points = [(v.co.x, v.co.z, -v.co.y) for v in obj.data.vertices]
    lo = [min(p[k] for p in points) for k in range(3)]
    hi = [max(p[k] for p in points) for k in range(3)]
    span = [max(.001, hi[k] - lo[k]) for k in range(3)]
    axis = max(range(3), key=lambda k: span[k])
    for poly in obj.data.polygons:
        for loop_id in poly.loop_indices:
            loop = obj.data.loops[loop_id]
            p = points[loop.vertex_index]
            tile = min(15, int(obj.data.uv_layers.active.data[loop_id].uv.x * 16))
            if obj.name.startswith('Glint_'):
                u, v = .5, .25
            elif obj.name.startswith(('Front_incisor', 'Sclera_')):
                u, v = .5, .75
            elif obj.name.startswith('Head_and_muzzle'):
                # A box projection avoids a cylindrical pinwheel across the muzzle.
                normal = poly.normal
                if abs(normal.z) > max(abs(normal.x), abs(normal.y)):
                    u, v = (p[0] - lo[0]) / span[0], (p[2] - lo[2]) / span[2]
                elif abs(normal.x) > abs(normal.y):
                    u, v = (p[2] - lo[2]) / span[2], (hi[1] - p[1]) / span[1]
                else:
                    u, v = (p[0] - lo[0]) / span[0], (hi[1] - p[1]) / span[1]
            elif obj.name.startswith(('Torso_', 'Vest_', 'Leather_')):
                u = math.atan2(p[0], -p[2]) / math.tau + .5
                v = (hi[1] - p[1]) / span[1]
            elif obj.name.startswith(('Bandana_point', 'Belly_patch')):
                u, v = (p[0] - lo[0]) / span[0], (hi[1] - p[1]) / span[1]
            else:
                a, b = (axis + 1) % 3, (axis + 2) % 3
                u = math.atan2((p[b] - (lo[b] + hi[b]) / 2) / span[b], (p[a] - (lo[a] + hi[a]) / 2) / span[a]) / math.tau + .5
                v = (p[axis] - lo[axis]) / span[axis]
            u, v = .08 + .84 * max(0, min(1, u)), .08 + .84 * max(0, min(1, v))
            obj.data.uv_layers.active.data[loop_id].uv = ((tile % 4 + u) / 4, 1 - (tile // 4 + v) / 4)

# The cover-derived shape has a broad ribcage and a soft, full lower belly.
# The spine, hips and short leg pivots remain in their original bind locations.
# Leave room for the fitted vest inside the normal .30 m body cylinder.
profile = [(.35, .04, .04, .005), (.37, .15, .14, 0), (.42, .232, .197, -.006),
           (.49, .247, .221, -.008), (.59, .263, .236, -.008), (.70, .272, .238, -.006),
           (.81, .271, .234, -.004), (.93, .266, .228, 0), (1.05, .277, .238, .004),
           (1.17, .285, .239, .005), (1.28, .268, .216, .005),
           (1.35, .228, .185, .005), (1.402, .183, .160, 0), (1.418, .178, .158, .003),
           (1.445, .174, .150, .003), (1.476, .163, .157, .005),
           (1.510, .135, .125, .010), (1.528, .04, .04, .010)]
# Reserve real garment depth inside the unchanged body hit cylinder.
profile = [(y, rx * (.94 if .95 < y < 1.41 else 1), rz * (.94 if .95 < y < 1.41 else 1), cz) for y, rx, rz, cz in profile]
verts, faces = [], []
for y, rx, rz, cz in profile:
    for i in range(20):
        a = math.tau * i / 20
        verts.append((rx * math.cos(a), y, cz + rz * math.sin(a)))
for j in range(len(profile) - 1):
    for i in range(20):
        a, b = j * 20 + i, j * 20 + (i + 1) % 20
        faces.append((a, b, b + 20, a + 20))
faces.extend([tuple(reversed(range(20))), tuple((len(profile) - 1) * 20 + i for i in range(20))])
body_surface = mesh_part('Torso_barrel', verts, faces, 0, lambda p: blend('spine', 'neck', (p[1] - 1.04) / .33))
# Colour follows the actual surface, so the crisp belly cannot float or clip.
for poly in body_surface.data.polygons:
    center = sum((body_surface.data.vertices[v].co for v in poly.vertices), Vector()) / len(poly.vertices)
    x, y, z = center.x, center.z, -center.y
    # The lit chest band shows only in the vest V-neck, not inside the armholes.
    index = 1 if y > 1.22 and z < -.06 else 0
    for loop in poly.loop_indices:
        body_surface.data.uv_layers.active.data[loop].uv = ((index + .5) / 16, .5)
# Conforming belly patch on the barrel, with a one-centimetre colour edge.
# Its top tucks under the bandana point inside the open vest front.
patch_verts, patch_faces, patch_mix = [], [], []
for row, radius in enumerate([.001, .2, .4, .6, .8, .96, 1]):
    for i in range(32):
        angle = math.tau * i / 32
        x = .105 * radius * math.cos(angle)
        y = .75 + .245 * radius * math.sin(angle)
        hit, point, normal, face = body_surface.ray_cast(V((x, y, -1)), V((0, 0, 1)))
        assert hit, (x, y)
        point += V((0, 0, -.004))
        patch_verts.append((point.x, point.z, -point.y))
        patch_mix.append(max(0, min(1, (1 - radius) / .35)))
    if row:
        for i in range(32):
            a, b = (row - 1) * 32 + i, (row - 1) * 32 + (i + 1) % 32
            patch_faces.append((a, b, b + 32, a + 32))
patch = mesh_part('Belly_patch', patch_verts, patch_faces, 14, {'spine': 1}, subdivide=False)
def linear_rgb(hex_color):
    return tuple((v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4) for v in (int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)))
for loop in patch.data.loops:
    weight = patch_mix[loop.vertex_index]
    belly, fur = linear_rgb('D39A47'), linear_rgb(PALETTE[0])
    rgb = tuple(fur[i] * (1 - weight) + belly[i] * weight for i in range(3))
    patch.data.color_attributes['Color'].data[loop.index].color = (*rgb, 1)
# A single longitudinal quad surface joins the cheeks and broad blunt muzzle.
# The skull is a long rounded rectangle, not a sphere with an attached snout.
# A nearly level brow-to-nose line and a vertical front plane carry the brand
# silhouette. The small lower jaw tucks behind the deep upper lip.
head_profile = [(.173, .018, 1.588, .036), (.163, .071, 1.588, .091),
                (.139, .126, 1.582, .133), (.092, .166, 1.572, .153),
                (.035, .179, 1.572, .155), (-.035, .176, 1.574, .145),
                (-.094, .158, 1.582, .128), (-.151, .141, 1.593, .116),
                (-.196, .120, 1.605, .103), (-.226, .101, 1.615, .087),
                (-.242, .082, 1.618, .082), (-.247, .078, 1.618, .080),
                (-.249, .065, 1.618, .066), (-.250, .001, 1.618, .001)]
verts, faces = [], []
segments = 32
for z, rx, cy, ry in head_profile:
    for i in range(segments):
        a = math.tau * i / segments
        # Broad top, underside and cheek planes soften into rounded corners.
        power = .72 if z > -.13 else .60
        shape = lambda v: math.copysign(abs(v) ** power, v)
        verts.append((rx * shape(math.cos(a)), cy + ry * shape(math.sin(a)), z))
for row in range(len(head_profile) - 1):
    for i in range(segments):
        a, b = row * segments + i, row * segments + (i + 1) % segments
        faces.append((a, b, b + segments, a + segments))
faces += [tuple(reversed(range(segments))), tuple((len(head_profile) - 1) * segments + i for i in range(segments))]
head_surface = mesh_part('Head_and_muzzle', verts, faces, 0, lambda p: blend('head', 'jaw', max(0, (1.56 - p[1]) / .055) * max(0, min(1, (-p[2] - .06) / .1))))
# Keep an untouched reference for attaching the recessed features to the fur.
reference = head_surface.copy()
reference.data = head_surface.data.copy()
scene.collection.objects.link(reference)
bm = bmesh.new()
bm.from_mesh(head_surface.data)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(head_surface.data)
bm.free()

def fur_point(x, y):
    hit, point, normal, face = reference.ray_cast(V((x, y, -1)), V((0, 0, 1)))
    assert hit, ('face surface', x, y)
    return point

mouth_point = fur_point(0, 1.535)
# Shallow lateral sockets preserve profile readability. Geometry and bones use
# the same tangent plane, so squints and arcs remain on the curved cheek.
eye_frames = {}
for side in [-1, 1]:
    hit, point, normal, face = reference.ray_cast(V((side, 1.674, -.060)), V((-side, 0, 0)))
    assert hit, ('lateral eye surface', side)
    normal = normal.normalized()
    if normal.dot(V((side, 0, 0))) < 0:
        normal.negate()
    # A little forward-facing tilt keeps the high side-set eyes expressive in
    # the front view while their centres remain behind the long upper muzzle.
    normal = (normal * .78 + V((0, 0, -1)) * .34).normalized()
    up = V((0, 1, 0))
    tangent = up.cross(normal).normalized()
    up = normal.cross(tangent).normalized()
    eye_frames[side] = (point, normal, tangent, up)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1)
    cutter = bpy.context.object
    for vertex in cutter.data.vertices:
        x, y, z = vertex.co
        vertex.co = point + normal * (.018 + y * .024) + tangent * x * .035 + up * z * .031
    bm = bmesh.new()
    bm.from_mesh(cutter.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(cutter.data)
    bm.free()
    bpy.context.view_layer.objects.active = head_surface
    cut = head_surface.modifiers.new('Lateral eye recess', 'BOOLEAN')
    cut.operation, cut.solver, cut.object = 'DIFFERENCE', 'EXACT', cutter
    bpy.ops.object.modifier_apply(modifier=cut.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
# Face bones share the tangent frame used by the lateral eye geometry.
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for sign, side in [(-1, 'L'), (1, 'R')]:
    point, normal, tangent, up = eye_frames[sign]
    centre = point - normal * .0005
    for prefix in ['socket_', 'blink_', 'blink_tip_', 'blink_peak_', 'glint_']:
        b = arm.edit_bones[prefix + side]
        b.head = centre if prefix != 'glint_' else centre - tangent * .006 + up * .008 + normal * .002
        b.tail = b.head + up * .044
        b.align_roll(normal)
    brow = arm.edit_bones['brow_' + side]
    brow.head = point + up * .033
    brow.tail = brow.head + up * .032
    brow.align_roll(normal)
bpy.ops.object.mode_set(mode='OBJECT')
rig.select_set(False)
# The mouth rim and cavity close together; neutral has no dark oval decal.
for group in list(head_surface.vertex_groups):
    head_surface.vertex_groups.remove(group)
for name in ['head', 'jaw', 'mouth_cavity', 'mouth_L', 'mouth_R', 'socket_L', 'socket_R']:
    head_surface.vertex_groups.new(name=name)
for vertex in head_surface.data.vertices:
    x, y, z = vertex.co.x, vertex.co.z, -vertex.co.y
    mouth_weight = 0  # Facial linework animates over an undistorted flat muzzle.
    jaw_weight = max(0, min(1, (1.56 - y) / .055)) * max(0, min(1, (-z - .06) / .1)) * (1 - mouth_weight)
    mouth_side = 'L' if x < 0 else 'R'
    corner_weight = mouth_weight * .6 * min(1, abs(x) / .034) ** 2
    eye_side = 'L' if x < 0 else 'R'
    eye_point = eye_frames[-1 if x < 0 else 1][0]
    eye_distance = ((vertex.co - eye_point).length / .045)
    eye_weight = max(0, min(1, (1.4 - eye_distance) / .3))
    for name, weight in [('head', max(0, 1 - jaw_weight - mouth_weight - eye_weight)), ('jaw', jaw_weight), ('mouth_cavity', mouth_weight - corner_weight), ('mouth_' + mouth_side, corner_weight), ('socket_' + eye_side, eye_weight)]:
        if weight > 0:
            head_surface.vertex_groups[name].add([vertex.index], weight, 'REPLACE')

# Broad painted value changes interpolate across vertices, avoiding jagged bands.
base_rgb, light_rgb, shadow_rgb = [linear_rgb(PALETTE[i]) for i in [0, 1, 2]]
for poly in head_surface.data.polygons:
    for loop_index in poly.loop_indices:
        vertex = head_surface.data.vertices[head_surface.data.loops[loop_index].vertex_index]
        y = vertex.co.z
        x, z = vertex.co.x, -vertex.co.y
        light = max(0, min(1, (y - 1.61) / .135))
        shadow = max(0, min(1, (1.53 - y) / .085))
        # Broad value transitions follow the volume beneath the darker muzzle.
        muzzle = max(0, min(1, (-z - .15) / .05))
        up = vertex.normal.z
        light = light * (1 - muzzle) + muzzle * max(0, min(1, (up - .15) / .35))
        shadow = shadow * (1 - muzzle) + muzzle * max(0, min(1, (-up - .35) / .4))
        rgb = [base_rgb[i] * (1 - light) + light_rgb[i] * light for i in range(3)]
        rgb = [rgb[i] * (1 - shadow) + shadow_rgb[i] * shadow for i in range(3)]
        muzzle_shade = max(0, min(1, (-z - .095) / .13)) * math.exp(-((y - 1.604) / .145) ** 2) * .88
        muzzle_rgb = linear_rgb('4A3327')
        rgb = [rgb[i] * (1 - muzzle_shade) + muzzle_rgb[i] * muzzle_shade for i in range(3)]
        head_surface.data.uv_layers.active.data[loop_index].uv = (14.5 / 16, .5)
        head_surface.data.color_attributes['Color'].data[loop_index].color = (*rgb, 1)
# Separate facial linework keeps expression colour and deformation local.
# The broad flat muzzle stays intact as the mouth closes to a fine line.
lining = ellipsoid('Mouth_lining', (0, 1.535, -mouth_point.y - .001), (.034, .015, .001), 3, {'mouth_cavity': 1}, segments=16, rings=8)
for sign in [-1, 1]:
    tooth = rounded_block('Front_incisor', (sign * .006, 1.532, -mouth_point.y - .0025), (.009, .008, .003), 10, {'jaw': 1}, bevel=.0015)
    for color in tooth.data.color_attributes['Color'].data:
        color.color = (*linear_rgb('F5E8C5'), 1)
# A broad, shallow oval pad follows the upper muzzle. Narrow slits avoid the
# socket-like pair of circular dots inside a rectangular badge.
ellipsoid('Nose_pad', (0, 1.681, -.246), (.075, .028, .017), 15, {'head': 1}, square=.76, segments=24, rings=12)
for side in [-1, 1]:
    ellipsoid('Nostril_slit', (side * .034, 1.684, -.260), (.012, .006, .003), 9, {'head': 1}, segments=16, rings=8)
    for strand in range(3):
        x, y = side * (.066 + strand * .010), 1.575 - strand * .009
        point = fur_point(x, y)
        start = Vector((point.x, point.z, -point.y - .001))
        middle = start + Vector((side * .022, .003 - strand * .003, .010))
        tip = start + Vector((side * .045, .007 - strand * .007, .028))
        fine_line('Whisker', [tuple(start), tuple(middle), tuple(tip)], .00075, 4, {'head': 1})
        ellipsoid('Whisker_follicle', tuple(start), (.0018, .0018, .001), 2, {'head': 1}, segments=6, rings=4)
cleft = []
for y in [1.651, 1.627, 1.603, 1.579, 1.555]:
    point = fur_point(0, y) + V((0, 0, -.0008))
    cleft.append((point.x, point.z, -point.y))
fine_line('Upper_lip_cleft', cleft, .0012, 2, {'head': 1})
# A fur-coloured lower lip and fine wine rim articulate the actual cavity.
for name, angles, radius, color in [('Lower_lip', range(180, 361, 30), .003, 0), ('Lip_line', range(0, 361, 30), .0012, 3)]:
    points = []
    for angle in angles:
        a = math.radians(angle)
        x, y = .034 * math.cos(a), 1.535 + .015 * math.sin(a)
        point = fur_point(x, y) + V((0, 0, -.0008))
        points.append((point.x, point.z, -point.y))
    lip = tube(name, points, [radius] * len(points), color, ['mouth_cavity', 'mouth_cavity'])
    for side in ['L', 'R']:
        lip.vertex_groups.new(name='mouth_' + side)
    for vertex in lip.data.vertices:
        corner = .6 * min(1, abs(vertex.co.x) / .034) ** 2
        lip.vertex_groups['mouth_cavity'].add([vertex.index], 1 - corner, 'REPLACE')
        lip.vertex_groups['mouth_' + ('L' if vertex.co.x < 0 else 'R')].add([vertex.index], corner, 'REPLACE')
for s, side in [(-1, 'L'), (1, 'R')]:
    points = []
    for x, y in [(.026, 1.535), (.039, 1.539), (.053, 1.547), (.058, 1.552)]:
        point = fur_point(s * x, y) + V((0, 0, -.0012))
        points.append((point.x, point.z, -point.y))
    fine_line('Smile_corner_' + side, points, .0014, 3, {'head': .4, 'mouth_' + side: .6})
for s, side in [(-1, 'L'), (1, 'R')]:
    def lid_weights(point):
        tip = .45 * max(0, 1 - abs((point[1] - 1.654) / .024))
        peak = .45 * max(0, 1 - abs((point[0] - s * .176) / .021))
        return {'blink_' + side: 1 - tip - peak, 'blink_tip_' + side: tip, 'blink_peak_' + side: peak}
    # Nested convex eye surfaces give a visible iris and pupil at play distance.
    # All layers share the blink rig; sclera uses the non-emissive ivory tile half.
    layers = [
        ('Sclera_', (.032, .027, .010), 10, 0, 0, -.003, 'D8C3A3'),
        ('Iris_', (.026, .024, .012), 12, -s * .003, .001, .003, '9B6338'),
        ('Eye_', (.013, .020, .009), 9, -s * .005, .002, .013, None),
        ('Glint_', (.0045, .006, .002), 10, -.010, .012, .023, None),
        ('Glint_small_', (.002, .0025, .0015), 10, .007, -.010, .022, None),
    ]
    for label, scale, tile, dx, dy, depth, tint in layers:
        patch = ellipsoid(label + side, (s * .176 + dx, 1.654 + dy, -.12), scale, tile,
                          {'glint_' + side: 1} if label.startswith('Glint') else lid_weights, segments=16, rings=10)
        if tint:
            for color in patch.data.color_attributes['Color'].data:
                color.color = (*linear_rgb(tint), 1)
        for vertex in patch.data.vertices:
            x, y, z = vertex.co.x, vertex.co.z, -vertex.co.y
            point, normal, tangent, up = eye_frames[s]
            vertex.co = point + tangent * (x - s * .176) + up * (y - 1.654) + normal * (depth - (z + .12))
    point, normal, tangent, up = eye_frames[s]
    for label, lift, radius, tile in [('Upper_lid_', .028, .0058, 2), ('Brow_ridge_', .039, .012, 0), ('Lower_lid_', -.025, .003, 2)]:
        points = []
        for i in range(9):
            t = i / 8 * math.pi
            p = point + tangent * (-.034 * math.cos(t)) + up * (lift * math.sin(t)) + normal * (.006 if lift < .04 else -.002)
            points.append((p.x, p.z, -p.y))
        tube(label + side, points, [radius * (.35 + .65 * math.sin(i / 8 * math.pi)) for i in range(9)], tile,
             ['brow_' + side, 'head'] if label.startswith('Brow') else ['blink_' + side, 'blink_' + side])
    # A small cupped ear has a rolled fur rim and a recessed warm inner bowl.
    # Closed back/front rings avoid an opaque oval pasted onto another oval.
    verts, faces = [], []
    ear_rings = [(.001,.015),(.60,.017),(1,.002),(1,-.010),(.80,-.015),(.62,-.008),(.001,.007)]
    tilt = s * .25
    for radius, depth in ear_rings:
        for i in range(20):
            angle = math.tau * i / 20
            x, y = .026 * radius * math.cos(angle), .030 * radius * math.sin(angle)
            verts.append((s * .105 + x * math.cos(tilt) - depth * math.sin(tilt),
                          1.732 + y, .108 + x * math.sin(tilt) + depth * math.cos(tilt)))
    for row in range(len(ear_rings) - 1):
        for i in range(20):
            a, b = row * 20 + i, row * 20 + (i + 1) % 20
            faces.append((a, b, b + 20, a + 20))
    faces.extend([tuple(reversed(range(20))), tuple((len(ear_rings) - 1) * 20 + i for i in range(20))])
    ear = mesh_part('Ear_' + side, verts, faces, 14, {'ear_' + side: .88, 'head': .12}, subdivide=False)
    # Continuous vertex paint keeps the tiny recessed cup calm under decimation.
    # Hard atlas-tile borders would turn its curved bowl into coloured wedges.
    outer, inner = linear_rgb(PALETTE[0]), linear_rgb('52382C')
    for loop in ear.data.loops:
        ring = loop.vertex_index // 20
        shade = [0, 0, 0, 0, .32, .78, 1][ring]
        ear.data.color_attributes['Color'].data[loop.index].color = (*[outer[i] * (1 - shade) + inner[i] * shade for i in range(3)], 1)
    bpy.context.view_layer.objects.active = ear
    smooth = ear.modifiers.new('Soft ear rim', 'SUBSURF')
    smooth.levels = 1
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    # A bent knee and narrow ankle flow into an elevated heel. Four long padded
    # toes carry the ground contact, rather than disappearing inside a flat boot.
    leg = tube('Leg_' + side, [(s * .137, .41, .01), (s * .137, .35, .004),
                               (s * .137, .26, -.032), (s * .137, .18, -.022),
                               (s * .137, .12, .014), (s * .137, .081, -.020)],
               [.10, .116, .094, .075, .051, .044], 14,
               ['thigh_' + side, 'thigh_' + side, 'shin_' + side, 'shin_' + side, 'foot_' + side])
    warm, dark = linear_rgb(PALETTE[0]), linear_rgb(PALETTE[2])
    for loop in leg.data.loops:
        y = leg.data.vertices[loop.vertex_index].co.z
        t = max(0, min(1, (.23 - y) / .11))
        t = t * t * (3 - 2 * t)
        leg.data.color_attributes['Color'].data[loop.index].color = (*[warm[i] * (1 - t) + dark[i] * t for i in range(3)], 1)
    verts, faces = [], []
    foot_profile = [(.066,.015,.093,.013), (.048,.048,.087,.036), (.022,.066,.074,.058),
                    (-.025,.088,.055,.049), (-.068,.087,.038,.032), (-.100,.067,.032,.025),
                    (-.109,.002,.031,.002)]
    for z, rx, cy, ry in foot_profile:
        for i in range(20):
            angle = i * math.tau / 20
            width = math.copysign(abs(math.cos(angle)) ** .8, math.cos(angle))
            verts.append((s * .137 + rx * width, cy + ry * math.sin(angle), z))
    for row in range(len(foot_profile) - 1):
        for i in range(20):
            a, b = row * 20 + i, row * 20 + (i + 1) % 20
            faces.append((a, b, b + 20, a + 20))
    faces.extend([tuple(reversed(range(20))), tuple((len(foot_profile) - 1) * 20 + i for i in range(20))])
    mesh_part('Foot_' + side, verts, faces, 2, {'foot_' + side: 1})
    for toe in [-1.5, -.5, .5, 1.5]:
        x, shorten = s * .137 + toe * .037, abs(toe) * .010
        points = [(x, .051, -.071), (x, .050, -.096), (x, .039, -.130 + shorten),
                  (x, .028, -.169 + shorten), (x, .027, -.194 + shorten), (x, .027, -.204 + shorten)]
        tube('Toe_' + side, points, [.014, .025, .028, .024, .017, .003], 2, ['foot_' + side, 'foot_' + side])
        ellipsoid('Toe_nail_' + side, (x, .041, -.185 + shorten), (.014, .011, .024), 15,
                  {'foot_' + side: 1}, segments=12, rings=8)
    hand_z = -.39 if s == 1 else -.49
    tube('Arm_' + side, [(s * .225, 1.195, -.015), (s * .267, 1.12, -.08), (s * .27, 1.0, -.19), (s * .2, 1.016, (hand_z - .19) / 2), (s * .1, 1.045, hand_z)], [.075, .102, .089, .078, .053], 0,
         ['arm_' + side, 'arm_' + side, 'forearm_' + side, 'forearm_' + side, 'paw_' + side])
    ellipsoid('Paw_' + side, (s * .1, 1.045, hand_z + .002), (.067, .051, .073), 2, {'paw_' + side: 1}, square=.85)
    # Four distinct padded fingers and a wrapping thumb match the hero FP paws.
    for finger in [-1.5, -.5, .5, 1.5]:
        x = s * .1 + finger * .033
        short = abs(finger) * .005
        points = [(x, 1.052, hand_z - .030), (x, 1.061, hand_z - .050),
                  (x, 1.064, hand_z - .072 + short), (x, 1.052, hand_z - .092 + short),
                  (x, 1.028, hand_z - .100 + short), (x, 1.012, hand_z - .087 + short)]
        tube('Finger_' + side, points, [.012, .019, .020, .019, .016, .009], 2, ['paw_' + side, 'paw_' + side])
        ellipsoid('Finger_pad_' + side, (x, 1.012, hand_z - .074 + short), (.013, .009, .020), 4, {'paw_' + side: 1}, segments=10, rings=6)
        ellipsoid('Claw_' + side, (x, 1.026, hand_z - .104 + short), (.012, .015, .011), 15, {'paw_' + side: 1}, segments=10, rings=6)
    tube('Thumb_' + side, [(s * .1 - s * .057, 1.041, hand_z - .012), (s * .1 - s * .075, 1.028, hand_z - .041),
                         (s * .1 - s * .065, 1.015, hand_z - .067), (s * .1 - s * .045, 1.018, hand_z - .072)],
         [.014, .023, .021, .010], 2, ['paw_' + side, 'paw_' + side])
    ellipsoid('Thumb_claw_' + side, (s * .1 - s * .045, 1.025, hand_z - .074), (.014, .010, .015), 15, {'paw_' + side: 1}, segments=10, rings=6)
    ellipsoid('Paw_pad_' + side, (s * .1, .998, hand_z - .020), (.043, .008, .047), 4, {'paw_' + side: 1}, segments=12, rings=6)
bpy.data.objects.remove(reference, do_unlink=True)
# No visible tail. Cloth band hugs the neck with a thin flat cross section.
verts, faces = [], []
for y in [1.434, 1.442, 1.451, 1.459]:
    for i in range(32):
        a = math.tau * i / 32
        height = y + .002 * math.sin(a * 2 + .4)
        outward = V((math.cos(a), 0, math.sin(a)))
        hit, point, normal, face = body_surface.ray_cast(V((0, height, 0)) + outward, -outward)
        assert hit, ('bandana neck contact', a, height)
        if normal.dot(outward) < 0:
            normal.negate()
        point += normal.normalized() * .006
        verts.append((point.x, point.z, -point.y))
for row in range(3):
    for i in range(32):
        a, b = row * 32 + i, row * 32 + (i + 1) % 32
        faces.append((a, b, b + 32, a + 32))
mesh_part('Bandana_band', verts, faces, 5, {'neck': 1}, subdivide=False)
rounded_block('Bandana_knot', (-.105, 1.440, .115), (.065, .027, .015), 6, {'neck': 1}, bevel=.012)
flap_verts, flap_faces = [], []
for row in range(17):
    t = row / 16
    y, width = 1.452 - .332 * t, max(.001, .13 * (1 - t) ** .9)
    for i in range(13):
        x = width * (i / 6 - 1)
        hit, point, normal, face = body_surface.ray_cast(V((x, y, -.5)), V((0, 0, 1)))
        assert hit, ('cloth flap surface', x, y)
        fold = .012 + .004 * math.sin(i / 12 * math.tau * 2 + t * 2.2) * math.sin(t * math.pi)
        point += V((0, 0, -fold))
        flap_verts.append((point.x, point.z, -point.y))
for row in range(16):
    for col in range(12):
        a = row * 13 + col
        flap_faces.append((a, a + 1, a + 14, a + 13))
flap = mesh_part('Bandana_point', flap_verts, flap_faces, 5,
                 lambda p: blend('spine', 'neck', max(0, min(1, (p[1] - 1.2) / .25))), subdivide=False)
flap.vertex_groups.new(name='cloth_clearance').add(list(range(len(flap.data.vertices))), 1, 'REPLACE')

# Open-front olive vest that wraps chest, sides and back like a garment.
# It is sampled on the torso surface in (angle from front, height) space, so
# it follows the barrel instead of floating as a separate tube or backpack.
def torso_point(a, y, offset):
    # a = 0 faces forward (-z); positive angles turn toward +x.
    outward = Vector((math.sin(a), 0, -math.cos(a)))
    origin = Vector((0, y, .005)) + outward
    hit, point, normal, face = body_surface.ray_cast(V(origin), V(-outward))
    assert hit, ('torso surface', a, y)
    normal = normal.normalized()
    if normal.dot(V(outward)) < 0:
        normal.negate()
    point = point + normal * offset
    return (point.x, point.z, -point.y), normal
# A fitted olive shirt and compact cargo shorts replace the long bare belly.
# Surface-sampled garment bands retain the exact body collision envelope.
for garment, rows_y, tile, outset in [
    ('Shirt_body', [.838, .85, .94, 1.00, 1.12, 1.25, 1.35, 1.39], 7, .002),
    ('Belt', [.733, .740, .779, .785], 8, .018),
]:
    verts, faces = [], []
    for y in rows_y:
        for i in range(32):
            a = i * math.tau / 32
            verts.append(torso_point(a, y, outset)[0])
    for row in range(len(rows_y) - 1):
        for i in range(32):
            a, b = row * 32 + i, row * 32 + (i + 1) % 32
            faces.append((a, a + 32, b + 32, b))
    mesh_part(garment, verts, faces, tile, lambda p: blend('spine', 'neck', (p[1] - 1.04) / .33), subdivide=False)

# A continuous pair of shorts joins the waist to both leg openings. Sharing the
# crotch and hip vertices prevents separate garment bands opening during crouch.
def shorts_weights(p):
    t = max(0, min(1, (p[1] - .365) / .30))
    t = t * t * (3 - 2 * t)
    right = max(0, min(1, .5 + p[0] / .09))
    return {'spine': t, 'thigh_L': (1 - t) * (1 - right), 'thigh_R': (1 - t) * right}

verts, faces, shared = [], [], {}
segments = 32
def shorts_vertex(p):
    key = tuple(round(v, 7) for v in p)
    if key not in shared:
        shared[key] = len(verts)
        verts.append(p)
    return shared[key]

for s in [-1, 1]:
    rings = []
    for y, rx, rz in [(.345, .128, .139), (.355, .133, .147), (.390, .132, .163), (.49, .126, .180), (.575, .121, .184)]:
        rings.append([shorts_vertex((s * (.137 + rx * math.cos(i * math.tau / segments)), y,
                                     .010 + rz * math.sin(i * math.tau / segments))) for i in range(segments)])
    hip = []
    for i in range(segments):
        a = i * math.tau / segments
        if math.cos(a) >= -1e-7:
            p = torso_point(math.atan2(s * math.cos(a), -math.sin(a)), .65, .008)[0]
        else:
            p = (0, .65 - .105 * abs(math.cos(a)), .005 + .205 * math.sin(a))
        hip.append(shorts_vertex(p))
    rings.append(hip)
    for lower, upper in zip(rings, rings[1:]):
        for i in range(segments):
            j = (i + 1) % segments
            faces.append((lower[i], lower[j], upper[j], upper[i]))
    faces.append(tuple(reversed(rings[0])))

waist = []
for y in [.65, .705, .755, .765]:
    ring = []
    for i in range(segments):
        a = i * math.tau / segments
        ring.append(shorts_vertex(torso_point(math.atan2(math.cos(a), -math.sin(a)), y, .008)[0]))
    waist.append(ring)
for lower, upper in zip(waist, waist[1:]):
    for i in range(segments):
        j = (i + 1) % segments
        faces.append((lower[i], lower[j], upper[j], upper[i]))
faces.append(tuple(waist[-1]))
shorts = mesh_part('Cargo_shorts', verts, faces, 13, shorts_weights, subdivide=False)
bm = bmesh.new()
bm.from_mesh(shorts.data)
assert all(edge.is_manifold for edge in bm.edges), 'Shorts need a continuous waist and crotch'
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(shorts.data)
bm.free()
for s, side in [(-1, 'L'), (1, 'R')]:
    rounded_block('Cargo_pocket_' + side, (s * .139, .514, -.186), (.105, .114, .026), 7, shorts_weights, bevel=.014)
    rounded_block('Cargo_flap_' + side, (s * .139, .562, -.205), (.109, .032, .012), 13, shorts_weights, bevel=.006)
    ellipsoid('Cargo_snap_' + side, (s * .139, .557, -.213), (.005, .005, .003), 12, shorts_weights, segments=8, rings=6)
    tube('Shirt_sleeve_' + side, [(s * .221, 1.199, -.013), (s * .237, 1.181, -.035),
                                (s * .258, 1.135, -.069), (s * .266, 1.112, -.085)],
         [.070, .108, .112, .105], 7, ['arm_' + side, 'arm_' + side])
    tube('Sleeve_cuff_' + side, [(s * .263, 1.127, -.075), (s * .267, 1.108, -.087)], [.112, .106], 13, ['arm_' + side, 'arm_' + side])
belt_centre = torso_point(0, .759, .024)[0]
rounded_block('Belt_buckle', belt_centre, (.075, .054, .013), 12, {'spine': 1}, bevel=.009)
rounded_block('Belt_buckle_inset', (belt_centre[0], belt_centre[1], belt_centre[2] - .008), (.049, .030, .006), 8, {'spine': 1}, bevel=.005)
VEST_HEM, VEST_TOP, VEST_GAP = .85, 1.405, .24
def vest_gap(y):
    # A V-neck: the front opening widens toward the neck and clears the bandana point.
    t = max(0, min(1, (y - 1.05) / (VEST_TOP - 1.05)))
    return VEST_GAP + .63 * t * t * (3 - 2 * t)
ARMHOLE_A, ARMHOLE_Y, ARMHOLE_DA, ARMHOLE_DY = 1.48, 1.19, .36, .125
def armhole(a, y):
    return ((abs(a) - ARMHOLE_A) / ARMHOLE_DA) ** 2 + ((y - ARMHOLE_Y) / ARMHOLE_DY) ** 2
columns, rows = 64, 30
grid = [[None] * (columns + 1) for _ in range(rows + 1)]
for j in range(rows + 1):
    y = VEST_HEM + (VEST_TOP - VEST_HEM) * j / rows
    gap = vest_gap(y)
    for i in range(columns + 1):
        # Left front edge, around the back, to the right front edge.
        a = -(gap + (math.tau - 2 * gap) * i / columns)
        a = (a + math.pi) % math.tau - math.pi
        grid[j][i] = [a, y]
keep = {(j, i) for j in range(rows) for i in range(columns)
        if armhole(sum(grid[j + dj][i + di][0] for dj in (0, 1) for di in (0, 1)) / 4,
                   sum(grid[j + dj][i + di][1] for dj in (0, 1) for di in (0, 1)) / 4) > 1}
# Snap every vertex on a hole boundary onto the ellipse, giving a smooth armhole.
for j in range(rows + 1):
    for i in range(columns + 1):
        around = [(j + dj, i + di) for dj in (-1, 0) for di in (-1, 0) if 0 <= j + dj < rows and 0 <= i + di < columns]
        if any(c in keep for c in around) and not all(c in keep for c in around):
            a, y = grid[j][i]
            if abs(abs(a) - ARMHOLE_A) < ARMHOLE_DA * 1.6 and abs(y - ARMHOLE_Y) < ARMHOLE_DY * 1.6:
                scale = armhole(a, y) ** -.5
                side = math.copysign(1, a)
                grid[j][i] = [side * (ARMHOLE_A + (abs(a) - ARMHOLE_A) * scale), ARMHOLE_Y + (y - ARMHOLE_Y) * scale]
index, verts, faces = {}, [], []
for j, i in sorted(keep):
    quad = []
    for dj, di in [(0, 0), (0, 1), (1, 1), (1, 0)]:
        key = (j + dj, i + di)
        if key not in index:
            index[key] = len(verts)
            a, y = grid[key[0]][key[1]]
            fold = .003 * math.sin(a * 13 + y * 23) * math.sin(math.pi * (y - VEST_HEM) / (VEST_TOP - VEST_HEM))
            verts.append(torso_point(a, y, .004 + fold)[0])
        quad.append(index[key])
    faces.append(tuple(quad))
vest = mesh_part('Vest_wrap', verts, faces, 13, lambda p: blend('spine', 'neck', (p[1] - 1.04) / .33), subdivide=False)
bpy.context.view_layer.objects.active = vest
thickness = vest.modifiers.new('Cloth thickness', 'SOLIDIFY')
thickness.thickness, thickness.offset, thickness.use_even_offset = .012, 1, True
bpy.ops.object.modifier_apply(modifier=thickness.name)
bm = bmesh.new()
bm.from_mesh(vest.data)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(vest.data)
bm.free()
VEST_OUT = .004 + .012
for side in [-1, 1]:
    # A padded, slightly pinched canvas shell gives each pouch real volume.
    a = side * (VEST_GAP + .36)
    centre, normal = torso_point(a, .991, VEST_OUT + .023)
    centre = Vector(centre)
    outward = Vector((normal.x, normal.z, -normal.y))
    tangent, up = Vector((math.cos(a), 0, math.sin(a))), Vector((0, 1, 0))
    verts, faces = [], []
    pouch_rings = [(-.023,.045,.070), (-.018,.056,.082), (0,.059,.086),
                   (.019,.055,.081), (.025,.045,.069), (.028,.001,.001)]
    for depth, rx, ry in pouch_rings:
        for i in range(24):
            angle = i * math.tau / 24
            shape = lambda value: math.copysign(abs(value) ** .55, value)
            point = centre + tangent * (rx * shape(math.cos(angle))) + up * (ry * shape(math.sin(angle))) + outward * depth
            verts.append(tuple(point))
    for row in range(len(pouch_rings) - 1):
        for i in range(24):
            a0, b = row * 24 + i, row * 24 + (i + 1) % 24
            faces.append((a0, b, b + 24, a0 + 24))
    faces.extend([tuple(reversed(range(24))), tuple((len(pouch_rings) - 1) * 24 + i for i in range(24))])
    mesh_part('Vest_pocket', verts, faces, 7, {'spine': 1})
    flap = centre + up * .067 + outward * .028
    rounded_block('Pocket_flap', tuple(flap), (.118, .042, .016), 13, {'spine': 1}, bevel=.009,
                  yaw=math.atan2(normal.x, normal.y))
    # A soft gusset and short retention tab articulate the curved front face.
    seam = [centre + tangent * x + up * y + outward * .022 for x, y in
            [(-.045,.038),(-.045,-.037),(-.032,-.065),(.032,-.065),(.045,-.037),(.045,.038)]]
    fine_line('Pouch_gusset', [tuple(point) for point in seam], .0017, 13, {'spine': 1})
    tab = centre + up * .018 + outward * .031
    rounded_block('Pouch_tab', tuple(tab), (.021,.060,.007), 8, {'spine': 1}, bevel=.003,
                  yaw=math.atan2(normal.x, normal.y))
    # Player-colour trim follows the front edge of each panel.
    trim = [torso_point(side * vest_gap(y), y, VEST_OUT)[0] for y in [VEST_HEM + .01, .95, 1.1, 1.22, 1.32, VEST_TOP - .01]]
    tube('Vest_trim', trim, [.011] * len(trim), 5, ['spine', 'neck'])
    # Pouch seams, brass snaps and shoulder webbing follow the garment surface.
    a = side * (VEST_GAP + .36)
    centre, normal = torso_point(a, .991, VEST_OUT + .049)
    outward = Vector((normal.x, normal.z, -normal.y))
    tangent, up = Vector((math.cos(a), 0, math.sin(a))), Vector((0, 1, 0))
    centre = Vector(centre)
    for edge in [-1, 1]:
        for stitch in range(6):
            at = centre + tangent * edge * .035 + up * (-.042 + stitch * .014)
            fine_line('Pocket_stitch', [tuple(at), tuple(at + up * .007)], .0010, 4, {'spine': 1})
    snap = centre + up * .041 + outward * .006
    ellipsoid('Pouch_snap', tuple(snap), (.006, .006, .003), 12, {'spine': 1}, segments=8, rings=6)
    shoulder = [torso_point(side * 1.05, y, VEST_OUT + .006)[0] for y in [1.35, 1.28, 1.21, 1.14]]
    fine_line('Shoulder_webbing', shoulder, .009, 8, lambda p: blend('spine', 'neck', (p[1] - 1.04) / .33), near=False)
    centre, normal = torso_point(side * 1.05, 1.22, VEST_OUT + .018)
    c = Vector(centre)
    corners = [c + tangent * x + up * y for x, y in [(-.016, -.021), (.016, -.021), (.016, .021), (-.016, .021), (-.016, -.021)]]
    fine_line('Shoulder_buckle', [tuple(p) for p in corners], .003, 12, {'spine': .65, 'neck': .35}, near=False)
    fine_line('Buckle_pin', [tuple(c - tangent * .014), tuple(c + tangent * .014)], .002, 12, {'spine': .65, 'neck': .35})

# An embroidered capybara patch sits above the left pouch.
patch_a = -.88
centre, normal = torso_point(patch_a, 1.15, VEST_OUT + .018)
rounded_block('Capy_patch_canvas', centre, (.075, .057, .008), 13, {'spine': .7, 'neck': .3}, bevel=.006, yaw=math.atan2(normal.x, normal.y))
outward = Vector((normal.x, normal.z, -normal.y))
tangent = Vector((math.cos(patch_a), 0, math.sin(patch_a)))
patch_centre = Vector(centre) + outward * .006
for name, offset, radius in [('Patch_capy_head', (0, .003), (.018, .013, .004)), ('Patch_capy_muzzle', (.014, -.002), (.014, .010, .004)), ('Patch_capy_ear', (-.008, .014), (.005, .005, .003))]:
    point = patch_centre + tangent * offset[0] + Vector((0, offset[1], 0))
    ellipsoid(name, tuple(point), radius, 4, {'spine': .7, 'neck': .3}, segments=8, rings=6)
for edge in [-1, 1]:
    for stitch in range(5):
        point = patch_centre + tangent * (-.028 + stitch * .014) + Vector((0, edge * .022, 0))
        fine_line('Patch_stitch', [tuple(point), tuple(point + tangent * .006)], .0009, 4, {'spine': .7, 'neck': .3})

# A broad rolled blanket fills the back silhouette within the same hit cylinder.
# Smaller end radii leave room for the visible fabric spirals and corner straps.
roll_y, roll_depth = 1.305, .197
roll_x = [-.175,-.173,-.166,-.140,-.080,0,.080,.140,.166,.173,.175]
roll_points = [(x, roll_y, roll_depth) for x in roll_x]
blanket = tube('Canvas_roll', roll_points, [.001,.046,.050,.060,.062,.062,.062,.060,.050,.046,.001], 7, ['spine','spine'])
blanket.vertex_groups.new(name='neck')
for vertex in blanket.data.vertices:
    blanket.vertex_groups['spine'].add([vertex.index], .52, 'REPLACE')
    blanket.vertex_groups['neck'].add([vertex.index], .48, 'REPLACE')
for side in [-1,1]:
    x = side * .175
    points = []
    for step in range(49):
        t = step / 48
        angle, radius = t * math.tau * 2.3, .004 + t * .037
        points.append((x + side * .003, roll_y + math.cos(angle) * radius, roll_depth + math.sin(angle) * radius))
    fine_line('Blanket_spiral', points, .0028, 13, {'spine': .52,'neck': .48}, near=False)
for x in [-.104,.104]:
    verts, faces = [], []
    for i in range(25):
        angle = i * math.tau / 24
        for width in [-.009,.009]:
            at = x + width
            verts.append((at, roll_y + math.cos(angle) * .064, roll_depth + math.sin(angle) * .064))
    for i in range(24):
        a = i * 2
        faces.append((a,a+1,a+3,a+2))
    mesh_part('Blanket_strap', verts, faces, 8, {'spine': .52,'neck': .48}, subdivide=False)
    centre = (x,roll_y-.004,roll_depth+.066)
    rounded_block('Blanket_buckle', centre, (.027,.030,.007), 12, {'spine': .52,'neck': .48}, bevel=.005)
    rounded_block('Blanket_buckle_inset', (centre[0],centre[1],centre[2]+.005), (.015,.018,.003), 8,
                  {'spine': .52,'neck': .48}, bevel=.002)
# A broad leather strap over the left shoulder to the right hip, on top of the vest.
strap_path = [(-1.35 + 2.45 * k / 11, VEST_TOP - .02 - .58 * k / 11) for k in range(12)]
verts, faces = [], []
for a, y in strap_path:
    centre, normal = torso_point(a, y, VEST_OUT + .006)
    for sign in [-1, 1]:
        # The strap width runs along the path's perpendicular, about 3.6 cm.
        p, n = torso_point(a + sign * .065, y + sign * .026, VEST_OUT + .006)
        verts.append(p)
for row in range(len(strap_path) - 1):
    a = row * 2
    faces.append((a, a + 1, a + 3, a + 2))
mesh_part('Leather_strap', verts, faces, 8, lambda p: blend('spine', 'neck', (p[1] - 1.04) / .33), subdivide=False)
centre, normal = torso_point(.18, 1.05, VEST_OUT + .013)
rounded_block('Strap_buckle', centre, (.055, .06, .013), 12, {'spine': 1}, bevel=.008, yaw=math.atan2(normal.x, normal.y))
# Bandana tails hang from the knot over the vest back, never inside it.
for side in [-1, 1]:
    x = -.105 + side * .022
    tail = []
    for y, xs in [(1.438, 0), (1.40, .008), (1.29, .025)]:
        for dx in [0, .04 - xs * 1.08 if y != 1.438 else .04]:
            px = x + side * xs + dx
            hit, point, normal, face = vest.ray_cast(V((px, y, 1)), V((0, 0, -1)))
            z = max(.121, (-point.y if hit else .121) + .005)
            tail.append((px, y, z))
    mesh_part('Bandana_tail', tail, [(0, 1, 3, 2), (2, 3, 5, 4)], 5, {'neck': .7, 'spine': .3}, subdivide=False)

# The torso remains a construction surface until every garment has been sampled.
# Remove the covered skin now, instead of allowing independently simplified cloth
# and skin to intersect. Keep the collar and a soft fur band above the belt.
bm = bmesh.new()
bm.from_mesh(body_surface.data)
bmesh.ops.delete(bm, geom=[face for face in bm.faces if face.calc_center_median().z < 1.375
                         and not .765 < face.calc_center_median().z < .875], context='FACES')
bm.to_mesh(body_surface.data)
bm.free()
for covered in list(parts):
    if covered.name.startswith('Belly_patch'):
        parts.remove(covered)
        bpy.data.objects.remove(covered, do_unlink=True)
    elif covered.name.startswith('Arm_'):
        bm = bmesh.new()
        bm.from_mesh(covered.data)
        bmesh.ops.delete(bm, geom=[face for face in bm.faces if face.calc_center_median().z > 1.17], context='FACES')
        bm.to_mesh(covered.data)
        bm.free()
    elif covered.name.startswith('Leg_'):
        # The shorts follow the same thigh joint at the cuff. Their skin stays
        # hidden above that overlap, including when the short legs fold to sit.
        bm = bmesh.new()
        bm.from_mesh(covered.data)
        bmesh.ops.delete(bm, geom=[face for face in bm.faces if face.calc_center_median().z > .375], context='FACES')
        bm.to_mesh(covered.data)
        bm.free()

# Short tapered fins retain the fur silhouette without obscuring face or fingers.
# They are kept at LOD0 only, avoiding subpixel fringe in distant actor outlines.
rng = random.Random(2609)
fur_sources = list(parts)
for source in fur_sources:
    if not source.name.startswith(('Torso_barrel', 'Head_and_muzzle', 'Arm_', 'Paw_', 'Ear_', 'Leg_')) or 'pad' in source.name or 'inner' in source.name:
        continue
    bm = bmesh.new()
    bm.from_mesh(source.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(source.data)
    bm.free()
    source.data.update()
    count = 160 if source.name.startswith('Torso') else 360 if source.name.startswith('Head') else 90 if source.name.startswith('Arm') else 40
    polygons = list(source.data.polygons)
    sampled = rng.choices(polygons, weights=[max(.000001, p.area) for p in polygons], k=count)
    vertices, faces, weights, colors, tiles, fur_normals = [], [], [], [], [], []
    for poly in sampled:
        if source.name.startswith('Ear_') and int(source.data.uv_layers.active.data[poly.loop_indices[0]].uv.x * 16) != 0:
            continue  # The recessed inner ear is smooth, without loose fur fins.
        co = sum((source.data.vertices[i].co for i in poly.vertices), Vector()) / len(poly.vertices)
        normal = poly.normal.normalized()
        if source.name.startswith('Head') and normal.y > .28 and normal.z < .65:
            continue
        if source.name.startswith('Torso') and co.z > .75:
            continue  # Shirt and vest cover these roots.
        flow = V((math.copysign(.45, co.x), -.65, .25)) if source.name.startswith('Head') else V((rng.uniform(-.20, .20), -1, .12))
        flow = (flow - normal * flow.dot(normal)).normalized()
        sideways = normal.cross(flow).normalized()
        root = co - normal * .001
        tip = co + normal * .004 + flow * rng.uniform(.007, .011)
        influence = {}
        for index in poly.vertices:
            for group in source.data.vertices[index].groups:
                name = source.vertex_groups[group.group].name
                influence[name] = influence.get(name, 0) + group.weight / len(poly.vertices)
        tile = min(15, int(source.data.uv_layers.active.data[poly.loop_start].uv.x * 16))
        color = tuple(source.data.color_attributes['Color'].data[poly.loop_start].color)
        for across in [sideways, (sideways * .8 + normal * .2).normalized()]:
            first = len(vertices)
            for point in [root - across * .0012, root + across * .0012, tip]:
                vertices.append((point.x, point.z, -point.y))
                weights.append(influence)
                fur_normals.append(tuple(normal))
            faces.append((first, first + 1, first + 2))
            colors.append(color)
            tiles.append(tile)
    if vertices:
        lookup = {p: w for p, w in zip(vertices, weights)}
        fins = mesh_part('Fur_fringe_' + source.name, vertices, faces, 0, lambda p: lookup[p], subdivide=False)
        # Thin fins inherit the fur volume's normal rather than flashing as cards.
        fins.data.normals_split_custom_set_from_vertices(fur_normals)
        fins['detail_near'] = True
        for poly, color, tile in zip(fins.data.polygons, colors, tiles):
            for loop in poly.loop_indices:
                fins.data.color_attributes['Color'].data[loop].color = color
                fins.data.uv_layers.active.data[loop].uv = ((tile + .5) / 16, .5)

for obj in parts:
    paint_surface(obj)
near_parts = [obj for obj in parts if obj.get('detail_near')]
parts = [obj for obj in parts if not obj.get('detail_near')]
for obj in near_parts:
    obj.data.calc_loop_triangles()
near_triangles = sum(len(obj.data.loop_triangles) for obj in near_parts)
bpy.ops.object.select_all(action='DESELECT')
for obj in parts: obj.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
base = bpy.context.object
base.name = 'Capybara_source'
# Preserve the long skull's authored top line, with only a slight cheek width.
# Facial pivots move with their vertices, preserving blink and expression axes.
def fuller_head(point):
    centre = V((0, 1.6, -.04))
    offset = point - centre
    offset.x *= 1.04
    return centre + offset
face_groups = {g.index for g in base.vertex_groups if g.name in ['head', 'jaw'] or g.name.startswith(('ear_', 'blink_', 'socket_', 'glint_', 'brow_', 'mouth_'))}
for vertex in base.data.vertices:
    if sum(g.weight for g in vertex.groups if g.group in face_groups) > .5:
        vertex.co = fuller_head(vertex.co)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for b in arm.edit_bones:
    if b.name in ['head', 'jaw'] or b.name.startswith(('ear_', 'blink_', 'socket_', 'glint_', 'brow_', 'mouth_')):
        b.head = fuller_head(b.head)
        b.tail = fuller_head(b.tail)
bpy.ops.object.mode_set(mode='OBJECT')
rig.select_set(False)
bpy.context.view_layer.objects.active = base

# Recalculate consistent outward normals after ring construction.
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode='OBJECT')
base.data.calc_loop_triangles()
source_tris = len(base.data.loop_triangles)
report = {'sourceTriangles': source_tris + near_triangles, 'nearDetailTriangles': near_triangles, 'palette': PALETTE, 'lods': [], 'hitbox': {'head': {'center': [0, 1.6, -.04], 'radius': .25}, 'body': {'radius': .3, 'top': 1.42}}, 'clips': ['idle', 'run', 'jump']}
for level, budget in enumerate([19800, 4800, 1400]):
    obj = base.copy()
    obj.data = base.data.copy()
    scene.collection.objects.link(obj)
    obj.name = f'Capybara_LOD{level}'
    obj.data.name = obj.name
    bpy.context.view_layer.objects.active = obj
    decimate = obj.modifiers.new('Triangle budget', 'DECIMATE')
    decimate.ratio = min(1, (budget - (near_triangles if level == 0 else 0)) / source_tris)
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    if level == 0:
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        for detail in near_parts:
            copy = detail.copy()
            copy.data = detail.data.copy()
            scene.collection.objects.link(copy)
            facial = {g.index for g in copy.vertex_groups if g.name in ['head', 'jaw'] or g.name.startswith(('ear_', 'blink_', 'socket_', 'glint_', 'brow_', 'mouth_'))}
            for vertex in copy.data.vertices:
                if sum(g.weight for g in vertex.groups if g.group in facial) > .5:
                    vertex.co = fuller_head(vertex.co)
            copy.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.join()
    # The body/head union is concave at the neck: a simplified edge must not
    # bridge outside it. Apply final garment clearance after decimation.
    arm_groups = {g.index for g in obj.vertex_groups if 'arm' in g.name or 'paw' in g.name}
    head_centre = V((0, 1.6, -.04))
    for vertex in obj.data.vertices:
        if any(g.group in arm_groups and g.weight > 0 for g in vertex.groups):
            continue
        if vertex.co.z > 1.419:
            offset = vertex.co - head_centre
            if offset.length > .244:
                vertex.co = head_centre + offset.normalized() * .244
        else:
            radius = math.hypot(vertex.co.x, vertex.co.y)
            if radius > .297:
                vertex.co.x *= .297 / radius
                vertex.co.y *= .297 / radius

    # Coarse body and cloth triangles simplify independently. Keep the distant
    # flap outside the torso, tapering to zero at its stitched collar seam.
    clearance = obj.vertex_groups.get('cloth_clearance')
    if level == 2:
        for vertex in obj.data.vertices:
            if any(g.group == clearance.index and g.weight > .5 for g in vertex.groups):
                vertex.co.y += .008 * max(0, min(1, (1.44 - vertex.co.z) / .04))
    obj.vertex_groups.remove(clearance)
    # Simplified seam interpolation can overshoot one UV beyond the atlas edge.
    # Keep the authored outer padding so a tiny triangle cannot wrap to another row.
    for loop in obj.data.uv_layers.active.data:
        loop.uv.x = max(.02, min(.98, loop.uv.x))
        loop.uv.y = max(.02, min(.98, loop.uv.y))
    # Decimation can collapse tiny closed caps into duplicate opposite faces.
    # Remove them before export and require a valid mesh after that cleanup.
    if obj.data.validate(verbose=False, clean_customdata=False):
        print('Cleaned collapsed caps in ' + obj.name)
    assert not obj.data.validate(verbose=False, clean_customdata=False), obj.name
    obj.data.update()
    obj.parent = rig
    skin = obj.modifiers.new('Smooth skin', 'ARMATURE')
    skin.object = rig
    obj.data.calc_loop_triangles()
    report['lods'].append({'name': obj.name, 'triangles': len(obj.data.loop_triangles)})
bpy.data.objects.remove(base, do_unlink=True)
for detail in near_parts:
    bpy.data.objects.remove(detail, do_unlink=True)

# Explicit actions on one rig. Blink bones scale their small eye meshes; no morph
# targets or per-instance face materials are required.
rig.animation_data_create()
for name, frames in [('idle', 75), ('run', 24), ('jump', 30)]:
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
        rig.pose.bones['mouth_cavity'].scale.y = .18
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
    down = .39 - .055 - crouch - height
    # Analytic two-bone solve, preserving the original rig and foot orientation.
    upper, lower = .17, math.hypot(.14, .05)
    reach = min(upper + lower - .0002, max(.055, math.hypot(forward, down)))
    knee = math.acos(max(-1, min(1, (reach * reach - upper * upper - lower * lower) / (2 * upper * lower))))
    hip = math.atan2(forward, max(.025, down)) + math.atan2(lower * math.sin(knee), upper + lower * math.cos(knee))
    shin = -knee - math.atan2(.05, .14)
    thigh_bone = rig.pose.bones['thigh_' + side]
    thigh_bone.location.y = .055 + crouch
    thigh_bone.rotation_euler.x = hip
    thigh_bone.rotation_euler.z = lateral * travel
    rig.pose.bones['shin_' + side].rotation_euler.x = shin
    rig.pose.bones['foot_' + side].rotation_euler.x = -hip - shin
    rig.pose.bones['foot_' + side].rotation_euler.z = -lateral * travel


new_clips = [('walk', 20), ('strafe_l', 20), ('strafe_r', 20), ('backpedal', 22),
             ('crouch_idle', 72), ('crouch_walk', 28), ('fall', 36), ('land', 16),
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
        rig.pose.bones['mouth_cavity'].scale.y = .18
        if name in ['walk', 'strafe_l', 'strafe_r', 'backpedal', 'crouch_walk']:
            crouch = .075 if name == 'crouch_walk' else 0
            lateral = (-.28 if name == 'strafe_l' else .28) if name.startswith('strafe') else 0
            for i, side in enumerate(['L', 'R']):
                leg_phase = (t + i * .5) % 1
                contact_leg(side, leg_phase, .065 if lateral else .12 if crouch else .15, .055 if crouch else .10,
                            lateral=lateral, reverse=name == 'backpedal', crouch=crouch)
                rig.pose.bones['arm_' + side].rotation_euler.x = (-1 if i else 1) * .035 * math.sin(phase - .2)
                rig.pose.bones['ear_' + side].rotation_euler.x = .018 * math.sin(phase - .45 + i * .3)
            rig.pose.bones['spine'].rotation_euler.z = .017 * math.sin(phase)
            rig.pose.bones['spine'].rotation_euler.x = -.07 if crouch else -.018
            rig.pose.bones['spine'].location.y = -.12 if crouch else 0
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
            # Support paw reaches the magazine, replaces it, then returns to aim.
            reach = smooth01(min(1, t / .20)) * (1 - smooth01(max(0, (t - .76) / .24)))
            exchange = math.sin(math.pi * max(0, min(1, (t - .22) / .48)))
            rig.pose.bones['arm_L'].rotation_euler.x = .35 * reach
            rig.pose.bones['arm_L'].rotation_euler.z = -.28 * reach
            rig.pose.bones['forearm_L'].rotation_euler.x = -.45 * exchange
            rig.pose.bones['paw_L'].rotation_euler.y = .28 * reach
            rig.pose.bones['arm_R'].rotation_euler.x = -.06 * reach
            rig.pose.bones['spine'].rotation_euler.z = .018 * reach
            rig.pose.bones['head'].rotation_euler.x = .025 * reach
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
        rig.pose.bones['mouth_cavity'].scale.y = 1 if expression in ['hit', 'stunned', 'victory'] else .18
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
bpy.ops.export_scene.gltf(filepath=str(OUT / 'capybara.raw.glb'), export_format='GLB', export_vertex_color='NAME', export_vertex_color_name='Color', export_animations=True, export_animation_mode='ACTIONS', export_nla_strips=False, export_frame_range=False, export_force_sampling=True, export_skins=True, export_influence_nb=4, export_yup=True, export_extras=True, export_cameras=False, export_lights=False)
(OUT / 'blender-report.json').write_text(json.dumps(report, indent=2) + '\n')
print('CAPYBARA_REPORT ' + json.dumps(report))
