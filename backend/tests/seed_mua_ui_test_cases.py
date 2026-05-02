"""
Iteration 140 — Seed script for MUA Phase 2 UI test.
Creates 3 cases (Phase 1 approved + consent uploaded):
 - All-on-4 + Immediate Loading  → MUA MUST render
 - Single Conventional Implant + Immediate Loading → MUA must NOT render
 - All-on-4 + Delayed Loading    → MUA must NOT render
Prints the three procedure IDs as JSON for the Playwright test to consume.
"""
import os, sys, json
sys.path.insert(0, os.path.dirname(__file__))
from test_mua_phase2_iteration139 import (
    _login, STUDENT_CREDS, _create_procedure, _upload_consent,
    _approve_phase1, _created_ids,
)

student_token = _login(STUDENT_CREDS)

full_arch_imm = _create_procedure(
    student_token,
    procedure_type="All on 4",
    loading_type=["Immediate Loading"],
    edentulous_sites=["11", "12", "21", "22"],
)
_upload_consent(full_arch_imm, student_token)
assert _approve_phase1(full_arch_imm) == "phase1_approved"

single_imm = _create_procedure(
    student_token,
    procedure_type="Single Conventional Implant",
    loading_type=["Immediate Loading"],
    edentulous_sites=["14"],
)
_upload_consent(single_imm, student_token)
assert _approve_phase1(single_imm) == "phase1_approved"

full_arch_delayed = _create_procedure(
    student_token,
    procedure_type="All on 4",
    loading_type=["Delayed Loading"],
    edentulous_sites=["31", "32", "41", "42"],
)
_upload_consent(full_arch_delayed, student_token)
assert _approve_phase1(full_arch_delayed) == "phase1_approved"

print(json.dumps({
    "full_arch_imm": full_arch_imm,
    "single_imm": single_imm,
    "full_arch_delayed": full_arch_delayed,
}))
