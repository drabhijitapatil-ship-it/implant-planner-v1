# Prosthodontics Surgical Case Portal — PRD

## Original Problem Statement
A comprehensive prosthodontics mobile application for managing implant surgical case workflows across 4 phases (Pre-Surgical, Surgical, Second Stage Surgical, Prosthetic). Core features include an implant library (49 systems), intelligent drilling protocol generation, implant-specific indications, role-based workflows (Student, Supervisor, In-Charge), and medical record documentation with PDF export.

## Tech Stack
- **Frontend**: React Native (Expo SDK 52), Expo Router, TypeScript
- **Backend**: FastAPI, MongoDB (Motor async driver), Python 3.11
- **Deployment**: Expo EAS Build + Expo Updates (OTA), Docker/Kubernetes (Emergent)
- **Auth**: JWT-based (username/password)

## Architecture
```
/app
├── backend/
│   ├── server.py                              # Monolithic FastAPI (~6022 lines)
│   ├── implant_library_updated.xlsx           # 49 systems, 649 variants (seed data)
│   └── requirements.txt
├── frontend/
│   ├── app/
│   │   ├── (tabs)/
│   │   │   ├── index.tsx                      # Dashboard
│   │   │   └── new-procedure.tsx              # Phase 1 creation wizard
│   │   ├── auth/login.tsx                     # Login screen
│   │   └── procedures/
│   │       ├── [id].tsx                       # Main detail/approval view (~1800 lines)
│   │       ├── submit-phase2/[id].tsx         # Phase 2 Surgical form
│   │       ├── submit-stage2-surgical/[id].tsx # Phase 3 form
│   │       ├── submit-stage2-prosthetic/[id].tsx # Phase 4 Step 1
│   │       └── submit-phase4-step2/[id].tsx   # Phase 4 Step 2
│   ├── components/
│   │   ├── CaseImplantPlanning.tsx            # Implant selection, risk, suggestion (~1400 lines)
│   │   └── DrillingProtocol.tsx               # Protocol display component
│   ├── constants/checklist.ts                 # Dropdown options & checklist definitions
│   ├── contexts/AuthContext.tsx               # JWT auth context
│   ├── utils/api.ts                           # Axios instance (EXPO_PUBLIC_BACKEND_URL)
│   ├── app.json                               # Expo config with OTA updates
│   ├── eas.json                               # EAS build config
│   └── .env                                   # EXPO_PUBLIC_BACKEND_URL
└── memory/PRD.md
```

## Database Schema (MongoDB)
### `implant_library` collection
- Fields: `brand`, `system`, `diameter`, `length`
- 649 documents across 49 unique brand|system combinations
- Seeded on startup from `implant_library_updated.xlsx` using upsert logic (safe, no data loss)

### `procedures` collection
- Complex document: patient info, `status` (draft → pending_phase1 → phase1_approved → pending_phase2 → ... → completed)
- Contains: `clinical_examination`, `medical_assessment`, `implant_plans`, `phase2_surgical`, `stage2_surgical`, `stage2_prosthetic`, `final_delivery`

### `users` collection
- 21 users with roles: `student`, `supervisor`, `implant_incharge`

## Key API Endpoints
| Endpoint | Method | Description |
|---|---|---|
| `/api/auth/login` | POST | JWT login (username or email) |
| `/api/implant-library/systems` | GET | Returns 49 systems with indications |
| `/api/implant-library/suggest` | GET | Suggest implants by tooth/bone |
| `/api/implant-library/suggest-auto` | POST | Auto-suggest with risk assessment |
| `/api/implant-library/calculate-risk` | POST | Risk calculation for implant plan |
| `/api/drilling-protocols/generate` | POST | Generate drilling protocol (brand, system, diameter, length, bone_density) |
| `/api/drilling-protocols/available` | GET | List all 32 systems with protocols |
| `/api/drilling-protocols/export-pdf` | POST | Generate PDF of drilling protocol |
| `/api/procedures` | POST/GET | Create/list procedures |
| `/api/procedures/{id}/submit-phase2` | POST | Submit Phase 2 |
| `/api/procedures/{id}/stage2/surgical` | POST | Submit Phase 3 |
| `/api/procedures/{id}/stage2/prosthetic` | POST | Submit Phase 4 Step 1 |
| `/api/procedures/{id}/stage2/prosthetic/step2` | POST | Submit Phase 4 Step 2 |

