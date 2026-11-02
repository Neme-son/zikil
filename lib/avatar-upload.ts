/**
 * Avatar image upload validation and formatting (#290, #576).
 *
 * Enforces strict magic-byte detection for raster images (PNG, JPEG, WebP, GIF),
 * rejects scriptable formats (SVG, HTML), and enforces size limits.
 */

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB

export const ALLOWED_AVATAR_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export type AllowedAvatarType = (typeof ALLOWED_AVATAR_TYPES)[number];

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((b, i) => bytes[offset + i] === b);
}

/**
 * Detect image MIME type strictly from the file magic bytes.
 * Returns null if the bytes do not match an allowed raster image type.
 */
export function detectAvatarType(bytes: Uint8Array): AllowedAvatarType | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  // GIF: GIF87a or GIF89a (47 49 46 38)
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) {
    return "image/gif";
  }
  // WebP: RIFF ... WEBP
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  return null;
}

export type AvatarValidationResult =
  | { ok: true; contentType: AllowedAvatarType }
  | { ok: false; error: string };

/**
 * Validate avatar file bytes for size and safe image format.
 */
export function validateAvatarBytes(bytes: Uint8Array): AvatarValidationResult {
  if (!bytes || bytes.byteLength === 0) {
    return { ok: false, error: "Please select an image file." };
  }
  if (bytes.byteLength > MAX_AVATAR_BYTES) {
    return { ok: false, error: "Image must be 2 MB or smaller." };
  }
  const contentType = detectAvatarType(bytes);
  if (!contentType) {
    return { ok: false, error: "Please choose a PNG, JPEG, WebP, or GIF image." };
  }
  return { ok: true, contentType };
}

/**
 * Convert raw image bytes and detected content type into a safe base64 data URL.
 */
export function toAvatarDataUrl(bytes: Uint8Array, contentType: AllowedAvatarType): string {
  const base64 = Buffer.from(bytes).toString("base64");
  return `data:${contentType};base64,${base64}`;
}

