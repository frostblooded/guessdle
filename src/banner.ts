import { bannerOf, type Banner } from "./game/banner.ts";

// The banner as an element: one image for a cover, a grid of decorative tiles for a collage
function bannerElement(banner: NonNullable<Banner>): HTMLElement {
  const image = (src: string): HTMLImageElement => {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.loading = "lazy";
    return img;
  };
  if (banner.kind === "cover") {
    const cover = image(banner.url);
    cover.className = "game-banner";
    return cover;
  }
  const collage = document.createElement("div");
  collage.className = "game-banner game-banner-collage";
  collage.style.setProperty("--banner-columns", String(banner.columns));
  collage.append(...banner.tiles.map(image));
  return collage;
}

// The game's banner from its cover and visible entries' photos, or null for none
export function gameBanner(
  cover: string,
  photos: readonly string[],
): HTMLElement | null {
  const banner = bannerOf(cover, photos);
  return banner && bannerElement(banner);
}
