/** Pre-generated variants; the master/variant list is scripts/image-variants.json. */
export function imageVariant(src: string, width: number): string {
  return src.replace(/\.jpg$/, `-${width}.jpg`);
}

export function imageSrcSet(
  src: string,
  widths: number[],
  nativeWidth: number,
): string {
  const variants = widths.map((width) => `${imageVariant(src, width)} ${width}w`);
  return [...variants, `${src} ${nativeWidth}w`].join(", ");
}
