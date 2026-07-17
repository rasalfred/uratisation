from pathlib import Path
import sys

from PIL import Image


def crop_visible(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value > 8 else 0).getbbox()
    if bbox is None:
        raise ValueError("Aucun pixel visible dans la moitié de planche.")

    left, top, right, bottom = bbox
    padding = max(8, round(max(right - left, bottom - top) * 0.035))
    return image.crop((
        max(0, left - padding),
        max(0, top - padding),
        min(image.width, right + padding),
        min(image.height, bottom + padding),
    ))


def split_sheet(path: Path) -> None:
    sheet = Image.open(path).convert("RGBA")
    midpoint = sheet.width // 2
    halves = {
        "base": sheet.crop((0, 0, midpoint, sheet.height)),
        "evolved": sheet.crop((midpoint, 0, sheet.width, sheet.height)),
    }

    for form, half in halves.items():
        output = path.with_name(f"{path.stem}-{form}.png")
        crop_visible(half).save(output, optimize=True)
        print(f"Wrote {output}")


if __name__ == "__main__":
    for argument in sys.argv[1:]:
        split_sheet(Path(argument))
