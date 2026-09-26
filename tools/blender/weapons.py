"""Original Direction A weapon set. Blender 5.0.1, metres, game forward -Z.
Eight distinct silhouettes use one painted atlas and capybara paws.
Original geometry and painted surface maps, without downloaded models or trademarks.
"""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/weapons'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
PALETTE = json.loads((ROOT / 'src/render/weapon-palette.json').read_text())
def painted_shade(column, u, v):
    shade = .96 + .028 * math.sin(u * 13 + math.sin(v * 17) * 1.7) + .022 * math.cos(v * 31 + u * 7)
    if column in [2, 3, 21]:
        shade *= .89 + .11 * math.sin(u * 38 + math.sin(v * 12) * 2 + v * 4)
    elif column in [13, 14, 15, 16, 19]:
        shade *= .93 + .058 * math.sin(u * 95 + math.sin(v * 42) * 2.3 + v * 16) + .033 * math.sin(u * 53 - v * 32)
    elif column == 7:
        shade *= 1.04 - .20 * u + .012 * math.sin(u * 17 + v * 4)
    elif column == 24:
        shade *= .985 + .012 * math.sin(u * 17 + v * 4)
    elif column == 25:
        shade *= .99 + .008 * math.sin(u * 4 + v * 3)
    elif column in [28, 29, 30, 31]:
        shade *= .97 + .015 * math.sin(u * 39) * math.cos(v * 61)
    elif column in [17, 18]:
        shade *= .95 + .04 * math.sin(u * 90) * math.sin(v * 210)
    elif column in [4, 23]:
        shade *= .94 + .045 * math.sin(u * 80) * math.cos(v * 120)
    else:
        shade *= .97 + .025 * math.sin(v * 85 + u * 8)
    return shade

image = bpy.data.images.new('Ilha_Dourada_weapons', width=1024, height=1024, alpha=False)
pixels = []
for y in range(1024):
    for x in range(1024):
        column, u, v = x // 32, (x % 32 + .5) / 32, (y + .5) / 1024
        shade = painted_shade(column, u, v)
        pixels.extend([min(1, int(PALETTE[column][i:i + 2], 16) / 255 * shade) for i in (0, 2, 4)] + [1])
image.pixels = pixels
image.filepath_raw = str(OUT / 'weapon-palette.png')
image.file_format = 'PNG'
image.save()
image.pack()
material = bpy.data.materials.new('Painted_weapons_and_paws')
material.use_nodes = True
bsdf = material.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Roughness'].default_value = .88
bsdf.inputs['Metallic'].default_value = 0
bsdf.inputs['Specular IOR Level'].default_value = .2
texture = material.node_tree.nodes.new('ShaderNodeTexImage')
texture.image = image
texture.interpolation = 'Linear'
material.node_tree.links.new(texture.outputs['Color'], bsdf.inputs['Base Color'])
# Roughness separates painted metal, polymer, wood, cloth and fur in one draw.
roughness = bpy.data.images.new('Painted_surface_roughness', width=32, height=32, alpha=False)
roughness.colorspace_settings.name = 'Non-Color'
roughness.pixels = [c for y in range(32) for x in range(32) for c in ([.52 if x == 25 else .22 if x == 26 else .49 if x in [0, 1, 7, 24] else .97 if x in [13,14,15,16,17,18,19] else .76 if x in [28,29,30,31] else .87] * 3 + [1])]
roughness.filepath_raw = str(OUT / 'roughness.png')
roughness.file_format = 'PNG'
roughness.save()
roughness.pack()
roughness_node = material.node_tree.nodes.new('ShaderNodeTexImage')
roughness_node.image = roughness
roughness_node.interpolation = 'Closest'
material.node_tree.links.new(roughness_node.outputs['Color'], bsdf.inputs['Roughness'])

# Fine original engraving, fur combing and canvas weave in a tangent-space map.
normal_image = bpy.data.images.new('Engraving_fur_and_canvas', width=1024, height=1024, alpha=False)
normal_image.colorspace_settings.name = 'Non-Color'
normal_pixels = []
for y in range(1024):
    for x in range(1024):
        column, u, v = x // 32, (x % 32 + .5) / 32, (y + .5) / 1024
        if column in [13, 14, 15, 19]:
            nx, ny = .15 * math.cos(u * 95 + v * 16), .045 * math.cos(u * 53 - v * 32)
        elif column in [7, 24]:
            nx, ny = .008 * math.cos(u * 32), .005 * math.sin(u * 5 + v * 3)
        elif column == 25:
            nx, ny = .005 * math.cos(u * 8), .003 * math.sin(v * 7)
        elif column in [28, 29, 30, 31]:
            nx, ny = .025 * math.sin(u * 39) * math.cos(v * 61), .025 * math.cos(u * 39) * math.sin(v * 61)
        elif column in [17, 18]:
            nx, ny = .12 * math.cos(u * 90), .12 * math.cos(v * 210)
        elif column in [4, 23]:
            nx, ny = .13 * math.sin(u * 80) * math.cos(v * 120), .13 * math.cos(u * 80) * math.sin(v * 120)
        else:
            nx, ny = .035 * math.cos(u * 60 + v * 11), .045 * math.sin(v * 85)
        length = math.sqrt(1 + nx * nx + ny * ny)
        normal_pixels.extend([.5 + nx / length * .5, .5 + ny / length * .5, .5 + .5 / length, 1])
normal_image.pixels = normal_pixels
normal_image.filepath_raw = str(OUT / 'surface-normal.png')
normal_image.file_format = 'PNG'
normal_image.save()
normal_image.pack()
normal_texture = material.node_tree.nodes.new('ShaderNodeTexImage')
normal_texture.image = normal_image
normal_node = material.node_tree.nodes.new('ShaderNodeNormalMap')
normal_node.inputs['Strength'].default_value = .28
material.node_tree.links.new(normal_texture.outputs['Color'], normal_node.inputs['Color'])
material.node_tree.links.new(normal_node.outputs['Normal'], bsdf.inputs['Normal'])

# Painted blade edge retains a cool, light value under the warm island sun.
# The rest of the shared weapon/paw material remains non-emissive.
emission = bpy.data.images.new('Painted_blade_edge', width=32, height=32, alpha=False)
emission.pixels = [v for y in range(32) for x in range(32) for v in
                   ([232 / 255, 238 / 255, 242 / 255, 1] if x == 24 else [0, 0, 0, 1])]
emission.filepath_raw = str(OUT / 'blade-edge.png')
emission.file_format = 'PNG'
emission.save()
emission.pack()
emission_node = material.node_tree.nodes.new('ShaderNodeTexImage')
emission_node.image = emission
emission_node.interpolation = 'Closest'
material.node_tree.links.new(emission_node.outputs['Color'], bsdf.inputs['Emission Color'])
bsdf.inputs['Emission Strength'].default_value = .35



def V(p):
    return Vector((p[0], -p[2], p[1]))


