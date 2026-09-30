"""Lets Blender-side modules (paw_sculpt.py) import in Blender's bundled python without bpy.

Only the geometry helpers are used there (digit tables and frames), so a small
Vector with the operations those helpers need is enough. Inside Blender this
module does nothing.
"""
import math
import sys
import types


def install():
    try:
        import bpy  # noqa: F401
        return False
    except ImportError:
        pass
    sys.path.insert(0, '/Applications/Blender.app/Contents/Resources/5.0/python/lib/python3.11/site-packages')

    class Vector:
        __slots__ = ('v',)

        def __init__(self, v=(0.0, 0.0, 0.0)):
            self.v = [float(x) for x in v]

        x = property(lambda s: s.v[0], lambda s, a: s.v.__setitem__(0, a))
        y = property(lambda s: s.v[1], lambda s, a: s.v.__setitem__(1, a))
        z = property(lambda s: s.v[2], lambda s, a: s.v.__setitem__(2, a))

        def __iter__(self): return iter(self.v)
        def __len__(self): return 3
        def __getitem__(self, i): return self.v[i]
        def __add__(self, o): return Vector([a + b for a, b in zip(self.v, o)])
        def __sub__(self, o): return Vector([a - b for a, b in zip(self.v, o)])
        def __neg__(self): return Vector([-a for a in self.v])
        def __mul__(self, k): return Vector([a * k for a in self.v])
        __rmul__ = __mul__
        def __truediv__(self, k): return Vector([a / k for a in self.v])
        def dot(self, o): return sum(a * b for a, b in zip(self.v, o))
        def cross(self, o):
            a, b = self.v, list(o)
            return Vector((a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]))
        @property
        def length(self): return math.sqrt(self.dot(self))
        def normalized(self): return self / (self.length or 1.0)
        def normalize(self): self.v = self.normalized().v
        def negate(self): self.v = [-a for a in self.v]
        def copy(self): return Vector(self.v)
        def __repr__(self): return f'Vector({self.v})'

    mathutils = types.ModuleType('mathutils')
    mathutils.Vector = Vector
    mathutils.Matrix = type('Matrix', (), {})
    sys.modules['mathutils'] = mathutils
    for name in ('bpy', 'bmesh'):
        sys.modules[name] = types.ModuleType(name)
    return True
