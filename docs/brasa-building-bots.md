# Authored upper-floor bot access

Source checkpoint for Mapa's matched building gate. Requires the optional
`WorldSpec.buildingRoutes` API from ffbbefc. This patch does not activate routes
or place loot; the matched world supplies both through `buildBuildingRoutes`.

Each simulation caches the authored floor bounds and route lengths. Bots join a
real ground entrance using the existing outdoor navigator, then follow the exact
authored turns and heights with ordinary shared movement. Return trips reverse
the route. If the target disappears during ascent, the bot retraces the visited
stairs. Progress renews the loot timeout; a genuinely blocked route still uses
the existing stuck/ignore rules. Combat continues to take priority over travel.

No collision, ground navigation, weapon, damage, network or balance values change.
Worlds without the optional routes keep the existing behavior. Arena consumers
exclude any authored route that leaves the arena.

Focused evidence on verified rio-7 house geometry: all nine tall-house placements
support bot ascent, actual upstairs M4 collection and descent without jumping or
teleporting. Additional cases cover an outdoor doorway approach, another player
taking the target during ascent, height-aware attachment, and old worlds without
routes. Descent velocity is compared with a player walking the same authored
stairs, allowing one gravity tick for discrete contact timing.

The 12 building-bot tests and four existing reaction, protection, outdoor-loot and
storm-response checks pass with one worker; typecheck passes. The new furniture,
fort and lighthouse geometry must be tested by Mapa on the matched rio-8 tree.
No browser, full suite, build or combined gate has been run for this checkpoint.
