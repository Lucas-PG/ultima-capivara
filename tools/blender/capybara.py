"""Direction A capybara. Blender 5.0.1; metres, +Y forward, +Z up.
Generated parts start as quad rings, receive subdivision, then budget decimation.
Every LOD uses the same armature and flat 16 x 16 PNG palette atlas.
"""
import bpy
import bmesh
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
bsdf.inputs['Roughness'].default_value = .87
bsdf.inputs['Specular IOR Level'].default_value = .22
texture = mat.node_tree.nodes.new('ShaderNodeTexImage')
texture.image = image
texture.interpolation = 'Closest'
mat.node_tree.links.new(texture.outputs['Color'], bsdf.inputs['Base Color'])
# Only the eyes and nose may catch a soft specular. Fur and mouth stay matte.
specular = bpy.data.images.new('capybara_nose_eye_specular', width=16, height=16, alpha=True)
specular.colorspace_settings.name = 'Non-Color'
specular.alpha_mode = 'CHANNEL_PACKED'
specular.pixels = [v for y in range(16) for x in range(16) for v in [1, 1, 1, .22 if x in [9, 15] else 0]]
specular.filepath_raw = str(OUT / 'nose-eye-specular.png')
specular.file_format = 'PNG'
specular.save()
specular.pack()
specular_node = mat.node_tree.nodes.new('ShaderNodeTexImage')
specular_node.image = specular
specular_node.interpolation = 'Closest'
mat.node_tree.links.new(specular_node.outputs['Alpha'], bsdf.inputs['Specular IOR Level'])
# A shared emissive atlas lights only white eye glints, retaining one draw material.
emission = bpy.data.images.new('capybara_eye_glints', width=16, height=16, alpha=False)
emission.pixels = [v for y in range(16) for x in range(16) for v in ([1, 1, 1, 1] if x == 10 else [0, 0, 0, 1])]
emission.filepath_raw = str(OUT / 'eye-glints.png')
emission.file_format = 'PNG'
emission.save()
emission.pack()
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
    bone('ear_' + side, (s * .15, 1.755, .005), (s * .16, 1.815, .005), 'head')
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
    radius = .240 if obj.name == 'Head_and_muzzle' else .244
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

# Pear torso fits the normal .30 m body cylinder with animation clearance.
# A continuous pear-to-neck surface avoids a stack-of-spheres silhouette.
# The widest ring sits at the hips and the round seat drops to .20 m, covering
# the thighs so only short legs and big feet show below it (bible 9.1).
profile = [(.20, .04, .04, .005), (.215, .14, .13, 0), (.25, .226, .21, -.006), (.31, .274, .255, -.01), (.39, .294, .278, -.012), (.49, .297, .284, -.012), (.60, .291, .279, -.01), (.73, .275, .258, -.005), (.87, .252, .232, 0), (1.01, .229, .208, .004), (1.15, .209, .187, .005), (1.27, .193, .169, .005), (1.35, .178, .152, .005), (1.402, .164, .132, .005), (1.418, .163, .131, .005), (1.445, .163, .130, .005), (1.464, .153, .124, .005), (1.472, .04, .04, .005)]
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
body_surface = mesh_part('Torso_pear', verts, faces, 0, lambda p: blend('spine', 'neck', (p[1] - 1.04) / .33))
# Colour follows the actual surface, so the crisp belly cannot float or clip.
for poly in body_surface.data.polygons:
    center = sum((body_surface.data.vertices[v].co for v in poly.vertices), Vector()) / len(poly.vertices)
    x, y, z = center.x, center.z, -center.y
    # The lit chest band shows only in the vest V-neck, not inside the armholes.
    index = 1 if y > 1.22 and z < -.06 else 0
    for loop in poly.loop_indices:
        body_surface.data.uv_layers.active.data[loop].uv = ((index + .5) / 16, .5)
# Conforming egg, wider low on the pear, with a one-centimetre colour edge.
# Its top tucks under the bandana point inside the open vest front.
patch_verts, patch_faces, patch_mix = [], [], []
for row, radius in enumerate([.001, .2, .4, .6, .8, .96, 1]):
    for i in range(32):
        angle = math.tau * i / 32
        x = .18 * radius * math.cos(angle) * (1 - .22 * math.sin(angle))
        y = .64 + .31 * radius * math.sin(angle)
        hit, point, normal, face = body_surface.ray_cast(V((x, y, -1)), V((0, 0, 1)))
        assert hit, (x, y)
        point += V((0, 0, -.004))
        patch_verts.append((point.x, point.z, -point.y))
        patch_mix.append(0 if radius == 1 else 1)
    if row:
        for i in range(32):
            a, b = (row - 1) * 32 + i, (row - 1) * 32 + (i + 1) % 32
            patch_faces.append((a, b, b + 32, a + 32))