---

## IMPLANT LIBRARY STATUS (49 Systems)

### Systems WITH Indications (38)
| Brand | System | Has Protocol |
|---|---|---|
| Alpha Bio | SPI | YES |
| B&B Dental | EV Line | YES |
| B&B Dental | 3P | YES |
| B&B Dental | 3P Long | YES |
| B&B Dental | Wide Line | YES |
| B&B Dental | Dura-Vit Slim | YES |
| BioHorizons | Tapered Pro | YES |
| BioHorizons | Tapered Pro Conical RBT | YES (separate protocol) |
| BioHorizons | Tapered Short | YES |
| BioHorizons | Tapered Short Conical RBT | YES (shares Short protocol) |
| BioHorizons | Narrow Diameter | NO |
| BioHorizons | Tapered IM | NO |
| Bredent | Blue Sky | YES |
| Bredent | Copa Sky | YES |
| Bredent | Mini 2 Sky | YES |
| Bredent | Narrow Sky | YES |
| Conelog | Progressive Line | YES |
| Cowellmedi | INNO Submerged | YES |
| Cowellmedi | INNO Submerged Narrow | YES |
| Dentsply Sirona | Ankylos C/X | YES |
| MIS | Lance + | YES |
| NeoBiotech | IS-III active | NO |
| Neodent | Drive GM Acqua | YES |
| Neodent | Drive GM NeoPorous | YES |
| Neodent | Helix GM Acqua | YES |
| Neodent | Helix GM Neoporous | YES |
| Neodent | Titamax GM Acqua | YES |
| Neodent | Titamax GM NeoPorous | YES |
| Nobel Biocare | NobelActive NP | NO |
| Nobel Biocare | NobelActive RP | NO |
| Nobel Biocare | NobelParallel RP | NO |
| Osstem | ETIII NH | YES |
| Osstem | MS | YES |
| Osstem | SS III | YES |
| Osstem | TS III | YES |
| Osstem | TS IV | YES |
| Zimmer | TSX | YES |
| Zimmer | Tapered Screw-Vent (TSV) | NO |

### Systems WITHOUT Indications (11) — User will upload later
| Brand | System | Has Protocol |
|---|---|---|
| Blue Sky Bio | Bio Max | NO |
| Bredent | Sky Classic | YES (has protocol but no indication) |
| Dentium | SuperLine | NO |
| Megagen | AnyRidge | NO |
| NeoBiotech | IT-III active NP | NO |
| NeoBiotech | IT-III active RP | NO |
| NeoBiotech | IT-III active Wide | NO |
| Nobel Biocare | NobelActive WP | NO |
| Nobel Biocare | NobelParallel NP | NO |
| Nobel Biocare | NobelParallel WP | NO |
| Straumann | BLT | NO |

### Summary
- **49 total systems** in implant_library (649 variants)
- **38 systems** with indications
- **32 systems** with drilling protocols
- **17 systems** still need drilling protocols (user will provide data)
- **11 systems** still need indications (user will provide data)

---

## DRILLING PROTOCOL FAMILIES (32 Protocols)

### Protocol Generator Functions in server.py
| Protocol Family | Function | Systems |
|---|---|---|
| `conical_rbt` | `_generate_conical_rbt_protocol()` | BioHorizons Tapered Pro Conical RBT |
| `alpha_bio_spi` | `_generate_alpha_bio_spi_protocol()` | Alpha-Bio SPI |
| (default/pro) | `_generate_pro_protocol()` | BioHorizons Tapered Pro |
| (short) | `_generate_short_protocol()` | BioHorizons Tapered Short, Tapered Short Conical RBT |
| conelog | `_generate_conelog_protocol()` | Conelog Progressive Line |
| `helix`/`drive`/`titamax` | `_generate_neodent_protocol()` | All 6 Neodent GM systems |
| `ankylos` | `_generate_ankylos_protocol()` | Dentsply Sirona Ankylos C/X |
| `bb_dental` | `_generate_bb_dental_protocol()` | All 5 B&B Dental systems |
| `mis_lance` | `_generate_mis_lance_protocol()` | MIS Lance+ |
| `cowellmedi` | `_generate_cowellmedi_protocol()` | Both Cowellmedi INNO systems |
| `bredent_sky` | `_generate_bredent_protocol()` | All 5 Bredent SKY systems |
| `osstem` | `_generate_osstem_protocol()` | All 5 Osstem systems |
| `tsx` | `_generate_tsx_protocol()` | Zimmer TSX |