def group(name, parent=None, position=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    obj.location = V(position)
    return obj


def finish(obj, parent, color, bevel=0, edge=None):
    obj.parent = parent
    bpy.context.view_layer.objects.active = obj
    if bevel:
        mod = obj.modifiers.new('Painted soft edge', 'BEVEL')
        mod.width, mod.segments = bevel, 3
        bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.data.materials.append(material)
    for layer in list(obj.data.uv_layers):
        obj.data.uv_layers.remove(layer)
    uv = obj.data.uv_layers.new(name='Palette')
    organic = color in [13, 14, 15, 16, 17, 18, 19, 25, 28, 29, 30, 31]
    organic_bounds = [(min(v.co[a] for v in obj.data.vertices), max(v.co[a] for v in obj.data.vertices)) for a in [0, 2]]
    for poly in obj.data.polygons:
        index = edge if edge is not None and .12 < poly.normal.z < .96 else color
        points = [obj.data.vertices[v].co for v in poly.vertices]
        normal = poly.normal
        axes = [0, 2] if organic else [0, 1] if abs(normal.z) > .6 else [1, 2] if abs(normal.x) > .6 else [0, 2]
        bounds = organic_bounds if organic else [(min(v[a] for v in points), max(v[a] for v in points)) for a in axes]
        for loop in poly.loop_indices:
            co = obj.data.vertices[obj.data.loops[loop].vertex_index].co
            u, v = [(co[a] - lo) / max(.001, hi - lo) for a, (lo, hi) in zip(axes, bounds)]
            uv.data[loop].uv = ((index + .12 + .76 * u) / 32, .06 + .88 * v)
        poly.use_smooth = bool(bevel)
    if bevel:
        # Broad planes keep their shape while the three bevel rings shade as a
        # continuous rounded edge at first-person size.
        normals = obj.modifiers.new('Rounded painted edge normals', 'WEIGHTED_NORMAL')
        normals.keep_sharp, normals.weight = True, 40
        bpy.ops.object.modifier_apply(modifier=normals.name)
    return obj


def block(name, parent, center, size, color, bevel=.008, edge=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=V(center))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, parent, color, min(bevel, min(size) / 3), edge)