patch = mesh_part('Belly_patch', patch_verts, patch_faces, 14, {'spine': 1}, subdivide=False)
def linear_rgb(hex_color):
    return tuple((v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4) for v in (int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)))
for loop in patch.data.loops:
    rgb = linear_rgb(PALETTE[4 if patch_mix[loop.vertex_index] else 0])
    patch.data.color_attributes['Color'].data[loop.index].color = (*rgb, 1)
# A single longitudinal quad surface joins cheeks and rectangular muzzle.
# Forehead-to-nose is one gently descending line, without a box seam.
head_profile = [(.168, .03, 1.573, .028), (.138, .100, 1.5725, .1025),
                (.078, .174, 1.5905, .1525), (.018, .214, 1.60, .158),
                (-.05, .208, 1.597, .144), (-.108, .182, 1.58, .134),
                (-.17, .142, 1.574, .106), (-.225, .116, 1.568, .079),
                (-.262, .11, 1.565, .062), (-.276, .098, 1.567, .047),
                (-.283, .065, 1.571, .022), (-.284, .035, 1.575, .010)]
verts, faces = [], []
segments = 32
for z, rx, cy, ry in head_profile:
    for i in range(segments):
        a = math.tau * i / segments
        shape = lambda v: math.copysign(abs(v) ** .72, v)
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

def recess(x, y, width, height, depth, name):
    point = fur_point(x, y)
    # A shallow subtraction creates a real concave surface behind the fur rim.
    centre = point + V((0, 0, -depth * .42))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1, location=centre)
    cutter = bpy.context.object
    cutter.scale = (width, depth, height)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.context.view_layer.objects.active = head_surface
    cut = head_surface.modifiers.new(name, 'BOOLEAN')
    cut.operation, cut.solver, cut.object = 'DIFFERENCE', 'EXACT', cutter
    bpy.ops.object.modifier_apply(modifier=cut.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
    return point

mouth_point = recess(0, 1.535, .037, .017, .029, 'Recessed mouth')
# Shallow lateral sockets preserve profile readability. Geometry and bones use
# the same tangent plane, so squints and arcs remain on the curved cheek.
eye_frames = {}
for side in [-1, 1]:
    hit, point, normal, face = reference.ray_cast(V((side * .176, 1.654, -1)), V((0, 0, 1)))
    assert hit, ('lateral eye surface', side)
    normal = normal.normalized()
    if normal.dot(V((0, 0, -1))) < 0:
        normal.negate()
    up = V((0, 1, 0))
    tangent = up.cross(normal).normalized()
    up = normal.cross(tangent).normalized()
    eye_frames[side] = (point, normal, tangent, up)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1)
    cutter = bpy.context.object
    for vertex in cutter.data.vertices:
        x, y, z = vertex.co
        vertex.co = point + normal * (.017 + y * .020) + tangent * x * .022 + up * z * .027
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
bpy.ops.object.mode_set(mode='OBJECT')
rig.select_set(False)
# The mouth rim and cavity close together; neutral has no dark oval decal.
for group in list(head_surface.vertex_groups):
    head_surface.vertex_groups.remove(group)
for name in ['head', 'jaw', 'mouth_cavity', 'mouth_L', 'mouth_R', 'socket_L', 'socket_R']:
    head_surface.vertex_groups.new(name=name)