### Protocol Logic
- Each generator takes: `proto_dict`, `implant_diameter`, `implant_length`, `bone_density` (D1-D4)
- Dense bone (D1/D2): Full drill sequence to final diameter
- Soft bone (D3/D4): Under-preparation for primary stability
- Steps include: drill_type, diameter, depth, RPM, irrigation, drill codes
- Restricted bone height logic: 8mm, 9mm, 10mm protocols for short implants

### Protocol Data Sources (in server.py)
- `IMPLANT_INDICATIONS` dict: line ~3414 (38 entries)
- `DRILLING_PROTOCOLS` dict: line ~4226 (27 protocol entries mapped to 32 systems)
- `ALPHA_BIO_DENSE` / `ALPHA_BIO_SOFT`: drill sequence maps for Alpha-Bio SPI
- Various system-specific data dicts (OSSTEM_FINAL, CONELOG_PROTO, etc.)

---

## COMPLETED FEATURES (All Sessions)
1. Full 4-phase surgical workflow (Pre-Surgical → Surgical → Second Stage → Prosthetic)
2. Role-based access (Student creates, Supervisor reviews, In-Charge approves)
3. Implant library with 49 systems, suggestion engine, risk assessment
4. 32 drilling protocol generators with bone-density-aware sequences
5. Implant-specific indications for 38 systems
6. PDF export for drilling protocols
7. Calendar picker, scrollable dropdowns, form AppState persistence
8. JWT auth with expiry redirect, input sanitization
9. Safe database seeding (upsert logic, no destructive drops)
10. Top 3 implant suggestion + "Show More" in CaseImplantPlanning

## THIS SESSION CHANGES (2026-03-30)
- Verified Excel seed data (49 systems, 649 variants) — already identical to uploaded file
- Verified IMPLANT_INDICATIONS (38 entries) — already aligned with user's Word doc
- **Added Alpha-Bio SPI drilling protocol** (dense: full sequence, soft: under-preparation)
- **Separated BioHorizons Tapered Pro Conical RBT** into its own protocol (was aliased to Tapered Pro; document shows different drill sizes: 3.0-5.2 dense vs 2.5-5.4 for Tapered Pro)
- Updated both `generate` and `export-pdf` dispatchers for new protocol families
- Diagnosed user's Expo Go issue: app was pointing to old/dead backend URL from previous fork session
- Added `/api/expo-qr` endpoint for QR code serving

## KNOWN ISSUES
1. **Expo Go connectivity**: Each fork session creates a new preview URL. User's EAS-built app may have an old URL baked in. User needs to reconnect via current tunnel URL or rebuild with `eas build`.
2. **Deployment caching**: Docker manifest error previously blocked production deployments.
3. **server.py size**: 6022 lines — critically needs decomposition into routers.

## PENDING TASKS
### P0 (Next)
- Add drilling protocols for 17 remaining systems once user provides data files
- Add indications for 11 remaining systems once user provides data files

### P1
- Ensure all Phase 1 data visible on procedure detail page before/after approval
- PDF export for complete case data (not just drilling protocols)
- Auto-populate implant_site from implant_plans selections

### P2 (Refactoring)
- Decompose server.py into modular routers (auth, procedures, implant-library, drilling-protocols)
- Modularize CaseImplantPlanning.tsx (~1400 lines) and [id].tsx (~1800 lines)
- Data cleanup: remove duplicate user entries

## CREDENTIALS
- Student: `Gaurav.pandey` / `Student@123`
- Supervisor: `Paresh.gandhi` / `Supervisor@123`
- Admin/In-Charge: `Abhijit.patil` / `Admin@123`

## CURRENT PREVIEW URL
- Backend: `https://surgical-case-portal.preview.emergentagent.com`
- Expo Tunnel: `https://mozella-ungarbled-irreversibly.ngrok-free.dev` (changes each session)
