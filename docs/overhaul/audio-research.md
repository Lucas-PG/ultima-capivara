# Audio research: how shooters keep combat readable by ear

Research for the 2026-09 audio pass. The question: how do Call of Duty, VALORANT, Apex Legends, Overwatch and Battlefield make gunfire, footsteps and ambience readable, and what does that mean for Ultima Capivara? Each finding ends with what we did about it.

## 1. Every gun needs its own voice, and the voice comes from the mechanism

Infinity Ward's audio director on Modern Warfare (2019) says each weapon "must have its own unique voice", and that the voice comes from how the gun operates: gas piston, direct impingement or bolt action. They recorded weapons with about 90 microphones, including player perspectives (hip fire against aiming), and layered firing, shell ejection and impacts. [Activision blog](https://blog.activision.com/call-of-duty/2019-07/Modern-Warfare-Initial-Intel-Creating-an-Orchestra-of-Incredible-Audio-Effects-Weapon-Sounds-in-Call-of-Duty-Modern-Warfare)

VALORANT's team recorded the mechanical parts too (hammer strikes, magazine releases, firing pins) and made third-person gunfire sound different when a gun fires toward you, to your side or away. [VALORANT dev blog: How the VALORANT Arsenal was built](https://playvalorant.com/en-us/news/dev/how-the-valorant-arsenal-was-built/)

**What we did.** Every gun is built from the same layers (crack or pop, sub blast, low body, a mid "bark" band, the mechanism, an outdoor tail with echoes), tuned per weapon. Mechanisms carry identity: the pistol's slide click, the SMG's fast bolt chatter, the M4's buffer-spring "sproing", the DMR's heavy clack, the revolver's cylinder ring, the shotgun's pump and the sniper's bolt, both timed to the viewmodel's cycle (`weaponShotDuration`). A test requires every pair of guns to differ in timbre or length (`tests/audio-bank.test.ts`, "gives every gun its own voice").

## 2. Distance is a different sound, not the same sound quieter