for vertex in head_surface.data.vertices:
    x, y, z = vertex.co.x, vertex.co.z, -vertex.co.y
    distance = ((x / .047) ** 2 + ((y - 1.535) / .028) ** 2) ** .5
    mouth_weight = max(0, min(1, (1.65 - distance) / .45)) if z < -.225 else 0
    jaw_weight = max(0, min(1, (1.56 - y) / .055)) * max(0, min(1, (-z - .06) / .1)) * (1 - mouth_weight)
    mouth_side = 'L' if x < 0 else 'R'
    corner_weight = mouth_weight * .6 * min(1, abs(x) / .034) ** 2
    eye_side = 'L' if x < 0 else 'R'
    eye_distance = (((abs(x) - .176) / .028) ** 2 + ((y - 1.654) / .035) ** 2) ** .5
    eye_weight = max(0, min(1, (1.4 - eye_distance) / .3)) if z < -.055 else 0
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
        # Muzzle stays in the fur family: its top plane takes the lit tone and
        # only the underside darkens, so the front never reads as a dark mask.
        muzzle = max(0, min(1, (-z - .15) / .05))
        up = vertex.normal.z
        light = light * (1 - muzzle) + muzzle * max(0, min(1, (up - .15) / .35))
        shadow = shadow * (1 - muzzle) + muzzle * max(0, min(1, (-up - .35) / .4))
        rgb = [base_rgb[i] * (1 - light) + light_rgb[i] * light for i in range(3)]
        rgb = [rgb[i] * (1 - shadow) + shadow_rgb[i] * shadow for i in range(3)]
        mouth_distance = (x / .038) ** 2 + ((y - 1.535) / .019) ** 2
        if mouth_distance < 1.06 and z < -.235:
            depth = max(0, min(1, (z + mouth_point.y) / .015))
            wine, back = linear_rgb('6B2E2A'), linear_rgb('351917')
            rgb = [wine[i] * (1 - depth) + back[i] * depth for i in range(3)]
        head_surface.data.uv_layers.active.data[loop_index].uv = (14.5 / 16, .5)
        head_surface.data.color_attributes['Color'].data[loop_index].color = (*rgb, 1)
# The dark nose pad occupies only the upper third of the furry muzzle.
nose = rounded_block('Nose_pad', (0, 1.595, -.275), (.096, .043, .018), 15, {'head': 1}, bevel=.012)
for vertex in nose.data.vertices:
    vertex.co.x *= .78 + .22 * max(0, min(1, (vertex.co.z - 1.5735) / .043))
for side in [-1, 1]:
    ellipsoid('Nostril', (side * .022, 1.592, -.281), (.01, .007, .004), 9, {'head': 1}, segments=10, rings=6)
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
    def lid_weights(point):
        tip = .45 * max(0, 1 - abs((point[1] - 1.654) / .024))
        peak = .45 * max(0, 1 - abs((point[0] - s * .176) / .021))
        return {'blink_' + side: 1 - tip - peak, 'blink_tip_' + side: tip, 'blink_peak_' + side: peak}
    eye = ellipsoid('Eye_' + side, (s * .176, 1.654, -.12), (.016, .020, .014), 9, lid_weights, segments=12, rings=8)
    glint = ellipsoid('Glint_' + side, (s * .176 - .006, 1.662, -.132), (.005, .006, .003), 10, {'glint_' + side: 1}, segments=16, rings=10)
    for patch, centre_z, depth in [(eye, -.12, -.0005), (glint, -.132, .0015)]:
        for vertex in patch.data.vertices:
            x, y, z = vertex.co.x, vertex.co.z, -vertex.co.y
            point, normal, tangent, up = eye_frames[s]
            vertex.co = point + tangent * (x - s * .176) + up * (y - 1.654) + normal * (depth - (z - centre_z) * .12)
    brow = tube('Brow_tuft_' + side, [(s * .11, 1.704, -.10), (s * .13, 1.710, -.10), (s * .15, 1.704, -.10)], [.002, .006, .002], 2, ['brow_' + side, 'head'])
    for vertex in brow.data.vertices:
        x, y, z = vertex.co.x, vertex.co.z, -vertex.co.y
        hit, point, normal, face = reference.ray_cast(V((x, y, -1)), V((0, 0, 1)))
        assert hit, ('brow surface', x, y)
        vertex.co = point + V((0, 0, -.0025 + (z + .10) * .12))
    ellipsoid('Ear_' + side, (s * .124, 1.766, .042), (.046, .045, .028), 0, {'ear_' + side: .88, 'head': .12}, segments=12, rings=8)
    ellipsoid('Ear_inner_' + side, (s * .124, 1.766, .019), (.029, .029, .01), 11, {'ear_' + side: 1}, segments=12, rings=6)
    tube('Leg_' + side, [(s * .137, .41, .01), (s * .137, .35, .01), (s * .137, .23, .01), (s * .137, .15, -.012), (s * .137, .08, -.04)], [.10, .13, .125, .11, .085], 0, ['thigh_' + side, 'shin_' + side, 'foot_' + side])
    rounded_block('Foot_' + side, (s * .137, .061, -.045), (.225, .115, .25), 2, {'foot_' + side: 1}, bevel=.048)
    hand_z = -.39 if s == 1 else -.49
    tube('Arm_' + side, [(s * .225, 1.195, -.015), (s * .267, 1.12, -.08), (s * .27, 1.0, -.19), (s * .2, 1.016, (hand_z - .19) / 2), (s * .1, 1.045, hand_z)], [.075, .108, .1, .092, .08], 0, ['arm_' + side, 'forearm_' + side, 'paw_' + side])
    ellipsoid('Paw_' + side, (s * .1, 1.045, hand_z - .014), (.092, .078, .11), 0, {'paw_' + side: 1}, square=.65)
    # Three chunky fingers and a thumb, with dark animal pads.
    for finger in [-1, 0, 1]:
        ellipsoid('Finger_' + side, (s * .1 + finger * .049, 1.044, hand_z - .088), (.025, .032, .042), 0, {'paw_' + side: 1}, segments=10, rings=6)
        ellipsoid('Claw_' + side, (s * .1 + finger * .049, 1.045, hand_z - .122), (.016, .016, .015), 3, {'paw_' + side: 1}, segments=8, rings=6)
    ellipsoid('Thumb_' + side, (s * .1 - s * .082, 1.035, hand_z - .033), (.035, .044, .035), 0, {'paw_' + side: 1}, segments=10, rings=6)
    ellipsoid('Paw_pad_' + side, (s * .1, .977, hand_z - .025), (.052, .016, .065), 3, {'paw_' + side: 1}, segments=12, rings=6)
