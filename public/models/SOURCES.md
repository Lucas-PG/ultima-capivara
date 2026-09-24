# Model sources and license

The `service-pistol` glTF, binary geometry, and three 1K PBR textures are the original [Service Pistol by Mateusz Sadek on Poly Haven](https://polyhaven.com/a/service_pistol), released under [CC0 1.0](https://polyhaven.com/license). They are bundled locally; the game does not call Poly Haven at runtime.

The source scene includes two display variants and loose props. The game loads variant A with the wood grip, its matching slide, hammer and trigger, and one loaded magazine. The blue-tape variant and loose props remain in the source bundle for provenance but are not added to the rendered scene.

The `m700` FBX is from [Free Sniper Rifle M700 CC0 by Stein Games](https://stein-indie.itch.io/m700), also released under CC0 1.0. The original skeletal FBX is bundled unchanged. Its 2048 px color, normal, and packed MAOR textures were resized to 1024 px WebP. Per the creator's channel specification, metallic comes from red, ambient occlusion from green, and roughness is the inverse of blue. The DirectX normal map uses an inverted green channel at runtime.
