import { Crepe, type CrepeConfig } from '@milkdown/crepe';

// ImageBlock writes the image ratio into the alt text, so it stays off (see alt-text.test.ts).
export const crepeFeatures: CrepeConfig['features'] = { [Crepe.Feature.ImageBlock]: false };