bpy.data.objects.remove(reference, do_unlink=True)
# No visible tail. Cloth band hugs the neck with a thin flat cross section.
verts, faces = [], []
for y in [1.434, 1.442, 1.451, 1.459]:
    for i in range(32):
        a = math.tau * i / 32
        verts.append((.166 * math.cos(a), y, .002 + .130 * math.sin(a)))
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
        point += V((0, 0, -.006))
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
# it follows the pear instead of floating as a separate tube or backpack.
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
VEST_HEM, VEST_TOP, VEST_GAP = .80, 1.405, .5
def vest_gap(y):
    # A V-neck: the front opening widens toward the neck and clears the bandana point.
    t = max(0, min(1, (y - 1.05) / (VEST_TOP - 1.05)))
    return VEST_GAP + .45 * t * t * (3 - 2 * t)
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
            verts.append(torso_point(*grid[key[0]][key[1]], .004)[0])
        quad.append(index[key])
    faces.append(tuple(quad))
vest = mesh_part('Vest_wrap', verts, faces, 7, lambda p: blend('spine', 'neck', (p[1] - 1.04) / .33), subdivide=False)
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
    # Chest pockets on each front panel, turned to the local surface normal.
    a = side * (VEST_GAP + .36)
    for name, y, dims, color, depth, bevel in [('Vest_pocket', .98, (.085, .11, .032), 7, .016, .012), ('Pocket_flap', 1.035, (.092, .03, .012), 13, .034, .004)]:
        centre, normal = torso_point(a, y, VEST_OUT + depth)
        yaw = math.atan2(normal.x, normal.y)
        rounded_block(name, centre, dims, color, {'spine': 1}, bevel=bevel, yaw=yaw)
    # Player-colour trim follows the front edge of each panel.
    trim = [torso_point(side * vest_gap(y), y, VEST_OUT)[0] for y in [VEST_HEM + .01, .95, 1.1, 1.22, 1.32, VEST_TOP - .01]]
    tube('Vest_trim', trim, [.011] * len(trim), 5, ['spine', 'neck'])
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
    # Coarse body and cloth triangles simplify independently. Keep the distant
    # flap outside the torso, tapering to zero at its stitched collar seam.
    clearance = obj.vertex_groups.get('cloth_clearance')
    if level == 2:
        for vertex in obj.data.vertices:
            if any(g.group == clearance.index and g.weight > .5 for g in vertex.groups):
                vertex.co.y += .008 * max(0, min(1, (1.44 - vertex.co.z) / .04))
    obj.vertex_groups.remove(clearance)
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
        rig.pose.bones['mouth_cavity'].scale.y = .001
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
        rig.pose.bones['mouth_cavity'].scale.y = 1 if expression in ['hit', 'stunned', 'victory'] else .001
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
