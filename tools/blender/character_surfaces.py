"""Shared tiled PBR surfaces for the playable capybara and its viewmodel.

Vertex colour carries the authored palette and team mask; these UV maps add
fine fur, canvas, leather and metal response without duplicating character
textures for each player or LOD. All detail is deterministic and buildable.
"""
import bpy
import math
import numpy as np
from mathutils import Vector

FUR, PAW, CLOTH, CANVAS, LEATHER, METAL, NAIL, EYE = range(8)


def _blur(a, rounds=1):
    for _ in range(rounds):
        a = (a * 4 + np.roll(a, 1, 0) + np.roll(a, -1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 1)) / 8
    return a


def make_material(name, directory, size=2048):
    """A 4x2 surface atlas, with padded tiles and real tangent-space relief."""
    directory.mkdir(parents=True, exist_ok=True)
    w, h = size // 4, size // 2
    rng = np.random.default_rng(82109)
    color = np.ones((size, size, 3), np.float32)
    normal = np.empty_like(color); normal[:] = (.5, .5, 1)
    orm = np.empty_like(color); orm[:] = (1, .8, 0)
    yy, xx = np.mgrid[:h, :w].astype(np.float32)
    for kind in range(8):
        noise = rng.random((h, w), dtype=np.float32)
        broad = _blur(noise, 20)
        if kind == FUR:
            # Short staggered fibres, not continuous stripes down the arm.
            shafts = rng.random((h // 16, w), dtype=np.float32)
            shafts = np.repeat(shafts, 16, axis=0)
            for _ in range(8):
                shafts = (shafts * 2 + np.roll(shafts, 1, 0) + np.roll(shafts, -1, 0)) / 4
            flow = np.sin(xx * 1.9 + np.sin(yy * .065) * 1.1 + broad * 2)
            height = shafts * .65 + flow * .12 + noise * .08
            tone = .82 + shafts * .29 + flow * .025
            rough, metal, strength = .86 + noise * .1, 0, .45
        elif kind in (CLOTH, CANVAS):
            weave = np.sin(xx * math.pi / 2) * np.sin(yy * math.pi / 2)
            height = weave * .18 + noise * .10 + broad * .15
            tone = .89 + weave * .055 + noise * .07
            rough, metal, strength = .84 + noise * .12, 0, .3
        elif kind in (PAW, LEATHER):
            pores = _blur(noise, 1)
            grain = np.sin(xx * .20 + np.sin(yy * .09)) * np.sin(yy * .17)
            height = pores * .5 + grain * .08
            tone = .90 + pores * .14 + grain * .035
            rough, metal, strength = .64 + pores * .20, 0, .42
        else:
            height = _blur(noise, 1) * .08
            tone = .96 + noise * .04
            rough = (.34 if kind == METAL else .40 if kind == NAIL else .13) + noise * .035
            metal, strength = (1 if kind == METAL else 0), .1
        gy, gx = np.gradient(height)
        n = np.stack([-gx * strength, -gy * strength, np.ones_like(height)], -1)
        n /= np.linalg.norm(n, axis=2, keepdims=True)
        row, col = kind // 4, kind % 4
        ys, xs = slice(row * h, (row + 1) * h), slice(col * w, (col + 1) * w)
        color[ys, xs] = np.clip(tone[..., None], 0, 1)
        normal[ys, xs] = n * .5 + .5
        orm[ys, xs, 1] = rough
        orm[ys, xs, 2] = metal

    def image(suffix, pixels, data=False):
        img = bpy.data.images.new(name + '_' + suffix, width=size, height=size, alpha=False)
        if data:
            img.colorspace_settings.name = 'Non-Color'
        rgba = np.concatenate((pixels, np.ones((size, size, 1), np.float32)), axis=2)
        img.pixels.foreach_set(rgba.astype(np.float32).ravel())
        img.filepath_raw = str(directory / (name + '_' + suffix + '.png'))
        img.file_format = 'PNG'; img.save()
        return img

    m = bpy.data.materials.new(name); m.use_nodes = True
    m['capySurfaceAtlas'] = True
    nt = m.node_tree; bsdf = nt.nodes.get('Principled BSDF')
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = image('detail', color)
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    nt.nodes.active = tex
    relief = nt.nodes.new('ShaderNodeTexImage'); relief.image = image('normal', normal, True)
    mapping = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(relief.outputs['Color'], mapping.inputs['Color'])
    nt.links.new(mapping.outputs['Normal'], bsdf.inputs['Normal'])
    packed = nt.nodes.new('ShaderNodeTexImage'); packed.image = image('orm', orm, True)
    channels = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(packed.outputs['Color'], channels.inputs['Color'])
    nt.links.new(channels.outputs['Green'], bsdf.inputs['Roughness'])
    nt.links.new(channels.outputs['Blue'], bsdf.inputs['Metallic'])
    return m


def map_surfaces(mesh, classes, game_space=False):
    """Box-project centimetre-scale detail into the selected surface tile.

    Each face stays within one padded tile. Skin colour remains continuous
    across UV seams and the fine stochastic relief hides projection joins.
    """
    uv = mesh.uv_layers.get('UVMap') or mesh.uv_layers.new(name='UVMap')
    for face in mesh.polygons:
        kind = classes[face.index] if len(classes) == len(mesh.polygons) else classes[face.vertices[0]]
        coords = []
        n = face.normal
        for vi in face.vertices:
            p = mesh.vertices[vi].co
            if game_space:
                # Blender Z is the character's upright/fibre direction.
                u = p.x if abs(n.y) >= abs(n.x) else p.y
                v = p.z if abs(n.z) < .85 else p.y
            else:
                u = p.x if abs(n.z) >= abs(n.x) else p.z
                v = p.y
            coords.append(Vector((u / .12, v / .24)))
        low = Vector((min(p.x for p in coords), min(p.y for p in coords)))
        shift = Vector((math.floor(low.x), math.floor(low.y)))
        local = [p - shift for p in coords]
        over = Vector((max(0, max(p.x for p in local) - 1), max(0, max(p.y for p in local) - 1)))
        for li, p in zip(face.loop_indices, local):
            p -= over
            u, v = min(.98, max(.02, p.x)), min(.98, max(.02, p.y))
            uv.data[li].uv = ((kind % 4 + u) / 4, (kind // 4 + v) / 2)
