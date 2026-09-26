"""Hero district furnishings and landmarks, using the shared solid primitives."""
import math


def extend(Piece, building, roof, window):
    building('house_medium', 9, 7, color=3)
    building('warehouse', 14, 10, color=0, roof_tile=8)
    p = Piece('fort_gate', 10, 3)
    for x in [-3.5, 3.5]:
        p.box(x, 2.7, 0, 3, 5.4, 3, 6, True, bevel=.10)
        for y in [.25, 4.9, 5.5]:
            p.box(x, y, 0, 3.2, .24, 3.2, 14, True, bevel=.06)
        for dx in [-.9, .9]:
            p.box(x + dx, 6.0, -.95, .7, .9, .6, 6, True, bevel=.06)
    p.box(0, 4.75, 0, 4, 1.3, 3, 6, True, bevel=.08)
    p.box(0, 5.5, 0, 4, .24, 3.2, 14, True)
    for side in [-1, 1]:
        # Open timber gate leaves rest against the inner side of each pier.
        p.box(side * 2.03, 1.65, 1.3, .13, 3.3, 2.5, 7, True, 'wood')
        for yy in [.6, 2.2, 3.0]:
            p.box(side * 1.93, yy, 1.3, .07, .14, 2.4, 9, detail=True)
    p = Piece('lighthouse', 7, 7)
    p.cylinder(0, .20, 0, 3.25, .40, 14, True, sides=32)
    for i in range(6):
        r = 2.5 - i * .15
        p.cylinder(0, .40 + (i + .5) * 1.75, 0, r, 1.75, 0 if i % 2 == 0 else 1, True, sides=32)
        p.cylinder(0, .40 + i * 1.75, 0, r + .08, .13, 15, sides=32)
    p.cylinder(0, 11.0, 0, 2.25, .30, 14, True, sides=32)
    p.cylinder(0, 12.1, 0, 1.40, 2.0, 10, True, sides=16)
    for i in range(12):
        a = math.tau * i / 12
        x, z = math.sin(a), math.cos(a)
        p.cylinder(x * 2.05, 11.58, z * 2.05, .045, 1.0, 9, sides=8)
        p.beam((x * 1.42, 11.1, z * 1.42), (x * 1.42, 13.1, z * 1.42), .10, 15)
        b = math.tau * (i + 1) / 12
        p.beam((x * 2.05, 12.07, z * 2.05), (math.sin(b) * 2.05, 12.07, math.cos(b) * 2.05), .075, 9)
    p.cylinder(0, 13.2, 0, 1.85, .22, 15, sides=24)
    p.cylinder(0, 13.9, 0, 1.92, 1.3, 4, top=.12, sides=24)
    p.orb(0, 14.6, 0, .24, .28, .24, 3, False)
    p.box(0, 1.7, 2.49, 1.35, 2.5, .10, 7, bevel=.06)
    for xx in [-.77, .77]:
        p.box(xx, 1.7, 2.52, .14, 2.8, .18, 15)
    p.box(0, 3.13, 2.50, 1.68, .18, .20, 15)
    for i in range(4):
        y, r = 4.0 + i * 1.9, 2.2 - i * .16
        p.box(0, y, r, .55, 1.0, .1, 10)
        for xx in [-.35, .35]:
            p.box(xx, y, r + .03, .1, 1.2, .14, 15)
        for yy in [-.56, .56]:
            p.box(0, y + yy, r + .03, .8, .1, .14, 15)

    p = Piece('beach_kiosk', 6.8, 5.8)
    p.box(0, .14, 0, 6.4, .28, 5.4, 5, True, 'wood')
    for x in [-2.9, 2.9]:
        for z in [-2.4, 2.4]:
            p.box(x, 1.75, z, .24, 3.5, .24, 5, True, 'wood')
            p.beam((x, 2.8, z), (x - math.copysign(.65, x), 3.4, z), .14, 7)
    roof(p, 6.8, 5.8, 3.5, 1.0)
    for x in [-2.65, 2.65]:
        p.box(x, .92, 0, .56, 1.28, 4.5, 2, True, 'wood')
        p.box(x, 1.62, 0, .92, .16, 4.7, 5, True, 'wood')
        for z in [-1.7, -.8, .1, 1.0, 1.9]:
            p.box(x - math.copysign(.31, x), .95, z, .05, .92, .05, 15, detail=True)
    # Four colourful stools flank the serving counters, away from the central aisle.
    for x in [-3.5, 3.5]:
        for z in [-1.2, 1.2]:
            p.cylinder(x, .55, z, .13, 1.1, 7, True, 'wood', sides=8)
            p.cylinder(x, 1.12, z, .36, .16, 1, True, 'wood', sides=16)
    p.box(0, 2.92, 2.6, 2.45, .66, .14, 8, bevel=.09)
    # Small carved sun mark instead of text, original and legible from a distance.
    p.orb(0, 2.92, 2.72, .40, .40, .04, 3, False)
    for i in range(8):
        a = math.tau * i / 8
        p.beam((math.cos(a) * .27, 2.92 + math.sin(a) * .27, 2.73), (math.cos(a) * .37, 2.92 + math.sin(a) * .37, 2.73), .035, 3, detail=True)

    p = Piece('fountain', 5.4, 5.4)
    p.cylinder(0, .10, 0, 2.7, .20, 14, True, sides=40)
    p.cylinder(0, .35, 0, 2.48, .5, 6, True, sides=40)
    p.cylinder(0, .62, 0, 2.55, .20, 15, True, sides=40)
    p.cylinder(0, .735, 0, 2.25, .05, 2, sides=40)
    p.cylinder(0, 1.2, 0, .48, 1.0, 14, True, sides=24)
    p.cylinder(0, 1.76, 0, .68, .16, 15, True, sides=24)
    p.cylinder(0, 2.04, 0, 1.18, .42, 14, top=.86, sides=32)
    p.cylinder(0, 2.29, 0, 1.20, .15, 15, sides=32)
    p.cylinder(0, 2.39, 0, 1.08, .03, 2, sides=32)
    p.cylinder(0, 2.72, 0, .15, .7, 15, sides=16)
    p.orb(0, 3.09, 0, .35, .45, .35, 2, False)
    for i in range(8):
        a = math.tau * i / 8
        for j in range(6):
            t = j / 5
            r, y = .72 + 1.22 * t, 2.36 - 1.56 * t * t
            p.orb(math.sin(a) * r, y, math.cos(a) * r, .06, .12, .06, 2)
        p.orb(math.sin(a) * 1.94, .78, math.cos(a) * 1.94, .32, .025, .32, 11)

    p = Piece('river_wall', 8, 1.2)
    p.box(0, 1.1, 0, 8, 2.2, 1.0, 6, True, bevel=.09)
    p.box(0, 2.22, 0, 8.2, .24, 1.2, 14, True)
    for x in [-3.6, 0, 3.6]:
        p.box(x, .95, .54, .65, 1.9, .20, 14)
    p = Piece('river_steps', 4.0, 4.8)
    for i in range(12):
        top = .18 * (i + 1)
        p.box(0, top / 2, -2.4 + (i + .5) * .4, 4, top, .4, 6, True, bevel=.025)
        p.box(0, top + .025, -2.4 + (i + .5) * .4, 4.08, .05, .39, 14)
    for x in [-2.12, 2.12]:
        for i in range(4):
            p.box(x, .9 + .54 * i, -2.2 + 1.2 * i, .2, 1.15, .2, 15, True)
        p.beam((x, 1.48, -2.35), (x, 3.25, 2.3), .12, 5)
    p = Piece('fence', 4, .45)
    for x in [-1.85, 1.85]:
        p.box(x, .88, 0, .20, 1.76, .20, 15, True, 'wood')
        p.orb(x, 1.82, 0, .27, .22, .27, 15, False)
    for y in [.57, 1.30]:
        p.box(0, y, 0, 3.8, .13, .12, 5, True, 'wood')
    for i in range(12):
        x = (i - 5.5) * .31
        p.box(x, .90, .06, .12, 1.35, .10, 15, True, 'wood', bevel=.028)
    p = Piece('fence_gate', 4, 2.3)
    for side in [-1, 1]:
        p.box(side * 1.45, 1.0, 0, .3, 2, .3, 15, True, 'wood')
        p.orb(side * 1.45, 2.12, 0, .39, .3, .39, 15, False)
        for y in [.4, 1.3]:
            p.box(side * 1.35, y, .78, .15, .15, 1.55, 5, True, 'wood')
        for i in range(5):
            p.box(side * 1.35, .88, i * .30 + .12, .10, 1.4, .15, 15, True, 'wood')
    p = Piece('cliff_rock', 7, 7)
    p.orb(0, 2.75, 0, 7, 5.5, 7, 14, False)
    for i in range(8):
        low, high = i * 5.5 / 8, (i + 1) * 5.5 / 8
        extreme = max(abs(low - 2.75), abs(high - 2.75)) / 2.75
        radius = max(.05, 3.48 * math.sqrt(max(0, 1 - extreme * extreme)))
        p.cylinder(0, (low + high) / 2, 0, radius, high - low, 14, True, sides=16)
    for i in range(5):
        a = math.tau * i / 5
        p.orb(math.sin(a) * 2.0, 1.0, math.cos(a) * 2.0, 2.4, 2.0, 2.4, 6, False)

    # Layered formations share visible cylindrical ledges and rounded stone shells.
    # The slab collision comes directly from those same ledges, never a slope wall.
    for name, width, depth, levels in [('cliff_rock_low', 9, 6, 3), ('cliff_rock_tall', 7, 6, 8), ('cliff_ledge', 12, 7, 5)]:
        p = Piece(name, width, depth)
        for level in range(levels):
            y = .48 + level * .88
            w = width * (1 - level / (levels + 3) * .55)
            d = depth * (1 - level / (levels + 4) * .40)
            shift = math.sin(level * 1.7) * .35
            p.box(shift, y, math.cos(level) * .18, w, .96, d, 14 if level % 3 else 6, True, bevel=.18)
            p.orb(shift + w * .20, y + .2, d * .1, w * .65, 1.28, d * .85, 14, False)
            p.orb(shift - w * .30, y + .12, -d * .10, w * .48, 1.18, d * .70, 6, False)
            for chip in range(4):
                x = shift + (chip - 1.5) * w * .20
                p.box(x, y + .46, d / 2 - .10, w * .17, .08, .21, 6, bevel=.025, detail=True)

    p = Piece('boat', 3.4, 7)
    # Hollow plank hull, shaped ribs and thwarts, with a traversable open interior.
    p.box(0, .22, 0, 1.5, .35, 5.2, 7, True, 'wood', bevel=.12)
    for sign in [-1, 1]:
        for i in range(12):
            z = (i - 5.5) * .54
            width = 1.48 * (1 - (abs(z) / 3.6) ** 2)
            p.box(sign * width, .69, z, .19, 1.15, .56, 2 if i % 4 else 15, True, 'wood', bevel=.06)
            p.box(sign * width, 1.29, z, .26, .12, .57, 5, bevel=.04)
        for z in [-2, -.3, 1.4]:
            p.beam((0, .3, z), (sign * 1.25, 1.17, z), .085, 5, detail=True)
    for z in [-1.8, 0, 1.8]:
        p.box(0, .88, z, 2.4, .14, .42, 5, True, 'wood')
    p.box(0, 1.7, .7, .12, 2.8, .12, 7, True, 'wood')
    p.beam((0, 2.8, .7), (1.0, 1.0, -1.9), .035, 11, detail=True)
    p.beam((0, 2.8, .7), (-1.0, 1.0, -1.9), .035, 11, detail=True)
    p.beam((.4, 1.36, -2), (1.2, 1.36, 2.7), .07, 5)
    p.box(1.18, 1.36, 2.5, .34, .05, .78, 5, bevel=.06)

    p = Piece('interior_counter', 2.8, .9)
    p.box(0, .53, 0, 2.6, 1.06, .76, 2, True, 'wood')
    p.box(0, 1.12, 0, 2.8, .14, .9, 5, True, 'wood')
    for x in [-.86, 0, .86]:
        p.box(x, .55, .40, .70, .80, .05, 7, detail=True)
        p.box(x, .55, .44, .58, .67, .025, 2, detail=True)
        p.orb(x + .22, .77, .48, .06, .06, .04, 3)
    for x in [-.7, .7]:
        p.cylinder(x, 1.24, 0, .22, .10, 11, sides=16, detail=True)
        p.orb(x, 1.41, 0, .26, .28, .26, 3)
    p = Piece('bed', 1.6, 2.5)
    p.box(0, .30, 0, 1.55, .28, 2.4, 5, True, 'wood')
    p.box(0, .53, 0, 1.48, .22, 2.28, 11, True, 'wood', bevel=.09)
    p.box(0, .67, -.28, 1.50, .10, 1.65, 2, bevel=.06)
    p.box(0, .76, .79, 1.0, .22, .50, 11, bevel=.095)
    for x in [-.70, .70]:
        for z in [-1.1, 1.1]:
            p.box(x, .3, z, .14, .6, .14, 7, True, 'wood')
    p.box(0, .9, 1.16, 1.57, .65, .12, 5, True, 'wood')
    for x in [-.55, -.27, 0, .27, .55]:
        p.box(x, .97, 1.23, .12, .45, .035, 7, detail=True)

    p = Piece('bench', 2.4, .9)
    for x in [-.85, .85]:
        for z in [-.3, .3]:
            p.box(x, .34, z, .13, .68, .13, 9, True, 'metal')
        p.box(x, .84, -.34, .13, 1.32, .13, 9, True, 'metal')
    for z in [-.28, 0, .28]:
        p.box(0, .71, z, 2.4, .14, .24, 5, True, 'wood')
    for y in [1.02, 1.3]:
        p.box(0, y, -.34, 2.4, .23, .10, 5, True, 'wood')
    for x in [-1.15, 1.15]:
        p.box(x, .95, 0, .13, .12, .90, 9)
    p = Piece('planter', 1.7, 1.7)
    p.cylinder(0, .40, 0, .64, .80, 4, True, sides=16)
    p.cylinder(0, .83, 0, .76, .15, 14, True, sides=16)
    p.cylinder(0, .92, 0, .64, .04, 7, sides=16)
    for i in range(10):
        a = math.tau * i / 10
        p.orb(math.sin(a) * .44, 1.04, math.cos(a) * .44, .52, .5, .52, 12, False)
        p.orb(math.sin(a) * .40, 1.31, math.cos(a) * .4, .18, .16, .18, 1 if i % 2 else 3)
    p = Piece('lamp_post', 1.2, 1.2)
    p.cylinder(0, .14, 0, .4, .28, 6, True, sides=16)
    p.cylinder(0, 1.92, 0, .085, 3.56, 9, True, 'metal', sides=12)
    p.cylinder(0, .5, 0, .18, .55, 9, sides=12)
    for y in [3.3, 4.18]:
        p.box(0, y, 0, .65, .13, .65, 9)
    p.box(0, 3.73, 0, .48, .76, .48, 11)
    for x in [-.26, .26]:
        for z in [-.26, .26]:
            p.box(x, 3.73, z, .06, .85, .06, 9)
    p.cylinder(0, 4.4, 0, .48, .34, 9, top=.04, sides=4)
    p = Piece('market_stall', 3.8, 2.6)
    p.box(0, .48, 0, 3.5, .96, 1.45, 5, True, 'wood')
    p.box(0, 1.04, 0, 3.65, .16, 1.55, 7, True, 'wood')
    for x in [-1.7, 1.7]:
        for z in [-.8, .8]:
            p.box(x, 1.4, z, .14, 2.8, .14, 5, True, 'wood')
    for i in range(12):
        x = (i - 5.5) * .32
        p.box(x, 2.74, 0, .32, .12, 2.6, 11 if i % 2 else 1, bevel=.06)
        p.box(x, 2.5, 1.3, .32, .38, .08, 11 if i % 2 else 1, bevel=.07)
    for x in [-1.12, 0, 1.12]:
        p.box(x, 1.19, 0, .90, .18, 1.18, 5)
        for a in range(3):
            for b in range(4):
                p.orb(x + (a - 1) * .23, 1.38, (b - 1.5) * .24, .22, .24, .22, 3 if x < 0 else 1 if x == 0 else 12)