def profile(name, parent, zy, width, color, bevel=.008, edge=None):
    verts = [(x, y, z) for x in [-width / 2, width / 2] for z, y in zy]
    n = len(zy)
    faces = [tuple(reversed(range(n))), tuple(n + i for i in range(n))]
    faces += [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([V(p) for p in verts], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return finish(obj, parent, color, bevel, edge)


def cylinder(name, parent, center, radius, length, color, sides=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=sides, radius=radius, depth=length, location=V(center), rotation=(math.pi / 2, 0, 0))
    obj = bpy.context.object
    obj.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish(obj, parent, color, .003)


def sleeve(name, parent, center, radius, length, color):
    # An open optical tube keeps ADS sight lines clear without a photo lens.
    verts, faces = [], []
    for z, r in [(-length / 2, radius), (length / 2, radius), (-length / 2, radius * .77), (length / 2, radius * .77)]:
        for i in range(16):
            a = math.tau * i / 16
            verts.append((center[0] + r * math.cos(a), center[1] + r * math.sin(a), center[2] + z))
    for i in range(16):
        j = (i + 1) % 16
        faces.extend([(i, j, j + 16, i + 16), (i + 32, i + 48, j + 48, j + 32), (i, i + 32, j + 32, j), (i + 16, j + 16, j + 48, i + 48)])
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([V(p) for p in verts], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return finish(obj, parent, color)


def ellipsoid(name, parent, center, radii, color, detail=False):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32 if detail else 8 if max(radii) < .03 else 12, ring_count=20 if detail else 6 if max(radii) < .03 else 8, radius=1, location=V(center))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (radii[0], radii[2], radii[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    finish(obj, parent, color)
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj


def link(name, parent, start, end, radius, color, end_radius=None):
    direction = V(end) - V(start)
    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=radius, radius2=end_radius or radius, depth=direction.length, location=(V(start) + V(end)) / 2)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(direction.normalized())
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    finish(obj, parent, color, 0 if radius < .02 else .004)
    for face in obj.data.polygons:
        face.use_smooth = len(face.vertices) <= 4
    return obj


def fur_fin(parent, start, tip, color, width=.0012):
    a, b = V(start), V(tip)
    axis = (b - a).normalized()
    tangent = axis.cross(Vector((0, 0, 1))).normalized() * width
    across = axis.cross(tangent).normalized() * width
    mesh = bpy.data.meshes.new('Fine_fur_fringe')
    mesh.from_pydata([a + tangent, a - tangent, b, a + across, a - across, b], [], [[0, 1, 2], [3, 4, 5]])
    mesh.update()
    obj = bpy.data.objects.new('Fine_fur_fringe', mesh)
    bpy.context.collection.objects.link(obj)
    finish(obj, parent, color)
    for loop in obj.data.uv_layers.active.data:
        loop.uv = ((color + .5) / 32, .5)


def merge_group(parent, name):
    meshes = [obj for obj in parent.children if obj.type == 'MESH']
    if not meshes:
        return
    if len(meshes) == 1:
        meshes[0].name = name
        return meshes[0]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    # Joined geometry keeps material indices; all indices point to the same atlas.
    for poly in obj.data.polygons:
        poly.material_index = 0
    obj.data.materials.clear()
    obj.data.materials.append(material)
    return obj


def stock(parent, rear=.44, wood=False):
    profile('Stock', parent, [(.13, -.02), (rear - .035, -.025), (rear, -.055),
            (rear, -.132), (rear - .095, -.117), (.17, -.074)], .085, 2 if wood else 4, .012, 3 if wood else None)
    block('Butt_pad', parent, (0, -.080, rear), (.100, .105, .028), 4)


def grip(parent, pistol=False):
    zy = [(.045, -.026), (.148, -.037), (.185, -.243), (.08, -.258), (.053, -.19)] if pistol else [(.034, -.045), (.121, -.05), (.146, -.254), (.057, -.24)]
    profile('Grip', parent, zy, .08, 4, .012)
    block('Grip_medallion', parent, (.042, -.15, .102), (.012, .06, .034), 5, .003)
    # Open guard made from three broad pieces rather than a solid rectangle.
    for x in [-.038, .038]:
        link('Trigger_guard', parent, (x, -.05, -.008), (x, -.16, -.04), .013, 0)
        link('Trigger_guard', parent, (x, -.16, -.04), (x, -.16, .067), .013, 0)
    link('Trigger', parent, (0, -.07, .015), (0, -.118, .023), .011, 1)


def sights(parent, front, rear=.035, height=.115):
    weapon = parent.name.split('_')[0]
    if weapon == 'shotgun':
        # Small bead and low open rear notch leave the barrel silhouette clear.
        link('Shotgun_bead_stem', parent, (0, .032, front), (0, .073, front), .0035, 0)
        ellipsoid('Shotgun_front_bead', parent, (0, .077, front), (.0055, .0055, .006), 22)
        for x in [-.018, .018]:
            block('Low_rear_notch', parent, (x, .068, rear), (.011, .027, .021), 0, .004, 1)
        return .077
    if weapon == 'm4':
        height = .110
        block('Front_sight_saddle', parent, (0, .027, front), (.062, .012, .032), 0, .003, 1)
        for sign in [-1, 1]:
            link('Slim_front_guard', parent, (sign * .026, .026, front), (sign * .014, height + .010, front), .005, 0)
        link('Front_post', parent, (0, .028, front), (0, height + .002, front), .0038, 1)
        block('Rear_aperture_foot', parent, (0, .074, rear), (.040, .030, .039), 0, .005, 1)
        bpy.ops.mesh.primitive_torus_add(major_radius=.019, minor_radius=.003,
            major_segments=24, minor_segments=8, location=V((0, height, rear)), rotation=(math.pi / 2, 0, 0))
        aperture = bpy.context.object
        aperture.name = 'Rounded_rear_aperture'
        finish(aperture, parent, 0)
        for face in aperture.data.polygons:
            face.use_smooth = True
        return height
    base_bottom = .074 if weapon == 'pistol' else .045
    base_height = max(.012, height - base_bottom)
    block('Front_sight_base', parent, (0, base_bottom + base_height / 2, front), (.036, base_height, .028), 0, .005, 1)
    block('Front_sight', parent, (0, height + .010, front), (.013, .026, .016), 1, .004)
    bridge_bottom = .067 if weapon == 'pistol' else .052
    bridge_top = height - .004
    block('Rear_sight_bridge', parent, (0, (bridge_bottom + bridge_top) / 2, rear),
          (.064, bridge_top - bridge_bottom, .025), 0, .004)
    for x in [-.025, .025]:
        block('Rear_sight', parent, (x, height + .007, rear), (.013, .029, .021), 0, .004)
    return height + .021


def scope(parent, front=-.41, length=.35, radius=.05):
    for z in [front + .08, front + length - .07]:
        block('Scope_mount', parent, (0, .094, z), (.063, .084, .047), 0)
    sleeve('Scope', parent, (0, .169, front + length / 2), radius, length, 0)
    for z in [front, front + length]:
        sleeve('Scope_rim', parent, (0, .169, z), radius * 1.16, .036, 1)
    block('Scope_dial', parent, (0, .221, front + length * .6), (.067, .04, .048), 4)
    return .169


def soft_sweep(name, parent, points, radii, color, aspect=1, sides=12):
    """A continuous rounded form with no stacked rings or separate knuckle balls."""
    path = [Vector(p) for p in points]
    centers, widths = [], []
    for row in range(len(path) - 1):
        a, b = path[max(0, row - 1)], path[row]
        c, d = path[row + 1], path[min(len(path) - 1, row + 2)]
        for step in range(3):
            t = step / 3
            centers.append(.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t))
            widths.append(radii[row] * (1 - t) + radii[row + 1] * t)
    centers.append(path[-1]); widths.append(radii[-1])
    vertices, faces = [], []
    previous = None
    for row, (center, radius) in enumerate(zip(centers, widths)):
        direction = (centers[min(row + 1, len(centers) - 1)] - centers[max(0, row - 1)]).normalized()
        reference = Vector((0, 0, 1)) if abs(direction.z) < .94 else Vector((0, 1, 0))
        side = direction.cross(reference).normalized() if previous is None else previous - direction * previous.dot(direction)
        if side.length < .001:
            side = direction.cross(reference)
        side.normalize()
        previous = side
        across = direction.cross(side).normalized()
        for i in range(sides):
            angle = math.tau * i / sides
            vertices.append(V(center + side * (math.cos(angle) * radius) + across * (math.sin(angle) * radius * aspect)))
    for row in range(len(centers) - 1):
        for i in range(sides):
            a, b = row * sides + i, row * sides + (i + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces += [tuple(reversed(range(sides))), tuple((len(centers) - 1) * sides + i for i in range(sides))]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces); mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    finish(obj, parent, color)
    for face in mesh.polygons:
        face.use_smooth = len(face.vertices) == 4
    return obj


def digit(parent, name, points, radius=.014, nail_normal=(0, 0, 1)):
    # Each short digit has its own uninterrupted contour and one blunt nail.
    soft_sweep(name, parent, points, [radius * .72, radius, radius * .92, radius * .78, radius * .50], 28, .90)
    end = Vector(points[-1])
    normal = Vector(nail_normal).normalized()
    nail = ellipsoid(name + '_nail', parent, tuple(end + normal * radius * .34), (radius * .48, .0025, radius * .53), 25, True)
    nail.rotation_mode = 'QUATERNION'
    nail.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(V(normal))


def paw(parent, side, palm, elbow, vertical=False):
    p, e = Vector(palm), Vector(elbow)
    weapon = parent.name.split('_')[0]
    pistol_grip = side == 1 and weapon not in ['machete', 'slingshot']
    if pistol_grip:
        # The hand's back sits behind the grip. The semantic reload anchor stays
        # fixed while the wrist joins the lower heel of the actual palm.
        p += Vector((-.006, -.020, .060) if weapon == 'pistol' else (-.010, -.020, .075))
    support = side == -1 and weapon not in ['pistol', 'slingshot']
    parent['gripAnchor'] = list(palm)
    shoulder = e + Vector((side * (.215 if vertical else .20), -.205, .165 if vertical else .205))
    parent['elbowAnchor'] = list(e)
    parent['shoulderAnchor'] = list(shoulder)
    parent['digitCount'] = 4
    arm_axis = (e - p).normalized()
    upper_axis = (shoulder - e).normalized()
    # A narrow wrist, an asymmetric muscle belly, and a real elbow turn.
    # The sleeve follows the upper arm rather than extending the forearm rod.
    soft_sweep('Bare_wrist', parent, [tuple(p + arm_axis * distance) for distance in [0, .024, .053, .082]],
               [.043, .052, .062, .070] if support else [.029, .026, .024, .025], 28, .90 if support else .82, 16)
    swell = Vector((side * .017, .015, -.014))
    arm_length = (e - p).length
    cuff_fraction = .88 if support else max(.62, .130 / arm_length)
    cuff = p.lerp(e, cuff_fraction) + swell * .85
    # Keep the short melee forearm's spline progressing away from the wrist;
    # fixed fractions alone can turn its fur surface back into the palm.
    forearm = [p + arm_axis * .080, p.lerp(e, max(.43, .096 / arm_length)) + swell * .25,
               p.lerp(e, max(.55, .116 / arm_length)) + swell * .65, cuff + arm_axis * .014]
    soft_sweep('Shaped_furred_forearm', parent, [tuple(point) for point in forearm],
               [.070, .082, .093, .100] if support else [.0245, .030, .038, .046], 13, .90 if support else .79, 20)
    sleeve = [cuff + arm_axis * .006, p.lerp(e, .95 if support else .81) + swell * .6,
              e, e.lerp(shoulder, .30), e.lerp(shoulder, .73), e.lerp(shoulder, 1.08)]
    soft_sweep('Bent_khaki_sleeve', parent, [tuple(point) for point in sleeve],
               [.103, .108, .110, .114, .122, .125] if support else [.049, .060, .064, .071, .081, .083], 17, .86, 20)
    soft_sweep('Single_rolled_cuff', parent, [tuple(cuff + arm_axis * distance) for distance in [-.022, -.011, .012, .021]],
               [.100, .109, .109, .103] if support else [.046, .053, .053, .050], 17, .86, 20)
    upper_tangent = upper_axis.cross(Vector((0, 0, 1))).normalized()
    upper_across = upper_axis.cross(upper_tangent).normalized()
    # Short diagonal crease valleys, not repeated cylindrical wrist bands.
    for t, angle in [(.28, .3), (.40, 2.7), (.57, 1.6)]:
        points = []
        radius = .114 + .010 * t if support else .066 + .018 * t
        for i in range(4):
            a = angle + i * .34
            point = e.lerp(shoulder, t + (i - 1.5) * .022)
            point += upper_tangent * (math.cos(a) * radius) + upper_across * (math.sin(a) * radius * .86)
            points.append(tuple(point))
        soft_sweep('Elbow_canvas_fold', parent, points, [.001, .003, .003, .001], 18, .6, 6)
    tangent = arm_axis.cross(Vector((0, 0, 1))).normalized()
    across = arm_axis.cross(tangent).normalized()
    # Rifle support sleeves expose their +Z face to the first-person camera.
    # Put two shallow diagonal creases there, just below the rolled cuff.
    visible_folds = [(.93, -2.05), (.98, -2.15)] if support else [(.78, .2), (.91, 2.6)]
    for t, angle in visible_folds:
        points = []
        for i in range(4):
            a = angle + i * .4
            center = p.lerp(e, t + (i - 1.5) * .022) + swell * (.6 if t < .81 else .6 * (1 - t) / .19)
            radius = .109 if support else .0575 if t < .81 else .0625
            points.append(tuple(center + tangent * (math.cos(a) * radius) + across * (math.sin(a) * radius * .86)))
        soft_sweep('Forearm_canvas_fold', parent, points, [.001, .004, .004, .001], 18, .6, 6)
    for center, axis, one, two, radius, length in [
            (p + arm_axis * .081, arm_axis, tangent, across, .070 if support else .0247, .010),
            (cuff - arm_axis * .018, arm_axis, tangent, across, .100 if support else .046, .011)]:
        for i in range(38):
            angle = i * 2.399963
            normal = one * math.cos(angle) + two * math.sin(angle) * .80
            start = center + normal * radius
            tip = start - axis * (length * (.7 + (i % 5) * .07)) + normal * .003
            fur_fin(parent, tuple(start), tuple(tip), 13 if i % 4 == 0 else 14)
    if support:
        # Sparse broad tufts soften the exposed forearm without wrist bands.
        for i in range(24):
            t = .14 + (i % 8) * .073
            angle = i * 2.399963
            normal = tangent * math.cos(angle) + across * (math.sin(angle) * .90)
            center = p.lerp(e, t) + swell * (t / .88)
            radius = .070 + min(1, max(0, (t - .08) / .8)) * .030
            start = center + normal * radius
            tip = start - arm_axis * .016 + normal * .007
            fur_fin(parent, tuple(start), tuple(tip), 13 if i % 3 else 14, .0032)
    # A flat palm follows the backstrap; the distinct digits remain readable.
    center = p + (Vector((-.008, 0, 0)) if vertical else Vector((0, 0, 0)))
    if side == -1 and weapon == 'pistol':
        center += Vector((.011, -.014, .023))
    radii = ((.043, .049, .030) if weapon == 'pistol' else (.047, .055, .032)) if pistol_grip else (.029, .043, .025) if vertical else (.045, .0465, .072) if support else (.029, .041, .037)
    ellipsoid('Skin_palm', parent, tuple(center), radii, 28, True)
    if pistol_grip:
        # The web is a broad continuation of the palm behind the backstrap,
        # not a long thumb crossing the camera-facing side like a wrist band.
        ellipsoid('Thumb_web', parent, (.040, -.144 if weapon == 'pistol' else -.154, .173 if weapon == 'pistol' else .153),
                  (.052, .034, .023), 28, True)
    ellipsoid('Palm_pad', parent, tuple(center + Vector((-side * radii[0] * .88, -.010, 0))), (.004, .014, .017), 30)
    fingers = group(weapon + '_grip_fingers', parent) if side == -1 or vertical else parent
    if fingers != parent:
        fingers['partRole'] = 'grip_fingers'
        fingers['gripAnchor'] = list(palm)
    if side == -1 and weapon == 'pistol':
        # Support meets the firing palm on the left, with its digits overlapping
        # the front curls rather than circling the rear of the grip toward camera.
        for i in range(3):
            y = -.157 - i * .030
            points = [(-.059, y, .162), (-.072, y, .082), (-.044, y, .029),
                      (.020, y, .018), (.068, y, .053)]
            digit(fingers, 'Support_digit_' + str(i), points, .0125, (1, .2, -.3))
        digit(parent, 'Support_thumb', [(-.066, -.154, .153), (-.083, -.122, .133),
              (-.087, -.105, .081), (-.084, -.102, .022), (-.079, -.107, -.020)], .013, (-1, .5, 0))
    elif pistol_grip:
        # Right hand: visible back and knuckles at +X/+Z, fingers curling over
        # the front (-Z), thumb passing behind the web to point along the left.
        trigger = group(weapon + '_trigger_finger', parent)
        trigger['partRole'] = 'trigger_finger'
        trigger['gripAnchor'] = list(palm)
        back = .146 if weapon == 'pistol' else .147
        digit(trigger, 'Trigger_digit', [(.088, -.150, .173) if weapon == 'pistol' else (.092, -.156, .162), (.096, -.092, .092),
              (.085, -.083, .047), (.058, -.099, .017), (.009, -.111, .028)], .0125, (1, .2, 0))
        for i in range(2):
            y = (-.168 if weapon == 'pistol' else -.187) - i * .037
            points = [(.096 if weapon == 'pistol' else .110, y, back + .013),
                      (.098 if weapon == 'pistol' else .123, y + .002, back - .043),
                      (.065, y, .053 if weapon == 'pistol' else .042),
                      (.018, y, .052 if weapon == 'pistol' else .043), (-.032, y, .067)]
            digit(parent, 'Grip_digit_' + str(i), points, .014 if weapon == 'pistol' else .0165, (-1, .2, -.2))
        thumb = [(-.004, -.125, .166), (-.053, -.094, .137), (-.061, -.085, .098),
                 (-.064, -.082, .055), (-.064, -.085, .025)] if weapon == 'pistol' else [
                 (-.004, -.137, .153), (-.053, -.101, .123), (-.065, -.097, .089),
                 (-.068, -.097, .048), (-.066, -.097, .015)]
        digit(parent, 'Grip_thumb', thumb, .015, (-1, .35, 0))
    elif support:
        # Three fingers curl around the fore-end; the thumb braces the other side.
        for i in range(3):
            z = p.z + (i - 1) * .043
            top = .105 if weapon == 'shotgun' else .130
            points = [(p.x + .010, p.y - .020, z), (p.x - .020, p.y + .010, z),
                      (p.x - .022, p.y + .075, z), (p.x + .001, p.y + top, z),
                      (p.x + .020, p.y + top - .020, z - .005)]
            digit(fingers, 'Support_digit_' + str(i), points, .0185, (-.3, 1, .2))
        digit(parent, 'Support_thumb', [(p.x + .015, p.y - .015, p.z + .060),
              (p.x + .040, p.y - .025, p.z + .077), (p.x + .090, p.y - .020, p.z + .072),
              (p.x + .150, p.y + .026, p.z + .066), (p.x + .165, p.y + .050, p.z + .035)], .020, (1, .5, .25))
    elif side == -1:
        # Slingshot support pinches the leather pouch; two spare digits fold in.
        for i in range(3):
            y = p.y + .019 - i * .025
            reach = .068 if i == 0 else .049
            digit(fingers, 'Pouch_digit_' + str(i), [(p.x, y, p.z), (p.x - .014, y + .010, p.z + .018),
                  (p.x + .005, y + .018, p.z + .035), (p.x + reach * .70, y + .017, p.z + .027),
                  (p.x + reach, y + .010, p.z + .006)], .0118, (0, .5, 1))
        digit(parent, 'Pouch_thumb', [(p.x, p.y + .020, p.z), (p.x + .014, p.y + .039, p.z - .010),
              (p.x + .039, p.y + .049, p.z - .009), (p.x + .061, p.y + .040, p.z - .001),
              (p.x + .066, p.y + .023, p.z + .005)], .013, (0, 1, .4))
    else:
        # Three short fingers plus the thumb make a four-digit cartoon forepaw.
        # Firearms keep the index on the trigger; melee grips use three curls.
        for i in range(3):
            y = p.y + .035 - i * .030
            if i == 0 and weapon not in ['machete', 'slingshot']:
                trigger = group(weapon + '_trigger_finger', parent)
                trigger['partRole'] = 'trigger_finger'
                trigger['gripAnchor'] = list(palm)
                points = [(p.x - .003, p.y + .028, p.z - .021), (p.x - .001, p.y + .050, p.z - .050),
                          (p.x - .006, p.y + .063, p.z - .081), (p.x - .031, p.y + .062, p.z - .094),
                          (.009, -.111, .028)]
                digit(trigger, 'Trigger_digit', points, .0125, (0, 1, 0))
            else:
                front = .056 if vertical else -.014 if weapon == 'slingshot' else .048 if weapon == 'pistol' else .046
                points = [(p.x - .008, y, p.z - .013), (p.x - .014, y + .002, front),
                          (.021, y + .003, front + (.008 if vertical else -.009)), (-.016, y + .002, front),
                          (-.036 if vertical else -.054, y, .019 if vertical else front + .024)]
                digit(fingers, 'Grip_digit_' + str(i), points, .0135, (-.5, .25, 1))
        thumb = [(p.x - .008, p.y + .010, p.z + .021),
                 (p.x + .006, p.y + .037, p.z + .021), (p.x + .002, p.y + .065, p.z + .003),
                 (p.x - .003, p.y + .077, p.z - .026), (p.x - .012, p.y + .073, p.z - .045)]
        if vertical:
            # The narrower machete handle needs the thumb against its side.
            thumb = [(p.x - .008, p.y + .010, p.z + .021), (.043, -.070, .053),
                     (.014, -.043, .040), (-.018, -.040, .020), (-.035, -.055, .010)]
        digit(parent, 'Grip_thumb', thumb, .015, (1, .25, .2))

def screw(parent, x, y, z):
    obj = cylinder('Recessed_screw', parent, (x, y, z), .010, .005, 1, sides=12)
    obj.rotation_euler.z = math.pi / 2
    block('Screw_slot', parent, (x + math.copysign(.004, x), y, z), (.003, .003, .013), 23, bevel=.001)


def machete(body):
    # A narrow curved section has a real spine and a continuous ground edge.
    sections = [( .020, .000, .032, .0045), (.095, -.002, .034, .0045),
                (.205, -.012, .035, .0041), (.315, -.027, .037, .0038),
                (.405, -.045, .036, .0033), (.467, -.063, .025, .0024),
                (.503, -.083, .0018, .0006)]
    vertices, faces, colours = [], [], []
    for y, center, half_width, thickness in sections:
        left, right = center - half_width, center + half_width
        bevel = min(.010, half_width * .60)
        ring = [(left, 0), (left + bevel, -thickness), (right - half_width * .15, -thickness),
                (right, -thickness * .5), (right, thickness * .5),
                (right - half_width * .15, thickness), (left + bevel, thickness)]
        vertices.extend(V((x, y, z)) for x, z in ring)
    count = 7
    for row in range(len(sections) - 1):
        for i in range(count):
            a, b = row * count + i, row * count + (i + 1) % count
            faces.append((a, a + count, b + count, b))
            colours.append(24 if i in [0, 6] else 0 if i in [2, 3, 4] else 7)
    faces += [tuple(range(count)), tuple(reversed([(len(sections) - 1) * count + i for i in range(count)]))]
    colours += [0, 1]
    mesh = bpy.data.meshes.new('Curved_ground_blade')
    mesh.from_pydata(vertices, [], faces); mesh.update()
    obj = bpy.data.objects.new('Curved_ground_blade', mesh)
    bpy.context.collection.objects.link(obj)
    finish(obj, body, 7)
    uv = mesh.uv_layers.active
    for face, color in zip(mesh.polygons, colours):
        # Broad calm longitudinal steel washes; only the thin bevel emits light.
        for loop in face.loop_indices:
            vertex = mesh.loops[loop].vertex_index
            co = mesh.vertices[vertex].co
            _, center, half_width, _ = sections[vertex // count]
            u = max(0, min(1, (co.x - center + half_width) / (2 * half_width)))
            v = max(0, min(1, (co.z - .02) / .485))
            uv.data[loop].uv = ((color + .12 + .76 * u) / 32, .06 + .88 * v)
        face.use_smooth = False
    profile('Full_tang', body, [(-.025, -.004), (.025, -.004), (.028, -.175), (.014, -.194), (-.022, -.186)], .038, 0, .006, 1)
    # Grip has a palm-sized swell and rounded heel, with two visible brass rivets.
    profile('Riveted_wood_grip', body, [(-.021, -.016), (.031, -.015), (.039, -.096),
            (.030, -.181), (.007, -.190), (-.018, -.177), (-.026, -.091)], .061, 2, .011, 3)
    block('Rounded_guard', body, (0, .004, .004), (.094, .020, .060), 0, .007, 1)
    for y in [-.047, -.145]:
        for sign in [-1, 1]:
            rivet = ellipsoid('Brass_grip_rivet', body, (sign * .032, y, .009), (.0024, .0055, .0055), 22)
    block('Grip_heel_inlay', body, (0, -.175, .009), (.065, .010, .053), 5, .003)


def hero_detail(weapon, body, action, magazine):
    if weapon not in ['pistol', 'smg', 'm4', 'shotgun']:
        return
    if weapon == 'pistol':
        for sign in [-1, 1]:
            # Layered machined slide, inset ejection panel and cocking serrations.
            block('Slide_side_inset', action, (sign * .061, .036, -.089), (.006, .040, .23), 4, .004)
            block('Slide_brushed_face', action, (sign * .065, .046, -.10), (.004, .017, .21), 5, .002)
            for z in [-.229, -.210, -.191, .055, .075, .095]:
                block('Machined_serration', action, (sign * .066, .020, z), (.007, .036, .008), 1, .002)
            for z in [-.12, .055]:
                screw(body, sign * .058, -.060, z)
            block('Slide_stop', body, (sign * .072, -.045, .017), (.020, .026, .066), 0, .006)
            block('Slide_stop_edge', body, (sign * .083, -.034, .017), (.004, .006, .050), 1, .002)
            block('Grip_inset', body, (sign * .044, -.167, .109), (.007, .124, .063), 21, .008)
            for row in range(6):
                for col in range(3):
                    ellipsoid('Grip_stipple', body, (sign * .049, -.215 + row * .019, .087 + col * .022), (.003, .004, .005), 3)
        block('Ejection_port', action, (.064, .038, -.112), (.008, .042, .074), 23, .007)
        block('Chamber_visible', action, (.069, .033, -.109), (.008, .025, .047), 1, .005)
        block('Front_sight_dot', action, (0, .100, -.220), (.008, .008, .003), 19, .003)
        for sign in [-1, 1]:
            block('Rear_sight_dot', action, (sign * .025, .100, .116), (.007, .008, .003), 19, .002)
        block('Magazine_body', magazine, (0, -.217, .119), (.073, .084, .073), 4, .008)
    else:
        for sign in [-1, 1]:
            block('Receiver_inset', body, (sign * .062, -.033, -.070), (.012, .085, .225), 4, .008)
            block('Receiver_cover', body, (sign * .070, -.013, -.071), (.008, .045, .191),
                  5 if weapon == 'm4' else 8 if weapon == 'shotgun' else 26, .007)
            if weapon in ['m4', 'shotgun']:
                block('Painted_receiver_pinstripe', body, (sign * .075, .007, -.071),
                      (.004, .005, .162), 27, .002)
            for z in [-.165, .057]:
                screw(body, sign * .080, -.038, z)
            for z in [-.36, -.41, -.46, -.51]:
                block('Handguard_vent_inset', body, (sign * .073, .013, z), (.014, .024, .031), 23, .005)
                block('Handguard_vent_lip', body, (sign * .080, -.004, z), (.006, .006, .032), 3 if weapon == 'm4' else 1, .002)
            if weapon != 'shotgun':
                for z in [-.185, -.143, -.101]:
                    block('Magazine_flute', magazine, (sign * .048, -.224, z), (.006, .157, .012), 0, .003)
            block('Grip_panel', body, (sign * .046, -.164, .093), (.006, .11, .056), 21, .004)
            for yy in [-.207, -.184, -.161, -.138, -.115]:
                block('Grip_rib', body, (sign * .05, yy, .094), (.009, .004, .047), 3, .001)
            block('Stock_cheek_pad', body, (sign * .046, -.054 if weapon == 'smg' else -.047, .255 if weapon == 'smg' else .285),
                  (.014, .040, .13 if weapon == 'smg' else .17), 4, .012)
        block('Receiver_lower_seam', body, (0, -.118, -.086), (.131, .009, .258), 23, .003)
        if weapon == 'shotgun':
            # Visible underside shell mouth, centred beneath the tubular action.
            block('Shell_loading_recess', body, (0, -.1245, -.094), (.056, .006, .111), 23, .003)
            for side in [-1, 1]:
                block('Shell_port_lip', body, (side * .032, -.127, -.094), (.008, .010, .122), 0, .002, 1)
                block('Shell_port_end', body, (0, -.127, -.094 + side * .065), (.070, .010, .009), 0, .002)
        block('Ejection_recess', body, (.078, .019, -.102), (.010, .026, .103), 23, .004)
        rail_count = 6 if weapon == 'shotgun' else 8 if weapon == 'smg' else 11
        rail_start = -.07 if weapon == 'shotgun' else -.30
        rail_end = rail_start - (rail_count - 1) * .025
        block('Connected_rail_bed', body, (0, .059, (rail_start + rail_end) / 2),
              (.054, .018, rail_start - rail_end + .026), 0, .004, 1)
        for i in range(rail_count):
            z = rail_start - i * .025
            block('Accessory_rail_tooth', body, (0, .073, z), (.066, .012, .012), 0, .003, 1)
        sling_z = .29 if weapon == 'smg' else .39
        for side in [-1, 1]:
            link('Sling_loop', body, (side * .040, -.06, sling_z), (side * .061, -.084, sling_z), .008, 1)
        cylinder('Muzzle_lock_ring', body, (0, 0, -.594 if weapon == 'smg' else -.883), .043, .026, 1, sides=16)


def personal_details(weapon, body, right):
    if weapon in ['machete', 'slingshot']:
        return
    for sign in [-1, 1]:
        # Original capybara decal built as shallow coloured relief, no logo source.
        x = sign * (.070 if weapon == 'pistol' else .083)
        block('Capy_sticker_backing', body, (x, -.074, -.032), (.0025, .036, .051), 27, .006)
        ellipsoid('Capy_sticker_head', body, (x + sign * .002, -.074, -.030), (.0018, .010, .018), 3)
        for z in [-.040, -.020]:
            ellipsoid('Capy_sticker_ear', body, (x + sign * .002, -.061, z), (.0018, .005, .004), 2)
        ellipsoid('Capy_sticker_eye', body, (x + sign * .004, -.072, -.038), (.001, .0017, .0017), 23)
        font = bpy.data.curves.new('Serial_ILHA_26', type='FONT')
        font.body, font.size, font.extrude, font.resolution_u = 'ILHA-26', .011, .00015, 2
        text = bpy.data.objects.new('Stamped_serial', font)
        bpy.context.collection.objects.link(text)
        text.location = V((x, -.032, .046 if sign > 0 else -.092))
        text.rotation_euler = Matrix(((0, 0, sign), (sign, 0, 0), (0, 1, 0))).to_euler()
        bpy.ops.object.select_all(action='DESELECT')
        text.select_set(True); bpy.context.view_layer.objects.active = text
        bpy.ops.object.convert(target='MESH')
        finish(bpy.context.object, body, 1)
    for i in range(3):
        block('Grip_tape_wrap', body, (0, -.156 - i * .020, .093), (.103, .011, .071), 18 if i % 2 else 27, .004)
    if weapon == 'm4':
        # Keep the hanging charm ahead of the firing palm, with an attached eyelet.
        link('Charm_anchor', body, (.061, -.10, -.063), (.094, -.115, -.063), .005, 1)
        charm = group('m4_capy_charm', body, (0, 0, -.13))
        charm['partRole'] = 'charm'
        for i in range(4):
            bpy.ops.mesh.primitive_torus_add(major_radius=.009, minor_radius=.002, major_segments=12, minor_segments=6,
                location=V((.094, -.115 - i * .014, .067)), rotation=(math.pi / 2 if i % 2 else 0, 0, 0))
            finish(bpy.context.object, charm, 1)
        ellipsoid('Charm_body', charm, (.094, -.20, .067), (.023, .025, .017), 3, True)
        ellipsoid('Charm_head', charm, (.094, -.176, .062), (.025, .018, .022), 3, True)
        for x in [.076, .110]:
            ellipsoid('Charm_ear', charm, (x, -.158, .069), (.009, .009, .006), 2)
            ellipsoid('Charm_eye', charm, (x, -.174, .041), (.0025, .003, .002), 23)


def bake_weapon_ao(meshes):
    bpy.context.view_layer.update()
    vertices, faces = [], []
    for obj in meshes:
        offset = len(vertices)
        vertices.extend([obj.matrix_world @ v.co for v in obj.data.vertices])
        faces.extend([[offset + i for i in f.vertices] for f in obj.data.polygons])
    bvh = BVHTree.FromPolygons(vertices, faces)
    directions = []
    for i in range(8):
        z = (i + .5) / 8
        a = i * 2.39996323
        directions.append(Vector((math.sqrt(1-z*z) * math.cos(a), math.sqrt(1-z*z) * math.sin(a), z)))
    for obj in meshes:
        layer = obj.data.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
        normals = obj.matrix_world.to_3x3().inverted().transposed()
        values, totals, counts = [], [0.0] * len(obj.data.vertices), [0] * len(obj.data.vertices)
        for poly in obj.data.polygons:
            normal = (normals @ poly.normal).normalized()
            center = obj.matrix_world @ poly.center + normal * .0012
            orient = Vector((0, 0, 1)).rotation_difference(normal)
            hits = sum(bvh.ray_cast(center, orient @ d, .095)[0] is not None for d in directions)
            shade = 1 - hits / 8 * .36
            values.append(shade)
            for vertex in poly.vertices:
                totals[vertex] += shade
                counts[vertex] += 1
        for poly, face_shade in zip(obj.data.polygons, values):
            for loop in poly.loop_indices:
                vertex = obj.data.loops[loop].vertex_index
                shade = totals[vertex] / max(1, counts[vertex]) if poly.use_smooth else face_shade
                layer.data[loop].color = (shade, shade, shade, 1)


report = {'palette': PALETTE, 'weapons': []}
for weapon in ['pistol', 'smg', 'm4', 'shotgun', 'dmr', 'sniper', 'machete', 'slingshot']:
    root = group(weapon)
    body = group(weapon + '_body', root)
    magazine = group(weapon + '_magazine', root)
    action = group(weapon + '_action', root)
    right = group(weapon + '_right_paw', root)
    left = group(weapon + '_left_paw', root) if weapon != 'machete' else None
    sight_y, muzzle_x, muzzle_y, muzzle_z = .1, 0, 0, -.7
    if weapon == 'pistol':
        profile('Frame', body, [(-.23, -.015), (.14, -.015), (.14, -.1), (-.18, -.1)], .105, 0, .009, 1)
        # A crowned, tapered slide replaces the broad rectangular rear block.
        cross_section = [(-.047, -.011), (.047, -.011), (.058, .004), (.059, .039),
                         (.050, .063), (.029, .081), (0, .087), (-.029, .081),
                         (-.050, .063), (-.059, .039), (-.058, .004)]
        sections = [(-.285, .88, -.009), (-.269, 1, 0), (.075, 1, 0), (.122, .91, -.004), (.143, .83, -.009)]
        verts, faces = [], []
        for z, width, drop in sections:
            verts.extend(V((x * width, y + drop, z)) for x, y in cross_section)
        count = len(cross_section)
        for row in range(len(sections) - 1):
            for i in range(count):
                a, b = row * count + i, row * count + (i + 1) % count
                faces.append((a, b, b + count, a + count))
        faces += [tuple(reversed(range(count))), tuple((len(sections) - 1) * count + i for i in range(count))]
        mesh = bpy.data.meshes.new('Crowned_slide')
        mesh.from_pydata(verts, [], faces); mesh.update()
        slide = bpy.data.objects.new('Crowned_slide', mesh)
        bpy.context.collection.objects.link(slide)
        finish(slide, action, 26, .005, 1)
        block('Rear_slide_plate', action, (0, .026, .145), (.066, .049, .009), 4, .008)
        block('Rear_plate_inset', action, (0, .027, .151), (.047, .030, .004), 0, .006)
        cylinder('Striker_pin', action, (0, .030, .156), .006, .005, 1, sides=16)
        cylinder('Barrel', body, (0, .025, -.272), .027, .067, 4)
        cylinder('Bore', body, (0, .025, -.308), .017, .007, 23)
        grip(body, True)
        block('Magazine_base', magazine, (0, -.26, .118), (.099, .04, .1), 0)
        for z in [.055, .078, .101]:
            for x in [-.061, .061]:
                block('Slide_flute', action, (x, .035, z), (.006, .038, .01), 1, .002)
        sight_y = sights(action, -.23, .104, .088)
        muzzle_y, muzzle_z = .025, -.312
    elif weapon in ['smg', 'm4', 'shotgun', 'dmr', 'sniper']:
        data = {'smg': (-.62, .34, .24), 'm4': (-.91, .47, .34), 'shotgun': (-1.00, .46, .40), 'dmr': (-1.04, .50, .39), 'sniper': (-1.23, .56, .44)}[weapon]
        muzzle_z, rear, handguard = data
        wood = weapon in ['m4', 'shotgun', 'dmr']
        profile('Receiver', body, [(-.28, .055), (.13, .055), (.17, .003), (.14, -.115), (-.25, -.115), (-.31, -.066)],
                .12, 5 if weapon == 'm4' else 8 if weapon == 'shotgun' else 0,
                .018 if weapon in ['m4', 'shotgun'] else .012, 1)
        cylinder('Barrel', body, (0, 0, (muzzle_z - .23) / 2), .024 if weapon != 'shotgun' else .033, abs(muzzle_z + .23), 0)
        cylinder('Muzzle_crown', body, (0, 0, muzzle_z + .028), .042 if weapon != 'sniper' else .049, .06, 0)
        cylinder('Bore', body, (0, 0, muzzle_z - .004), .024, .008, 23)
        stock(body, rear, wood)
        grip(body)
        if weapon == 'shotgun':
            cylinder('Magazine_tube', body, (0, -.063, -.57), .026, .61, 0)
            profile('Pump', action, [(-.59, -.023), (-.34, -.023), (-.30, -.065), (-.35, -.132), (-.58, -.132), (-.62, -.09)], .14, 2, .014, 3)
            for z in [-.54, -.48, -.42, -.36]:
                block('Pump_rib', action, (0, -.099, z), (.154, .03, .022), 3, .006)
            sight_y = sights(body, -.93, .07, .07)
        else:
            profile('Handguard', body, [(-.27 - handguard, .052), (-.29, .052), (-.26, -.06), (-.27 - handguard, -.066)], .128 if weapon != 'smg' else .143, 2 if wood else 0, .012, 3 if wood else 1)
            for z in [-.32, -.40, -.48][:2 if weapon == 'smg' else 3]:
                for x in [-.067, .067]:
                    block('Vent', body, (x, .014, z), (.006, .025, .044), 4, .003)
            curved = weapon == 'm4'
            profile('Magazine', magazine, [(-.17, -.09), (-.052, -.09), (-.05, -.27), (-.095 if curved else -.052, -.37), (-.202 if curved else -.17, -.36)], .089, 4, .011)
            block('Magazine_trim', magazine, (0, -.33, -.132), (.102, .033, .12), 0)
            block('Bolt', action, (.071, -.003, -.06), (.032, .04, .107), 1)
            if weapon == 'm4':
                block('Low_receiver_rail', body, (0, .069, -.060), (.045, .019, .325), 0, .005, 1)
                for z in [-.18, -.12, -.06, 0, .06]:
                    block('Receiver_rail_slot', body, (0, .079, z), (.048, .006, .011), 1, .002)
                sight_y = sights(body, -.72, .09, .15)
            elif weapon in ['dmr', 'sniper']:
                sight_y = scope(body, -.46, .42 if weapon == 'sniper' else .29, .0465 if weapon == 'sniper' else .048)
                if weapon == 'sniper':
                    link('Bolt_handle', action, (.063, .026, .03), (.16, -.027, .061), .014, 1)
                    ellipsoid('Bolt_knob', action, (.162, -.03, .063), (.027, .026, .027), 4)
            else:
                sight_y = sights(body, -.48, .08, .09)
    elif weapon == 'machete':
        machete(body)
        muzzle_x, muzzle_y, muzzle_z, sight_y = -.083, .503, 0, 0
    else:
        # Carved Y. Forks and coral bands form a silhouette no firearm shares.
        link('Wood_grip', body, (0, -.23, .10), (0, .04, -.02), .056, 2, .063)
        for side in [-1, 1]:
            link('Wood_fork', body, (0, .01, -.018), (side * .14, .24, -.12), .052, 2, .035)
            ellipsoid('Fork_end', body, (side * .14, .24, -.12), (.038, .037, .034), 3)
            link('Coral_band', action, (side * .14, .24, -.12), (side * .025, .09, .20), .015, 8)
        block('Leather_pouch', action, (0, .087, .20), (.089, .051, .019), 21)
        muzzle_y, muzzle_z, sight_y = .24, -.12, .24
    if weapon in ['smg', 'm4', 'shotgun', 'dmr', 'sniper']:
        muzzle_z -= .008  # Front surface of the authored bore disc.
    hero_detail(weapon, body, action, magazine)
    # Teal accent and rarity stripe use the same atlas in all eight classes.
    side_x = .054 if weapon == 'pistol' else .041 if weapon == 'machete' else .049 if weapon == 'slingshot' else .062
    if weapon == 'machete':
        block('Rarity_grip_heel', body, (0, -.184, .009), (.060, .006, .044), 9, .002)
    elif weapon == 'slingshot':
        block('Teal_signature', body, (side_x, -.034, .015), (.011, .023, .076), 5, .003)
        link('Rarity_grip_band', body, (0, -.190, .0822), (0, -.174, .0751), .058, 9)
    else:
        block('Teal_signature', body, (side_x, -.034, .015), (.011, .023, .076), 5, .003)
        block('Rarity_stripe', body, (side_x + .001, -.065, -.096), (.009, .034, .09), 9, .003)
    # Gold filigree is a separate optional group, enabled only on legendary variants.
    legendary = group(weapon + '_legendary', root)
    if weapon == 'machete':
        for side in [-1, 1]:
            for y in [-.069, -.108]:
                block('Gold_grip_inlay', legendary, (side * .031, y, .006), (.002, .021, .029), 12, .001)
    elif weapon == 'slingshot':
        for side in [-1, 1]:
            link('Gold_fork_binding', legendary, (side * .094, .164, -.086),
                 (side * .105, .182, -.094), .045, 12, .042)
    else:
        for side in [-1, 1]:
            for a, b in [((-.17, -.051), (-.12, -.026)), ((-.12, -.026), (-.08, -.049)), ((-.08, -.049), (-.04, -.028))]:
                link('Gold_filigree', legendary, (side * (side_x + .005), a[1], a[0]), (side * (side_x + .005), b[1], b[0]), .004, 12)
    if weapon == 'pistol':
        paw(right, 1, (.066, -.156, .123), (.23, -.34, .30))
        paw(left, -1, (-.067, -.178, .151), (-.24, -.31, .31))
    elif weapon == 'machete':
        paw(right, 1, (.075, -.12, .04), (.16, -.26, -.04), vertical=True)
    elif weapon == 'slingshot':
        paw(right, 1, (.06, -.10, .07), (.23, -.28, 0))
        paw(left, -1, (-.025, .045, .21), (-.24, -.23, .005))
    else:
        support_z = -.380 if weapon == 'shotgun' else -.325 if weapon in ['dmr', 'sniper'] else -.300 if weapon == 'm4' else -.265
        support_y = -.140 if weapon == 'shotgun' else -.095 if weapon == 'm4' else -.101 if weapon == 'smg' else -.100
        paw(right, 1, (.072, -.177, .092), (.24, -.285, .22))
        # The support elbow sits below the viewport, keeping the cuff at its
        # lower edge instead of crossing the frame with the upper sleeve.
        paw(left, -1, (-.082, support_y, support_z), (-.54, -.93, -.40))
    group(weapon + '_muzzle', root, (muzzle_x, muzzle_y, muzzle_z))
    group(weapon + '_eject', root, (.079, -.024, -.075))
    group(weapon + '_sight', root, (0, sight_y, .07))
    personal_details(weapon, body, right)
    finger_nodes = [node for node in root.children_recursive if node.type == 'EMPTY' and
                    node.get('partRole') in ['trigger_finger', 'grip_fingers']]
    for node in finger_nodes:
        merge_group(node, node.name + '_mesh')
    for part in [body, magazine, action, right, left, legendary]:
        if part:
            merge_group(part, part.name + '_mesh')
    # Identity child pivots preserve legacy groups and expose semantic reload parts.
    # Runtime normalizes partRole names per cloned weapon because GLTFLoader
    # gives globally duplicated node names numeric suffixes.
    roles = [(magazine, 'mag'), (action, 'slide' if weapon == 'pistol' else 'bolt'), (left, 'grip_l')]
    for parent, role in roles:
        if parent and parent.children:
            visible = list(parent.children)
            alias = group(weapon + '_' + role, parent)
            alias['partRole'] = role
            alias['motionAxis'] = '-Y' if role == 'mag' else '+Z' if role in ['slide', 'bolt'] else '-Y'
            for child in visible:
                child.parent = alias
    meshes = [o for o in root.children_recursive if o.type == 'MESH']
    triangles = 0
    for mesh in meshes:
        mesh.data.calc_loop_triangles()
        triangles += len(mesh.data.loop_triangles)
        assert not mesh.data.validate(verbose=False, clean_customdata=False), mesh.name
    budget = 35000
    if triangles > budget:
        ratio = (budget - 100) / triangles
        for obj in meshes:
            bpy.context.view_layer.objects.active = obj
            mod = obj.modifiers.new('FP triangle budget', 'DECIMATE')
            mod.ratio = ratio
            bpy.ops.object.modifier_apply(modifier=mod.name)
            obj.data.validate(verbose=False, clean_customdata=False)
            assert not obj.data.validate(verbose=False, clean_customdata=False), obj.name
            obj.data.calc_loop_triangles()
        triangles = sum(len(obj.data.loop_triangles) for obj in meshes)
    bake_weapon_ao(meshes)
    report['weapons'].append({'id': weapon, 'trianglesWithPaws': triangles, 'muzzle': [muzzle_x, muzzle_y, muzzle_z], 'sightY': sight_y,
        'gripAnchors': {hand: list(node['gripAnchor']) for hand, node in [('right', right), ('left', left)] if node},
        'elbowAnchors': {hand: list(node['elbowAnchor']) for hand, node in [('right', right), ('left', left)] if node},
        'shoulderAnchors': {hand: list(node['shoulderAnchor']) for hand, node in [('right', right), ('left', left)] if node}})
    root['weaponId'] = weapon
    root['sightY'] = sight_y
    root['forward'] = '-Z'
    assert triangles <= budget, (weapon, triangles)

bpy.ops.export_scene.gltf(filepath=str(OUT / 'weapons.raw.glb'), export_format='GLB', export_animations=False, export_vertex_color='NAME', export_vertex_color_name='Color', export_yup=True, export_extras=True, export_cameras=False, export_lights=False)
(OUT / 'blender-report.json').write_text(json.dumps(report, indent=2) + '\n')
print('WEAPONS_REPORT ' + json.dumps(report))
