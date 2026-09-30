// Offline bake of every crown's underside, read by world placement so crowns
// stay clear of walking height (src/shared/vegetation-crowns.ts). Run after
// editing a tree, palm or banana template:
//   npx tsx scripts/generate-crown-profiles.ts
// tests/vegetation-crowns.test.ts fails when a template no longer fits its profile.
import { writeFileSync } from 'node:fs';
import { crownProfileOf, CROWN_BAND, CROWN_SPECIES } from '../src/render/vegetation/crown-profile';

const profiles = Object.fromEntries(CROWN_SPECIES.map(species => [species, crownProfileOf(species)]));
writeFileSync('src/shared/vegetation-crowns.json', JSON.stringify({ band: CROWN_BAND, profiles }) + '\n');
for (const [species, variants] of Object.entries(profiles))
  console.log(species.padEnd(11), variants.map(v => v.map(([low, high]) => `${low.toFixed(1)}-${high.toFixed(1)}`).join(' ')).join(' | '));
