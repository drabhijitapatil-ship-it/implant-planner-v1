"""
Clinical Rule Engine — cross-phase reasoning across a procedure document.

Architecture
────────────
Each rule is a small pure function that inspects a `procedure` dict
and returns a `RuleHit` (severity + message + citation) or None.
Rules live in `rules.py`. The engine itself is intentionally tiny —
no orchestration framework, no DAG; just a registered list invoked
on every Phase-save (or on demand via the API).

Citations live in a central registry (`_citations.py`) so every
warning surfaced to the clinician carries an evidence ID that maps
to the published source — ITI 2023, Misch 2020, systematic reviews,
or brand IFUs. The frontend renders the citation alongside the
warning so nothing is presented as ungrounded opinion.

Why deterministic-first?
────────────────────────
Hard blocks (e.g. ISQ + immediate loading, bone height adequacy)
must never be at the mercy of LLM hallucination. The rule engine
runs first; an optional LLM layer can later synthesise a narrative
over the deterministic findings.
"""
from ._base import RuleHit, Severity, register_rule, evaluate_case  # noqa
from . import rules  # noqa — registers the 5 v1 rules on import

__all__ = ["RuleHit", "Severity", "evaluate_case"]
