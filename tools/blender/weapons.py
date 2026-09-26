"""Original Direction A weapon set. Blender 5.0.1, metres, game forward -Z.
Eight distinct silhouettes use one painted atlas and capybara paws.
No photographs, noise, normal maps, trademarks or downloaded geometry.
"""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector
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
        shade *= .94 + .065 * math.sin(u * 95 + math.sin(v * 42) * 2.3 + v * 16) + .035 * math.sin(u * 53 - v * 32)
    elif column in [17, 18]:
        shade *= .95 + .04 * math.sin(u * 90) * math.sin(v * 210)
    elif column in [4, 23]:
        shade *= .94 + .045 * math.sin(u * 80) * math.cos(v * 120)
    else:
        shade *= .97 + .025 * math.sin(v * 85 + u * 8)
    return shade

image = bpy.data.images.new('Ilha_Dourada_weapons', width=1024, height=256, alpha=False)
pixels = []
for y in range(256):
    for x in range(1024):
        column, u, v = x // 32, (x % 32 + .5) / 32, (y + .5) / 256
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
roughness.pixels = [c for y in range(32) for x in range(32) for c in ([.62 if x in [0, 1, 7, 24] else .97 if x in [13,14,15,16,17,18,19] else .87] * 3 + [1])]
roughness.filepath_raw = str(OUT / 'roughness.png')
roughness.file_format = 'PNG'
roughness.save()
roughness.pack()
roughness_node = material.node_tree.nodes.new('ShaderNodeTexImage')
roughness_node.image = roughness
roughness_node.interpolation = 'Closest'
material.node_tree.links.new(roughness_node.outputs['Color'], bsdf.inputs['Roughness'])

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
    for poly in obj.data.polygons:
        index = edge if edge is not None and .12 < poly.normal.z < .96 else color
        points = [obj.data.vertices[v].co for v in poly.vertices]
        normal = poly.normal
        axes = [0, 1] if abs(normal.z) > .6 else [1, 2] if abs(normal.x) > .6 else [0, 2]
        bounds = [(min(v[a] for v in points), max(v[a] for v in points)) for a in axes]
        for loop in poly.loop_indices:
            co = obj.data.vertices[obj.data.loops[loop].vertex_index].co
            u, v = [(co[a] - lo) / max(.001, hi - lo) for a, (lo, hi) in zip(axes, bounds)]
            uv.data[loop].uv = ((index + .12 + .76 * u) / 32, .06 + .88 * v)
        poly.use_smooth = False
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
    profile('Stock', parent, [(.13, -.02), (rear - .03, -.045), (rear, -.095), (rear, -.205), (rear - .13, -.19), (.17, -.10)], .11, 2 if wood else 4, .012, 3 if wood else None)
    block('Butt_pad', parent, (0, -.126, rear), (.126, .167, .03), 4)


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
    base_bottom = .074 if 'pistol' in parent.name else .023
    base_height = max(.02, height - base_bottom)
    block('Front_sight_base', parent, (0, base_bottom + base_height / 2, front), (.065, base_height, .047), 0)
    block('Front_sight', parent, (0, height + .012, front), (.022, .045, .021), 1, .004)
    for x in [-.033, .033]:
        block('Rear_sight', parent, (x, height + .007, rear), (.019, .045, .026), 0, .004)
    return height + .0345


def scope(parent, front=-.41, length=.35, radius=.05):
    for z in [front + .08, front + length - .07]:
        block('Scope_mount', parent, (0, .11, z), (.063, .07, .047), 0)
    sleeve('Scope', parent, (0, .169, front + length / 2), radius, length, 0)
    for z in [front, front + length]:
        sleeve('Scope_rim', parent, (0, .169, z), radius * 1.16, .036, 1)
    block('Scope_dial', parent, (0, .221, front + length * .6), (.067, .04, .048), 4)
    return .169


