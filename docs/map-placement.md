# Map placement rules

The Blender kit uses a bottom-centred origin, Y up and +Z frontage. A placed piece faces `(sin(yaw), cos(yaw))` in world X/Z. Always choose a destination for a functional front before choosing its yaw.

- Plaza seats face the fountain. River seats face the bank walk and water. Indoor seats face the room aisle. A facing vector must remain within 45 degrees of its intended view or path.
- House front doors face the street serving their lot. The two opposing doors and the central aisle stay clear. Terrain pads use the rotated footprint. Furniture, shop panels, laundry, planters and flower beds rotate in the same local coordinate system as the house.
- Market stalls face the customer aisle. Beach kiosks face the promenade. Indoor counters face usable room space, with room to stand in front.
- Lamps line the edges of streets and paved courts. They never occupy the walking lane or a hero camera corridor.
- District signs face their closest public approach. Shop signs face the street from brackets on the front corner, clear of window shutters and doors. Murals occupy clear side walls.
- Crates and barrels form working groups beside circulation. Boats align with their dock or the shoreline. Walls and gates preserve visible openings. Landscape rocks follow the slope and planting grows from supported ground.

`tests/world-detail.test.ts` verifies seat, serving-front, sign and door orientation; lamp edges; dry and connected spawn/loot locations; clear building aisles and bridge routes; and the western canopy/undergrowth layers. `tests/world-kit.test.ts` protects the visible collision contract. Decorative foliage has no independent hidden blockers.

After moving or rotating architecture, inspect at walking height, check both exits and update the terrain colour bake if the footprint changes. Compare the plaza and hill frames with `public/assets/cover-v2.png`, then verify the shared host and client checks before reporting a landable hash.

District arrivals use authored landmark approaches in `DISTRICT_ARRIVALS`. The nearest clear spawn must have at least five metres of open view at standing eye height and allow forward movement; an empty collider footprint alone does not make a good arrival. Review captures use the corresponding battle-royale mode and actual supported spawn height.

The western terrace aprons and waterfall slopes receive priority within the existing island budget of 360 trees and 52 scattered cliff formations. Collect slope candidates island-wide before choosing them, so the northern rows cannot consume the whole budget. Keep roads, house exits and footpaths clear; use intermediate crowns below the skyline and bury the source-derived cliff solids into the slope.

Cliff clearance uses the exported collision solids against standing route corridors and house floors. A rock below a raised route is allowed; a rock intruding into the route is rejected. Centre-distance exclusions are too broad for the exposed faces beneath terraces. Waterfall markers describe the lip-to-pool height and yaw; curved streams, inlet foam and spray must rotate together around that marker.

Check exposed cliff faces from their approach as well as from above. A large boulder can pass collision checks while disappearing inside the heightfield; the fort visibility test uses the smaller inscribed solids as a conservative coverage floor. Project the stone toward the visible toe and interlock upper ledges without closing either gate ramp.

River stair exits face uphill from submerged lower treads to a level quay landing. Compute their base from the generated tread-top height and sampled landing height, preserve the opening in the visible quay wall, and test a complete ascent from the riverbed. The shared water sampler uses the same surface at -0.05 m and terrain field as the renderer; deck support belongs to movement.
