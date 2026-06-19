"""Rule-engine primitives: Severity, RuleHit, register_rule, evaluate_case."""
from dataclasses import dataclass, asdict
from enum import Enum
from typing import Callable, Dict, List, Optional, Any
from ._citations import CITATIONS


class Severity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    HARD_BLOCK = "hard_block"


@dataclass
class RuleHit:
    rule_id: str
    severity: Severity
    title: str
    message: str
    citation_id: str
    phase: str          # "phase1" | "phase2" | "phase3" | "phase4" | "cross"
    context: Dict[str, Any]   # field values that triggered (for transparency)

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["severity"] = self.severity.value
        cite = CITATIONS.get(self.citation_id, {})
        d["citation"] = {
            "id": self.citation_id,
            "title": cite.get("title"),
            "source": cite.get("source"),
            "year": cite.get("year"),
            "type": cite.get("type"),
            "takeaway": cite.get("takeaway"),
        }
        return d


# Module-level registry. Rules call register_rule on import.
_RULES: List[Callable[[dict], Optional[RuleHit]]] = []


def register_rule(fn: Callable[[dict], Optional[RuleHit]]):
    _RULES.append(fn)
    return fn


def evaluate_case(procedure: dict) -> List[Dict[str, Any]]:
    """Run every registered rule against a procedure dict. Returns the
    sorted list of fired hits as plain dicts ready for JSON response.
    Sort order: hard_block → warning → info, then by rule_id."""
    hits: List[RuleHit] = []
    for fn in _RULES:
        try:
            hit = fn(procedure)
        except Exception:
            # Never let a single rule failure break the entire engine.
            continue
        if hit is not None:
            hits.append(hit)
    order = {Severity.HARD_BLOCK: 0, Severity.WARNING: 1, Severity.INFO: 2}
    hits.sort(key=lambda h: (order[h.severity], h.rule_id))
    return [h.to_dict() for h in hits]