def paw(parent, side, palm, elbow, vertical=False):
    # Three rounded fingers and an opposable thumb. Fixed brown fur and dark pads.
    p, e = Vector(palm), Vector(elbow)
    hero = parent.name.split('_')[0] in ['pistol', 'smg', 'm4']
    existing_parts = set(parent.children)
    wrist = p.lerp(e, .28)
    link('Forearm', parent, tuple(e), tuple(wrist), .084 if hero else .074, 13, .067 if hero else .059)
    link('Forearm_light', parent, tuple(e + Vector((0, .046, 0))), tuple(wrist + Vector((0, .04, 0))), .025, 14, .016)
    link('Olive_cuff', parent, tuple(p.lerp(e, .25)), tuple(p.lerp(e, .43)), .077, 17, .077)
    if hero:
        link('Fabric_sleeve', parent, tuple(p.lerp(e, .61)), tuple(e), .091, 17, .099)
        link('Folded_cuff', parent, tuple(p.lerp(e, .57)), tuple(p.lerp(e, .65)), .098, 18, .096)
        link('Cuff_piping', parent, tuple(p.lerp(e, .575)), tuple(p.lerp(e, .590)), .101, 19, .101)
        for i in range(3):
            t = .72 + i * .08
            link('Sleeve_fold', parent, tuple(p.lerp(e, t)), tuple(p.lerp(e, t + .025)), .098, 17, .102)
    ellipsoid('Palm', parent, palm, (.076, .087, .065) if vertical else (.083, .066, .092), 13, vertical)
    ellipsoid('Palm_pad', parent, (p.x, p.y - .055, p.z), (.051, .018, .057), 16, vertical)
    if vertical:
        link('Teal_wrist_band', parent, tuple(p.lerp(e, .40)), tuple(p.lerp(e, .44)), .079, 5, .079)
    for i in [-1, 0, 1]:
        center = (p.x - .063, p.y + i * .047, p.z - .013) if vertical else (p.x + i * .044, p.y + .018, p.z - .07)
        if hero:
            center = (p.x - side * .035, p.y + .005 + i * .037, p.z - .050)
        ellipsoid('Finger', parent, center, (.047, .025, .036) if vertical else (.050, .024, .040) if hero else (.026, .037, .048), 13, vertical or hero)
        claw = (center[0] - .035, center[1], center[2] + .014) if vertical else (center[0], center[1] + .004, center[2] - .042)
        ellipsoid('Claw', parent, claw, (.018, .015, .016), 16, vertical)
    thumb = (p.x - .034, p.y + .081, p.z + .025) if vertical else (p.x - side * .064, p.y + .035, p.z + .027)
    ellipsoid('Thumb', parent, thumb, (.037, .04, .042), 14, vertical)
    for i in [-1, 1]:
        ellipsoid('Wrist_tuft', parent, (wrist.x + i * .055, wrist.y, wrist.z), (.025, .026, .042), 13)


    if vertical or hero:
        # Fuse the palm, knuckles and thumb into one padded organic silhouette.
        # Separate overlapping spheres made the fingers read as flat wedges.
        fur_parts = [obj for obj in parent.children if obj not in existing_parts and
                     obj.name.split('.')[0] in ['Palm', 'Finger', 'Thumb', 'Wrist_tuft']]
        bpy.ops.object.select_all(action='DESELECT')
        for obj in fur_parts:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = fur_parts[0]
        bpy.ops.object.join()
        palm_mesh = bpy.context.object
        palm_mesh.name = 'Continuous_paw'
        remesh = palm_mesh.modifiers.new('Rounded paw union', 'REMESH')
        remesh.mode, remesh.voxel_size, remesh.use_smooth_shade = 'VOXEL', .004 if hero else .0045, True
        bpy.ops.object.modifier_apply(modifier=remesh.name)
        smooth = palm_mesh.modifiers.new('Soft palm', 'SMOOTH')
        smooth.factor, smooth.iterations = .7, 3
        bpy.ops.object.modifier_apply(modifier=smooth.name)
        palm_mesh.data.calc_loop_triangles()
        decimate = palm_mesh.modifiers.new('Paw budget', 'DECIMATE')
        decimate.ratio = min(1, (4800 if hero else 3500) / len(palm_mesh.data.loop_triangles))
        bpy.ops.object.modifier_apply(modifier=decimate.name)
        finish(palm_mesh, parent, 13)
        for face in palm_mesh.data.polygons:
            face.use_smooth = True


