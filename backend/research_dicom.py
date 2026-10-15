"""Research Module — DICOM (.dcm) radiograph import.

Reads a DICOM file with pydicom, renders the pixel data to an 8-bit PNG
(window/level + MONOCHROME1 inversion), and extracts the pixel spacing so
the image is calibrated automatically (quality grade A). Falls back to
grade C (uncalibrated) when the file carries no spacing tags.
"""
from __future__ import annotations

import io
from typing import Optional

import numpy as np
from PIL import Image


def is_dicom(data: bytes, filename: str = "") -> bool:
    return (len(data) > 132 and data[128:132] == b"DICM") or filename.lower().endswith((".dcm", ".dicom"))


def _spacing(ds) -> tuple[Optional[float], Optional[str]]:
    """Return (mm per pixel, source tag). Prefer ImagerPixelSpacing (detector
    plane, intra-oral sensors) over PixelSpacing (calibrated to patient)."""
    for tag in ("ImagerPixelSpacing", "PixelSpacing", "NominalScannedPixelSpacing"):
        val = getattr(ds, tag, None)
        if val is None:
            continue
        try:
            vals = [float(x) for x in (val if isinstance(val, (list, tuple)) or hasattr(val, "__iter__") else [val])]
        except Exception:
            continue
        vals = [v for v in vals if v > 0]
        if vals:
            return sum(vals) / len(vals), tag
    return None, None


def _to_uint8(arr: np.ndarray, ds) -> np.ndarray:
    arr = arr.astype(np.float64)
    slope = float(getattr(ds, "RescaleSlope", 1) or 1)
    intercept = float(getattr(ds, "RescaleIntercept", 0) or 0)
    arr = arr * slope + intercept
    wc, ww = getattr(ds, "WindowCenter", None), getattr(ds, "WindowWidth", None)
    try:
        if wc is not None and ww is not None:
            wc = float(wc[0] if hasattr(wc, "__iter__") and not isinstance(wc, str) else wc)
            ww = float(ww[0] if hasattr(ww, "__iter__") and not isinstance(ww, str) else ww)
            if ww > 0:
                lo, hi = wc - ww / 2, wc + ww / 2
                arr = np.clip(arr, lo, hi)
    except Exception:
        pass
    lo, hi = float(np.nanmin(arr)), float(np.nanmax(arr))
    if hi <= lo:
        return np.zeros(arr.shape, dtype=np.uint8)
    out = ((arr - lo) / (hi - lo) * 255.0).round().astype(np.uint8)
    if str(getattr(ds, "PhotometricInterpretation", "")).upper() == "MONOCHROME1":
        out = 255 - out
    return out


def parse_dicom(data: bytes) -> dict:
    """Returns {png: bytes, width, height, px_per_mm|None, spacing_source, meta}."""
    import pydicom
    ds = pydicom.dcmread(io.BytesIO(data), force=True)
    try:
        arr = ds.pixel_array
    except Exception as ex:  # compressed transfer syntax without a decoder, or no pixel data
        raise ValueError(f"Could not decode DICOM pixel data: {ex}")
    if arr.ndim == 3 and arr.shape[0] > 1 and arr.shape[-1] not in (3, 4):
        arr = arr[0]  # multi-frame → first frame
    if arr.ndim == 3 and arr.shape[-1] in (3, 4):
        img = Image.fromarray(arr[..., :3].astype(np.uint8), "RGB")
    else:
        img = Image.fromarray(_to_uint8(arr, ds), "L")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    mm_per_px, src = _spacing(ds)
    date = str(getattr(ds, "AcquisitionDate", "") or getattr(ds, "ContentDate", "") or getattr(ds, "StudyDate", "") or "")
    acq = f"{date[:4]}-{date[4:6]}-{date[6:8]}" if len(date) == 8 and date.isdigit() else None
    meta = {
        "modality": str(getattr(ds, "Modality", "") or ""),
        "manufacturer": str(getattr(ds, "Manufacturer", "") or ""),
        "model": str(getattr(ds, "ManufacturerModelName", "") or ""),
        "transfer_syntax": str(getattr(getattr(ds, "file_meta", None), "TransferSyntaxUID", "") or ""),
        "bits_stored": int(getattr(ds, "BitsStored", 0) or 0),
        "photometric": str(getattr(ds, "PhotometricInterpretation", "") or ""),
        "rows": int(getattr(ds, "Rows", img.height) or img.height), "columns": int(getattr(ds, "Columns", img.width) or img.width),
        "mm_per_pixel": round(mm_per_px, 5) if mm_per_px else None,
    }
    return {"png": buf.getvalue(), "width": img.width, "height": img.height,
            "px_per_mm": round(1.0 / mm_per_px, 4) if mm_per_px else None, "spacing_source": src,
            "acquisition_date": acq, "meta": meta}
