import type { Command } from 'shared';
import type { DecodedImage } from './image';

export interface SavedImage {
  id: string;
  key: string;
  createdAt: number;
}

export const saveImage = async (
  bucket: R2Bucket,
  image: DecodedImage,
  commands: Command[],
  identity: SavedImage,
  requestFingerprint: string,
): Promise<SavedImage> => {
  await bucket.put(identity.key, image.bytes, {
    httpMetadata: { contentType: image.contentType },
    customMetadata: {
      id: identity.id,
      commands: JSON.stringify(commands),
      requestFingerprint,
    },
  });

  return identity;
};