def screw(parent, x, y, z):
    obj = cylinder('Recessed_screw', parent, (x, y, z), .010, .005, 1, sides=12)
    obj.rotation_euler.z = math.pi / 2
    block('Screw_slot', parent, (x + math.copysign(.004, x), y, z), (.003, .003, .013), 23, bevel=.001)


def hero_detail(weapon, body, action, magazine):
    if weapon not in ['pistol', 'smg', 'm4']:
        return
    if weapon == 'pistol':
        for sign in [-1, 1]:
            # Layered machined slide, inset ejection panel and cocking serrations.
            block('Slide_side_inset', action, (sign * .061, .036, -.089), (.006, .040, .23), 4, .004)
            block('Slide_brushed_face', action, (sign * .065, .046, -.10), (.004, .017, .21), 0, .002)
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
        block('Front_sight_dot', action, (0, .124, -.228), (.012, .013, .006), 19, .003)
        for sign in [-1, 1]:
            block('Rear_sight_dot', action, (sign * .033, .124, .12), (.008, .01, .004), 19, .002)
        block('Magazine_body', magazine, (0, -.217, .119), (.073, .084, .073), 4, .008)
    else:
        for sign in [-1, 1]:
            block('Receiver_inset', body, (sign * .062, -.033, -.070), (.012, .085, .225), 4, .008)
            block('Receiver_cover', body, (sign * .070, -.013, -.071), (.008, .045, .191), 0, .007)
            for z in [-.165, .057]:
                screw(body, sign * .080, -.038, z)
            for z in [-.36, -.41, -.46, -.51]:
                block('Handguard_vent_inset', body, (sign * .073, .013, z), (.014, .024, .031), 23, .005)
                block('Handguard_vent_lip', body, (sign * .080, -.004, z), (.006, .006, .032), 3 if weapon == 'm4' else 1, .002)
            for z in [-.185, -.143, -.101]:
                block('Magazine_flute', magazine, (sign * .048, -.224, z), (.006, .157, .012), 0, .003)
            block('Grip_panel', body, (sign * .046, -.164, .093), (.006, .11, .056), 21, .004)
            for yy in [-.207, -.184, -.161, -.138, -.115]:
                block('Grip_rib', body, (sign * .05, yy, .094), (.009, .004, .047), 3, .001)
            block('Stock_cheek_pad', body, (sign * .063, -.053, .285), (.013, .040, .17), 4, .012)
        block('Receiver_lower_seam', body, (0, -.118, -.086), (.131, .009, .258), 23, .003)
        block('Ejection_recess', body, (.078, .019, -.102), (.010, .026, .103), 23, .004)
        for i in range(8 if weapon == 'smg' else 11):
            z = -.30 - i * .025
            block('Accessory_rail_tooth', body, (0, .073, z), (.078, .012, .012), 0, .003, 1)
        for side in [-1, 1]:
            link('Sling_loop', body, (side * .07, -.06, .39), (side * .09, -.10, .39), .009, 1)
        cylinder('Muzzle_lock_ring', body, (0, 0, -.594 if weapon == 'smg' else -.883), .043, .026, 1, sides=16)


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
        for poly in obj.data.polygons:
            normal = (normals @ poly.normal).normalized()
            center = obj.matrix_world @ poly.center + normal * .0012
            orient = Vector((0, 0, 1)).rotation_difference(normal)
            hits = sum(bvh.ray_cast(center, orient @ d, .095)[0] is not None for d in directions)
            shade = 1 - hits / 8 * .36
            for loop in poly.loop_indices:
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
        profile('Slide', action, [(-.285, .014), (-.263, .084), (.12, .084), (.148, .055), (.14, -.011), (-.285, -.011)], .119, 0, .009, 1)
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
        profile('Receiver', body, [(-.28, .055), (.13, .055), (.17, .003), (.14, -.115), (-.25, -.115), (-.31, -.066)], .12, 0, .012, 1)
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
                for z in [-.20, .08]:
                    block('Carry_handle_support', body, (0, .102, z), (.047, .105, .037), 0)
                block('Carry_handle', body, (0, .151, -.06), (.067, .031, .33), 0)
                sight_y = sights(body, -.72, .09, .15)
            elif weapon in ['dmr', 'sniper']:
                sight_y = scope(body, -.46, .42 if weapon == 'sniper' else .29, .062 if weapon == 'sniper' else .048)
                if weapon == 'sniper':
                    link('Bolt_handle', action, (.063, .026, .03), (.16, -.027, .061), .014, 1)
                    ellipsoid('Bolt_knob', action, (.162, -.03, .063), (.027, .026, .027), 4)
            else:
                sight_y = sights(body, -.48, .08, .09)
    elif weapon == 'machete':
        # Broad face lies in the screen-facing plane; the handle is gripped upright.
        blade = profile('Broad_blade', body, [(-.045, .02), (-.16, .49), (-.14, .60), (-.065, .57), (.045, .02)], .023, 7, .008, 24)
        blade.rotation_euler.z = math.pi / 2
        block('Wood_handle', body, (0, -.108, .01), (.073, .205, .068), 2, .015, 3)
        block('Wood_guard', body, (0, .005, .01), (.127, .027, .074), 2, .009, 3)
        muzzle_x, muzzle_y, muzzle_z, sight_y = -.14, .60, 0, 0
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
        # Rarity is a cloth band around the wrist, never a floating handle decal.
        p, e = Vector((.075, -.12, .04)), Vector((.26, -.48, -.10))
        link('Rarity_wrist_band', right, tuple(p.lerp(e, .27)), tuple(p.lerp(e, .31)), .079, 9, .079)
    else:
        block('Teal_signature', body, (side_x, -.034, .015), (.011, .023, .076), 5, .003)
        block('Rarity_stripe', body, (side_x + .001, -.065, -.096), (.009, .034, .09), 9, .003)
    # Gold filigree is a separate optional group, enabled only on legendary variants.
    legendary = group(weapon + '_legendary', root)
    for side in [-1, 1]:
        for a, b in [((-.17, -.051), (-.12, -.026)), ((-.12, -.026), (-.08, -.049)), ((-.08, -.049), (-.04, -.028))]:
            link('Gold_filigree', legendary, (side * (side_x + .005), a[1], a[0]), (side * (side_x + .005), b[1], b[0]), .004, 12)
    if weapon == 'pistol':
        paw(right, 1, (.066, -.156, .123), (.28, -.48, .10))
        paw(left, -1, (-.067, -.178, .151), (-.12, -.48, .10))
    elif weapon == 'machete':
        paw(right, 1, (.075, -.12, .04), (.26, -.48, -.10), vertical=True)
    elif weapon == 'slingshot':
        paw(right, 1, (.06, -.10, .07), (.27, -.48, .10))
        paw(left, -1, (-.025, .045, .21), (-.14, -.48, .10))
    else:
        support_z = -.47 if weapon == 'shotgun' else -.40 if weapon in ['dmr', 'sniper'] else -.37 if weapon == 'm4' else -.34
        paw(right, 1, (.072, -.177, .092), (.29, -.48, .10))
        paw(left, -1, (-.074, -.11, support_z), (-.15, -.40, .14))
    group(weapon + '_muzzle', root, (muzzle_x, muzzle_y, muzzle_z))
    group(weapon + '_eject', root, (.079, -.024, -.075))
    group(weapon + '_sight', root, (0, sight_y, .07))
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
    budget = 24000 if weapon in ['pistol', 'smg', 'm4'] else 10000
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
    report['weapons'].append({'id': weapon, 'trianglesWithPaws': triangles, 'muzzle': [muzzle_x, muzzle_y, muzzle_z], 'sightY': sight_y})
    root['weaponId'] = weapon
    root['sightY'] = sight_y
    root['forward'] = '-Z'
    assert triangles <= budget, (weapon, triangles)

bpy.ops.export_scene.gltf(filepath=str(OUT / 'weapons.raw.glb'), export_format='GLB', export_animations=False, export_vertex_color='NAME', export_vertex_color_name='Color', export_yup=True, export_extras=True, export_cameras=False, export_lights=False)
(OUT / 'blender-report.json').write_text(json.dumps(report, indent=2) + '\n')
print('WEAPONS_REPORT ' + json.dumps(report))