Modern Warfare applies three location systems to gunfire (reverb and slap delay, atmospheric layers, reflection mapping), and sound travels at the speed of sound, so open spaces boom with echoes while confined spaces sound muffled. [Activision blog](https://blog.activision.com/call-of-duty/2019-07/Modern-Warfare-Initial-Intel-Creating-an-Orchestra-of-Incredible-Audio-Effects-Weapon-Sounds-in-Call-of-Duty-Modern-Warfare). Battlefield 4 added systems that separate nearby events from those that affect the player directly. [MCV: Heard about Battlefield 4](https://mcvuk.com/development-news/heard-about-battlefield-4/)

**What we did.** Each gun has a near report and a baked far version: the crack becomes a dark pop (rifles keep a faint supersonic snap), and a rolling terrain echo of several darker bursts follows for 1.5 to 2.8 s. The engine crossfades near into far between 18 and 70 m, low-passes with distance, delays by distance / 343 m/s beyond 20 m, and uses a gentler rolloff for gunfire (about 4 dB per doubling past 2 m) than for footsteps (6 dB per doubling), so gunfire carries across the island the way it does in real life. Tests: far versions are darker (centroid under 70% of the near version) and longer.

## 3. Footsteps are a threat cue: optimize for being heard

VALORANT's audio director said footsteps are a danger indicator, and that Riot optimizes for making sure footsteps are heard rather than for portraying distance, partly because many players are in loud environments. [The Spike](https://www.thespike.gg/valorant/news/riot-games-believe-operator-isn-t-too-op-and-address-footsteps-audio/399), [Gfinity](https://www.gfinityesports.com/article/valorant-developers-respond-to-broken-audio-claims-pc). Riot recorded every surface consistently because recognizing a surface helps locate the noise. [VALORANT dev blog](https://playvalorant.com/en-us/news/dev/how-the-valorant-arsenal-was-built/)

Apex Legends' Season 27 "Focused Mix" removed squadmate footsteps, made enemy footsteps louder with less difference between jogging and sprinting, lowered the local weapon, and multiband-compressed explosions so enemy footsteps cut through. [EA: Apex Legends audio update](https://www.ea.com/games/apex-legends/news/showdown-audio-update)

Battlefield 4 took player foley out of the HDR mixing system so that "explosions will not cull your footsteps". [MCV](https://mcvuk.com/development-news/heard-about-battlefield-4/)

**What we did.** Footsteps are material-based (grass, dirt, sand, stone, wood, metal, shallow water), two paws per stride (a capybara's soft pad and hoof-like nails), short (every step under 120 ms to -20 dB) and high-passed so almost nothing sits below 200 Hz: a low thud is exactly what distant gunfire sounds like, which was the root of the players' confusion. Enemy steps are 12 dB louder than your own at arm's length, directional (HRTF on High), occluded by walls (-8 dB and a 900 Hz low-pass) and audible to 24 m walking, 32 m sprinting and 8 m crouching. Steps have their own voice pool, so gunfire cannot steal them.

## 4. The mix decides what matters now

Overwatch's team built systems around the biggest threat: each enemy is rated by proximity, whether they are targeting you, the walls between you and the travel time to reach you, and the mix raises the most dangerous ones; sounds become muffled in hiding spots. They cite Walter Murch's "dense clarity, clear density". [PCGamesN](https://pcgamesn.com/overwatch/overwatch-devs-on-creating-a-game-you-can-play-by-sound-and-announcing-dolby-atmos-support), [Tom's Guide](https://www.tomsguide.com/us/overwatch-sound,news-22801.html)

Apex evaluates enemy proximity, line of sight and bullet proximity into a threat value that lowers non-priority sounds and raises key indicators such as enemy footsteps. [EA](https://www.ea.com/games/apex-legends/news/showdown-audio-update)

Frostbite's HDR audio (GDC 2009, Anders Clerwall) maps real-world loudness into a sliding window of living-room loudness and culls quiet sounds under loud ones: "every sound is important, but not at the same time". Loudness is used as priority, a good approximation of importance in shooters. [Frostbite](https://www.ea.com/frostbite/news/how-hdr-audio-makes-battlefield-bad-company-go-boom), [Adaptive mixing in Frostbite (slides)](https://www.slideshare.net/slideshow/adaptive-mixing-in-frostbite/3128152)

**What we did.** A loudness table (`src/sound/mix.ts`) with every buffer normalized to -20 LUFS, so the hierarchy is explicit and testable: your gunfire, enemy gunfire, hit and kill confirms, handling and reloads, enemy footsteps, your own footsteps, ambience. Combat (your shots, shots or damage within 40 m) ducks the ambience about 7 dB and the music about 8 dB; your hit, headshot and kill confirms duck other players' gunfire 6 dB for a quarter second. Near misses crack past your head at the closest point of the bullet's path, like Apex's bullet proximity. Voice pools cap remote gunfire, steps, effects and island life separately, and your own gunfire has its own pool. We did not build a full per-enemy threat score; occlusion, distance and pooling cover the common cases (see the report's known issues).

## 5. Loudness and headroom

Sony's ASWG-R001 (2013) recommends an average of -24 LUFS (plus or minus 2 LU) for console titles, measured over at least 30 minutes of representative play, and Microsoft, Nintendo and the G.A.N.G. followed. [Designing Sound interview with Garry Taylor](https://designingsound.org/2012/07/30/video-games-and-loudness-standards-interview-with-sonys-garry-taylor/), [Audio Media International](https://audiomediainternational.com/mobile-loudness-an-adaptive-approach/)

**What we did.** Measured in Chrome at default sliders, an intense full-auto hunt integrates about -19 to -21 LUFS and idle ambience sits between -40 and -52 LUFS depending on the place, so a whole match lands near the guideline. The master ends in a fast limiter (-8 dBFS threshold, 20:1) and a soft clipper that is linear to 0.7 and can never reach full scale; a test pushes a worst-case pile-up (your shotgun, six rifles at 5 m, a coconut blast, confirms, music and surf) through it.

## 6. Ambience is designed, not a floor

None of the studios above ship a constant hiss; their ambience is layered and positional, and it gets out of the way in combat (Apex lowers non-priority sound under threat; Overwatch muffles hiding spots). The old island bed was the opposite: three white-noise loops two seconds long, filtered and never modulated, which measured as a -55 dBFS floor flat across six octaves in Chrome.

**What we did.** Beds breathe: surf in wave cycles (build, crash, recede with bubble fizz) panned toward the sea, gusting wind that grows with height, leaf flurries that fall to silence, lapping water at the harbour, the waterfall at Cachoeira. Island life arrives as positioned one-shots: bem-te-vi, sabiá, maritacas, doves, cicadas and crickets from real trees, gulls and fish splashes on the coast, sparrows, dogs, bicycle bells, wind chimes and a neighbour's radio in town, a church bell at Capela, the farm and the mill. Under a roof the outdoor beds drop 10 dB and lose their highs.

## Sources

- [Activision: Creating an Orchestra of Incredible Audio Effects: Weapon Sounds in Call of Duty: Modern Warfare](https://blog.activision.com/call-of-duty/2019-07/Modern-Warfare-Initial-Intel-Creating-an-Orchestra-of-Incredible-Audio-Effects-Weapon-Sounds-in-Call-of-Duty-Modern-Warfare)
- [VALORANT: How the VALORANT Arsenal was built](https://playvalorant.com/en-us/news/dev/how-the-valorant-arsenal-was-built/)
- [The Spike: Riot Games address footsteps audio](https://www.thespike.gg/valorant/news/riot-games-believe-operator-isn-t-too-op-and-address-footsteps-audio/399)
- [Gfinity: VALORANT developers respond to broken audio claims](https://www.gfinityesports.com/article/valorant-developers-respond-to-broken-audio-claims-pc)
- [EA: Apex Legends audio update (Focused Mix)](https://www.ea.com/games/apex-legends/news/showdown-audio-update)
- [A Sound Effect: The sound of Apex Legends](https://www.asoundeffect.com/apex-legends-sound/)
- [PCGamesN: Overwatch devs on creating a game you can play by sound](https://pcgamesn.com/overwatch/overwatch-devs-on-creating-a-game-you-can-play-by-sound-and-announcing-dolby-atmos-support)
- [Tom's Guide: How Overwatch's sound design gives you an edge](https://www.tomsguide.com/us/overwatch-sound,news-22801.html)
- [Frostbite: How HDR audio makes Battlefield: Bad Company go BOOM](https://www.ea.com/frostbite/news/how-hdr-audio-makes-battlefield-bad-company-go-boom)
- [Slides: HDR Audio, adaptive mixing in Frostbite](https://www.slideshare.net/slideshow/adaptive-mixing-in-frostbite/3128152)
- [MCV: Heard about Battlefield 4 (Ben Minto)](https://mcvuk.com/development-news/heard-about-battlefield-4/)
- [Designing Sound: Video games and loudness standards, interview with Sony's Garry Taylor](https://designingsound.org/2012/07/30/video-games-and-loudness-standards-interview-with-sonys-garry-taylor/)
- [Audio Media International: Mobile loudness](https://audiomediainternational.com/mobile-loudness-an-adaptive-approach/)
