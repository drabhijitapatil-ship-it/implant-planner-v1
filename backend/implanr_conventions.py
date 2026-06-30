"""Permanent data conventions baked into Implanr AI and the catalog editor.

These rules are appended to every AI prompt that touches prosthetic
component data so the model never confuses different height measurements
across manufacturers' brochures and never fabricates values.
"""

# Single source of truth — referenced by:
#   • backend/server.py (Ask Implanr prompt + PDF extraction prompt)
#   • frontend/app/admin/implant-catalog-edit.tsx (Cuff height label/hint)
#   • frontend/app/admin/implant-catalog.tsx (detail card label)
DATA_CONVENTIONS_BLOCK: str = """
PERMANENT DATA CONVENTIONS (apply to every answer):

1. Gingival height = Cuff height = Gingival collar height = "GH" (manufacturer abbreviation).
   - Always treat these four terms as identical.
   - This is the height of the transmucosal collar between the implant platform and the prosthetic platform — NOT the total height of the abutment/component.
   - When a brochure lists both "GH" (or "cuff height" or "gingival collar") and "total height" / "overall height" / "abutment height", ONLY the GH / cuff value goes into the gingival_heights_mm field.
   - Common labels in brochures: GH, gingival height, cuff, cuff height, gingival collar, soft-tissue height, transmucosal height. All map to the same field.
2. Diameter values follow the manufacturer's prosthetic-platform diameter (Ø_p), not the implant-body diameter, unless explicitly stated otherwise.
3. Length values for implants are body length (apex to coronal platform) in mm.
4. Angulation values are degrees off-axis; both straight (0°) and angled abutments share the same component "type".
5. Never fabricate a value. If a brochure does not state a measurement, omit that field — do NOT guess from a similar product line.
""".strip()
