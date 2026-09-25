# Bundled sound effects

All files in `public/audio/` are local, edited copies of CC0 sounds. They are loaded after the first audio unlock; `src/audio.ts` retains its synthesized effects if a sample is unavailable. No runtime request goes to the source sites.

| Bundled files | Original source | Creator and license | Edits |
| --- | --- | --- | --- |
| `pistol.mp3`, `smg.mp3`, `m4.mp3`, `shotgun.mp3`, `dmr.mp3`, `sniper.mp3` | [The Free Firearm Sound Library](https://opengameart.org/content/the-free-firearm-sound-library), `Prepared SFX Library.7z`: `Walther PPQ/X_39P.wav`, `Carl Gustav M45/G_31P.wav`, `AR-15/D_32P.wav`, `CD/H_21P.wav`, `SKS/U_14P.wav`, `Savage 10 .300 Blackout/T_27P.wav` respectively | Ben Jaszczak, Brian Nelson, Kevin Heras, and Matthew Nanney; [CC0](https://creativecommons.org/publicdomain/zero/1.0/). The library's authors explicitly release their recordings under CC0 on the linked page. | One near-distance shot cropped from each source recording, low cut at 55 Hz, short tail fade, mono 24 kHz MP3 at 64 kb/s. These are recordings of the named source firearms and represent the game's weapon classes, not exact matches for every fictional weapon. |
| `footstep-0.mp3` through `footstep-5.mp3` | [Kenney RPG Audio](https://kenney.nl/assets/rpg-audio), `kenney_rpg-audio.zip`: `Audio/footstep00.ogg` through `Audio/footstep05.ogg` | Kenney Vleugels; CC0, stated both on the asset page and in its bundled `License.txt`. | Converted to mono 24 kHz MP3 at 56 kb/s. |
| `reload-mag.mp3`, `reload-shell.mp3` | [Gun Reload Sound Effects](https://opengameart.org/content/gun-reload-sound-effects): `clipload2.wav`, `singlebullet1.wav` | Brian MacIntosh (BMacZero); CC0 on the linked page. | Converted to mono 24 kHz MP3 at 64 kb/s. |

The complete bundled bank is 69,137 bytes. Gunshots retain the game's HRTF distance positioning and effects/master volume controls; the master compressor and per-voice gains cap playback level.

## Original synthesized sounds in M1a

The hurt, spot, and elimination capybara chirps and the in-match music bed are original sounds synthesized at runtime in `src/audio.ts`. They use Web Audio oscillators with short envelopes and no recorded voice or third-party asset. Each actor may start at most one chirp every two seconds; at most six remote spatial chirps may overlap. A continuous sighting emits one spot chirp when an opponent enters the visible set.

The in-match bed uses sparse pitched tones on the music bus. Its peak gain is 0.009 for the root and 0.006 for the upper note before the music setting, below local weapon voices on the effects bus. Shots within 35 m and damage halve the bed gain (about 6 dB) until two seconds after combat, then release it smoothly. The limiter remains after the master bus. Recommended settings are master 0.8, effects 0.85, ambience 0.45, and music 0.25.
