/** Pre-generated responsive variants for the 3200×2000 screenshots. */
export function imageVariant(src: string, width: 1600 | 2400): string {
  return src.replace(/\.jpg$/, `-${width}.jpg`);
}

export function imageSrcSet(src: string): string {
  return `${imageVariant(src, 1600)} 1600w, ${imageVariant(src, 2400)} 2400w, ${src} 3200w`;
}
