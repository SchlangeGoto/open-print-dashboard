import manifest from "../scripts/image-variants.json";

type ImageEntry = {
  file: string;
  width: number;
  variants: number[];
};

const entries = new Map<string, ImageEntry>(
  (manifest.masters as ImageEntry[]).map((entry) => [entry.file, entry]),
);

function entryFor(src: string): ImageEntry | undefined {
  return entries.get(src.split("/").pop() ?? src);
}

/** Width of the first generated variant, or undefined when unlisted. */
export function imageMobileVariantWidth(src: string): number | undefined {
  return entryFor(src)?.variants[0];
}

export function imageVariant(src: string, width: number): string {
  return src.replace(/\.jpg$/, `-${width}.jpg`);
}

export function imageSrcSet(
  src: string,
  widths?: number[],
  nativeWidth?: number,
): string {
  const entry = entryFor(src);
  const candidates = (widths ?? entry?.variants ?? []).map(
    (width) => `${imageVariant(src, width)} ${width}w`,
  );
  const native = nativeWidth ?? entry?.width;
  candidates.push(native ? `${src} ${native}w` : src);
  return candidates.join(", ");
}
