import "server-only";
import sharp from "sharp";
import { MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS } from "./limits";
export async function validateImage(
  bytes: Uint8Array,
  mime: string,
  expectedSize: number,
) {
  if (
    !["image/jpeg", "image/png"].includes(mime) ||
    !bytes.length ||
    bytes.length > MAX_IMAGE_BYTES ||
    bytes.length !== expectedSize
  )
    throw new Error("Invalid image");
  const image = sharp(bytes, {
    limitInputPixels: MAX_IMAGE_PIXELS,
    failOn: "warning",
  });
  const metadata = await image.metadata();
  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width * metadata.height > MAX_IMAGE_PIXELS ||
    (metadata.pages ?? 1) > 1 ||
    (mime === "image/jpeg"
      ? metadata.format !== "jpeg"
      : metadata.format !== "png")
  )
    throw new Error("Invalid image");
  // Decode the pixels as well: a valid header alone does not prove a complete image.
  await image.stats();
  return { width: metadata.width, height: metadata.height };
}
