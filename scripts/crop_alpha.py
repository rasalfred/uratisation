from pathlib import Path
import sys

from PIL import Image


def crop_alpha(source: Path, destination: Path) -> None:
    image = Image.open(source).convert("RGBA")
    bbox = image.getchannel("A").point(lambda value: 255 if value > 8 else 0).getbbox()
    if bbox is None:
        raise ValueError(f"Aucun pixel visible dans {source}.")

    left, top, right, bottom = bbox
    padding = max(10, round(max(right - left, bottom - top) * 0.025))
    cropped = image.crop((
        max(0, left - padding),
        max(0, top - padding),
        min(image.width, right + padding),
        min(image.height, bottom + padding),
    ))
    cropped.save(destination, optimize=True)
    print(f"Wrote {destination}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: crop_alpha.py SOURCE DESTINATION")
    crop_alpha(Path(sys.argv[1]), Path(sys.argv[2]))
