"""
Implant-system specific Indications & Features — server-side mirror of the
frontend constants/implantIndications.ts, used to enrich the AI "Explain
Recommendation" prompt so the LLM grounds its rationale in the institution's
own clinical guidance instead of generic literature.

Sourced verbatim from the institutional "Implant Specific Indications" Word
doc (Feb 2026). Keys are normalised against `${brand} ${system}` lower-case
so dropdown labels and stored implant rows resolve to the same entry.
"""

from __future__ import annotations
import re
from typing import Optional, Dict


def key_of(brand: Optional[str], system: Optional[str]) -> str:
    raw = f"{brand or ''} {system or ''}".lower()
    raw = re.sub(r"[\u2013\u2014]", "-", raw)
    raw = re.sub(r"[^a-z0-9& ]+", " ", raw)
    raw = re.sub(r"\s+", " ", raw).strip()
    return raw


IMPLANT_SYSTEM_DETAILS: Dict[str, Dict[str, str]] = {
    "neodent drive gm acqua": {"indications": "D3 and D4 bone types. Immediate implant placement.", "features": "Grand Morse Connection. SLA surface treatment. Tapered body, square threads. Reverse cutting chambers. Double thread. Hydrophilic surface. Aggressive design for soft bone."},
    "neodent drive gm neoporous": {"indications": "D3 and D4 bone types. Immediate implant placement.", "features": "Grand Morse Connection. Acid-etched surface. Tapered body, square threads, reverse cutting chambers, double thread. Acqua hydrophilic surface. Aggressive design for soft bone."},
    "neodent helix gm acqua": {"indications": "D1, D2, D3, and D4 bone types. Immediate implant placement.", "features": "Grand Morse Connection. SLA surface treatment. Full dual tapered implant. Hybrid contour with a cylindrical coronal part and conical on apical area. Active apex including a soft, rounded, small tip and helicoidal flutes. Dynamic progressive thread design. Double-threaded implant."},
    "neodent helix gm neoporous": {"indications": "D1, D2, D3, and D4 bone types. Immediate implant placement.", "features": "Grand Morse Connection. Acid-etched surface. Full dual tapered implant. Hybrid contour with a cylindrical coronal part and conical on the apical area. Active apex including a soft, rounded, small tip and helicoidal flutes. Dynamic progressive thread design. Double-threaded implant."},
    "neodent titamax gm acqua": {"indications": "D1 and D2 bone types. Implant Placement with Guided Bone Regeneration.", "features": "SLA surface treatment. Grand Morse Connection. Cylindrical implant (parallel walls). V-shape threads, double-threaded implant, self-tapping apex."},
    "neodent titamax gm neoporous": {"indications": "D1 and D2 bone types. Implant Placement with Guided Bone Regeneration areas.", "features": "Acid-etched surface. Grand Morse Connection. Cylindrical implant (parallel walls). V-shape threads, double-threaded implant, self-tapping apex."},
    "nobel biocare nobelactive np": {"indications": "Conventional and immediate implant placement in 11, 12, 21, 22, 31, 32, 41, 42. Narrow edentulous ridges. Reduced mesiodistal spaces. Sites requiring minimal osteotomy expansion. Soft bone requiring enhanced primary stability.", "features": "Tapered Bone-Compacting Macrodesign produces lateral bone compression during insertion. Progressive Thread Design enhances apical anchorage. Apical Cutting Chambers facilitate self-drilling. Narrow Platform Prosthetic Interface. Internal Conical Connection for joint stability and crestal bone preservation. TiUnite Surface."},
    "nobel biocare nobel active rp": {"indications": "D3, D4 bone types. Immediate implant placement for 11, 12, 13, 14, 21, 22, 23, 24.", "features": "Universal diameter platform. Enhanced load distribution. Broad prosthetic compatibility for crowns, bridges, ASC restorations, multi-unit prosthetics, and digital workflows."},
    "nobel biocare nobelactive wp": {"indications": "Conventional and immediate implant placement in 16, 17, 26, 27, 36, 37, 46, 47. Wide ridges. Bruxism / high occlusal force cases.", "features": "Wide-Diameter Platform. High Insertion Stability in posterior sites. Improved Emergence for molar restorations. Greater resistance to bending forces."},
    "nobel biocare nobel parallel np": {"indications": "D1, D2, D3, D4 bone types. 12, 22, 31, 32, 41, 42 regions. Narrow ridge. Delayed loading.", "features": "Parallel-Walled body. Tapered apex. Full-Length threading. Narrow prosthetic platform. Straightforward drilling protocol."},
    "nobel biocare nobelparallel rp": {"indications": "D1, D2, D3, D4 bone types. Single Unit. Multi-unit Bridge Restorations. Full arch rehabilitations — All on 4, All on 6, All on X.", "features": "Universal standard diameter. Conical connection with hexagonal interlock. Compatible with ASC abutments, CAD/CAM, multi-unit systems and guided surgery. Predictable insertion without excessive bone compression."},
    "nobel biocare nobelparallel wp": {"indications": "Indicated for 36, 37, 46, 47, wide ridges, three-unit bridge.", "features": "Wide platform posterior design. Increased functional surface area. Improved prosthetic emergence profile. Strong connection mechanics."},
    "biohorizons tapered pro": {"indications": "Single-tooth replacement, fixed bridges, full-arch rehabilitation, immediate implant placement, immediate loading, delayed placement.", "features": "Anatomically tapered body. Deep buttress threads. Self-tapping cutting flutes. Laser-Lok collar. Platform-switched reduced collar. Conical internal hex connection."},
    "biohorizons tapered pro conical rbt": {"indications": "D1-D4 bone types. Single tooth replacement. Multi-unit bridge. Immediate placement. All on 4, All on 6, All on X.", "features": "7.5° deep conical connection. 6-cam indexing. Tapered body. Aggressive deep buttress threads. Self-tapping apical flutes. Laser-Lok collar. Platform switching. Single prosthetic platform."},
    "biohorizons tapered short conical rbt": {"indications": "Compromised bone height of 9-10 mm. Single conventional implant placement. Multi-unit bridge.", "features": "Short implant design (6.0 mm / 7.5 mm). Tapered body. Aggressive thread profile. Deep internal conical connection. Platform-switching. Laser-Lok collar with RBT body surface. Reduced/conventional drilling protocols."},
    "biohorizons tapered im": {"indications": "Immediate molar implant placement in 16, 17, 26, 27, 36, 37, 46, 47. Wide posterior ridges. High occlusal load posterior zones.", "features": "Large-diameter design for fresh molar sockets. Aggressive buttress threads. Narrow collar. Platform-switching. Laser-Lok surface."},
    "biohorizons tapered short": {"indications": "Indicated for 8-10 mm bone height in 16, 17, 26, 27, 36, 37, 46, 47.", "features": "Short length design (6.0/7.5 mm). Tapered body + aggressive thread profile. Platform-switched Laser-Lok collar. Compatible with fully guided surgery."},
    "biohorizons narrow diameter": {"indications": "Indicated for 12, 22, 31, 32, 33, 41, 42, 43 with narrow spaces.", "features": "Reduced diameter for limited mesiodistal/ridge width. Tapered body with buttress threads. Laser-Lok surface."},
    "conelog progressive line": {"indications": "Single-tooth, fixed bridges, full-arch rehabilitation, immediate placement, immediate loading, delayed placement, limited bone height.", "features": "Deep internal conical connection. Integrated platform switching. Bone-level design. Tapered body. Buttress + coronal anchoring threads. Promote/Promote Plus surface. 3.3 mm narrow option, 7 mm short option."},
    "bredent mini 2 sky": {"indications": "Narrow ridge — 3 to 4 mm bone width in 31, 32, 41, 42 regions.", "features": "Reduced diameter. 5° rotation-locked conical connection. Three-stage functional design. Hydrophilic ocs surface."},
    "bredent copa sky": {"indications": "Indicated in 35-37, 45-47 with 6-8 mm of bone height (compromised height).", "features": "Short, wide-body implant. Tissue-level restorative concept. Two prosthetic shoulder options (F05/F15)."},
    "bredent narrow sky": {"indications": "Narrow ridges with 4-5 mm bone width in 12, 22, 31, 32, 41, 42 regions.", "features": "Reduced diameter. SKY prosthetic platform compatibility. Atraumatic placement and primary stability."},
    "bredent blue sky": {"indications": "Conventional and immediate placement. Single crowns, bridges, full-arch. Soft to medium density bone.", "features": "Root-form with tapered macrodesign. Aggressive thread geometry. Osseo Connect Surface (ocs hydrophilic). Internal conical connection."},
    "bredent sky classic": {"indications": "D1, D2 bone types. Conventional single placement. Multi-unit bridges.", "features": "Cylindrical parallel-wall design. Conventional implant geometry. Shared prosthetic ecosystem with BlueSky platform."},
    "b&b dental ev line": {"indications": "D3 and D4 bone. Immediate implants with immediate loading. Sites requiring bone condensation and high primary stability.", "features": "Self-tapping double-thread design. High insertion torque with osteocondensation. Penetrating apical tip. Reverse taper collar with annular microsplines. Morse taper + internal hex connection."},
    "b&b dental 3p": {"indications": "D1 and D2 bone types.", "features": "Triple-thread spiral with 60° bevelled profile. Rounded bone-friendly apex. Increased BIC surface. Collar micro-threading. Morse taper + internal hex connection."},
    "b&b dental 3p long": {"indications": "Indicated for Pterygoid Implant.", "features": ""},
    "b&b dental wide line": {"indications": "Indicated for immediate extraction in 16, 17, 26, 27, 36, 37, 46, 47. Indicated when adequate bone width is available with limited bone height.", "features": "Wide diameter body (5.5-6.0 mm). Parallel-taper macrodesign. Triple-thread spiral. Bone-friendly rounded apex. Reverse taper collar."},
    "b&b dental dura-vit slim": {"indications": "Indicated for narrow ridge — 4-5 mm bone width. 31, 32, 33, 41, 42, 43 regions.", "features": "Reduced diameter (Ø3.0/Ø3.4). Conical-hex connection. High prosthetic stability. Self-tapping double/triple-thread options."},
}


def get_details(brand: Optional[str], system: Optional[str]) -> Optional[Dict[str, str]]:
    """Fuzzy prefix-match against the dropdown label so storage variants resolve."""
    if not brand and not system:
        return None
    k = key_of(brand, system)
    if k in IMPLANT_SYSTEM_DETAILS:
        return IMPLANT_SYSTEM_DETAILS[k]
    for key, val in IMPLANT_SYSTEM_DETAILS.items():
        if k.startswith(key) or key.startswith(k):
            return val
    return None
