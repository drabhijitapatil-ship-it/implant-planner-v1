"""
iter-280: Smart Clinical Tip seed library — Phase 1 (50 tips).

Source attribution kept at organization / author-body level by design
(no fabricated paper titles, DOIs, or page numbers). Citations point to
the consensus body of work for each organization / author so any clinician
can locate the underlying evidence in their existing references.

Category mix (rough target distribution):
  Treatment Planning  20%   Surgical          20%
  Prosthetic          15%   Occlusion         10%
  Soft Tissue         10%   Full Arch         10%
  Complications        5%   Digital Workflow   5%
  Evidence Updates     5%

Bone Augmentation (28) — added from Haugen et al., J Periodontal Res 2026
(doi:10.1111/jre.70087); "Planning" = before placement, "Surgery" = during.
"""

TIP_LIBRARY = [
    # ─────────── Treatment Planning (10) ───────────
    {"tip_id": "ITI_001", "title": "Implant-to-Tooth Distance", "category": "Treatment Planning",
     "phase": "Planning", "difficulty": "Beginner", "evidence_level": "High",
     "source_organization": "ITI", "source_reference": "ITI Treatment Guide Volume 1",
     "publication_year": 2023,
     "tip_text": "Maintain at least 1.5 mm of bone between an implant and any adjacent natural tooth. This preserves the interproximal crestal bone and supports stable papilla formation around the future restoration.",
     "tags": ["spacing", "papilla", "single implant"]},

    {"tip_id": "TARNOW_001", "title": "Interimplant Distance", "category": "Treatment Planning",
     "phase": "Planning", "difficulty": "Beginner", "evidence_level": "High",
     "source_organization": "Tarnow", "source_reference": "Tarnow et al. — interimplant distance",
     "publication_year": 2000,
     "tip_text": "Keep a minimum 3 mm distance between adjacent implants. Anything tighter has been shown to accelerate horizontal bone loss between fixtures and compromise interimplant papilla height.",
     "tags": ["spacing", "papilla", "adjacent implants"]},

    {"tip_id": "BUSER_001", "title": "Buccal Bone Thickness Target", "category": "Treatment Planning",
     "phase": "Planning", "difficulty": "Intermediate", "evidence_level": "High",
     "source_organization": "Buser", "source_reference": "Buser et al. — early/contour augmentation",
     "publication_year": 2017,
     "tip_text": "Plan for at least 2 mm of facial bone thickness around the implant after placement. Thinner buccal plates show higher recession and dehiscence rates over 3–5 years, especially in the aesthetic zone.",
     "tags": ["bone thickness", "aesthetic zone"]},

    {"tip_id": "EAO_001", "title": "Prosthetically Driven Planning", "category": "Treatment Planning",
     "phase": "Planning", "difficulty": "Beginner", "evidence_level": "High",
     "source_organization": "EAO", "source_reference": "EAO Consensus Conference Proceedings",
     "publication_year": 2021,
     "tip_text": "Start every plan from the final restoration. Once the prosthetic emergence is decided, work the implant position backwards into the bone — never the opposite. This single habit prevents most aesthetic and occlusal failures.",
     "tags": ["prosthetic", "planning"]},

    {"tip_id": "MISCH_001", "title": "Crown-to-Implant Ratio", "category": "Treatment Planning",
     "phase": "Planning", "difficulty": "Intermediate", "evidence_level": "Moderate",
     "source_organization": "Misch", "source_reference": "Misch — Contemporary Implant Dentistry",
     "publication_year": 2020,
     "tip_text": "Higher crown height space dramatically increases biomechanical lever arms on the implant. Wider-diameter implants and platform-switched abutments help offset the bending moment when crown height is unavoidable.",
     "tags": ["biomechanics", "crown height"]},

    {"tip_id": "ITI_002", "title": "Apico-Coronal Position", "category": "Treatment Planning",
     "phase": "Planning", "difficulty": "Intermediate", "evidence_level": "High",
     "source_organization": "ITI", "source_reference": "ITI Treatment Guide Volume 7",
     "publication_year": 2018,
     "tip_text": "Aim to place the implant platform ~3 mm apical to the planned gingival margin. Deeper placements risk anaerobic colonisation; shallower placements compromise emergence profile and aesthetics.",
     "tags": ["depth", "platform"]},

    {"tip_id": "EAO_002", "title": "Smoking & Outcomes", "category": "Treatment Planning",
     "phase": "Planning", "difficulty": "Beginner", "evidence_level": "High",
     "source_organization": "EAO", "source_reference": "EAO Consensus — risk factors",
     "publication_year": 2019,
     "tip_text": "Smoking more than 10 cigarettes/day roughly doubles the risk of peri-implantitis. Counsel for cessation pre-operatively and document the conversation — it materially changes treatment risk.",
     "tags": ["risk", "peri-implantitis"]},

    {"tip_id": "BUSER_002", "title": "Aesthetic Risk Assessment", "category": "Treatment Planning",
     "phase": "Planning", "difficulty": "Intermediate", "evidence_level": "Moderate",
     "source_organization": "Buser", "source_reference": "Buser — aesthetic risk classification",
     "publication_year": 2015,
     "tip_text": "Before any anterior case, classify aesthetic risk: smile line, gingival biotype, bone level on adjacent teeth and tooth shape. A high-risk profile means staged placement and contour augmentation, not immediate loading.",
     "tags": ["aesthetic", "risk"]},

    {"tip_id": "ITI_003", "title": "CBCT Indication", "category": "Treatment Planning",
     "phase": "Planning", "difficulty": "Beginner", "evidence_level": "High",
     "source_organization": "ITI", "source_reference": "ITI Consensus — imaging",
     "publication_year": 2018,
     "tip_text": "Use CBCT whenever a 2D radiograph cannot rule out proximity to inferior alveolar nerve, mental foramen, sinus floor, or thin buccal plate. The dose justification almost always favours imaging in these scenarios.",
     "tags": ["imaging", "cbct"]},

    {"tip_id": "MISCH_002", "title": "Bone Density Classification", "category": "Treatment Planning",
     "phase": "Planning", "difficulty": "Beginner", "evidence_level": "Moderate",
     "source_organization": "Misch", "source_reference": "Misch — bone density classification",
     "publication_year": 2020,
     "tip_text": "The D1–D4 classification predicts surgical protocol selection. D1/D2 favours conventional drilling and immediate loading; D3/D4 may require osteotomy under-preparation and a longer healing period before loading.",
     "tags": ["bone density", "loading"]},

    # ─────────── Surgical (11) ───────────
    {"tip_id": "ITI_020", "title": "D4 Bone Protocol", "category": "Surgical",
     "phase": "Surgery", "difficulty": "Intermediate", "evidence_level": "High",
     "source_organization": "ITI", "source_reference": "ITI Treatment Guide Volume 11",
     "publication_year": 2020,
     "tip_text": "In soft D4 bone, under-prepare the osteotomy by skipping the final drill or using a tap one size smaller. This raises insertion torque and primary stability without resorting to wider implants.",
     "tags": ["d4", "primary stability"]},

    {"tip_id": "MISCH_020", "title": "Primary Stability Drivers", "category": "Surgical",
     "phase": "Surgery", "difficulty": "Intermediate", "evidence_level": "Moderate",
     "source_organization": "Misch", "source_reference": "Misch — primary stability",
     "publication_year": 2020,
     "tip_text": "Primary stability is a combined function of bone density, implant macro-design and surgical technique — torque value alone is misleading. A tapered fixture in dense apical bone may hit 45 Ncm yet still micro-move.",
     "tags": ["stability", "torque"]},

    {"tip_id": "EAO_020", "title": "Immediate Placement", "category": "Surgical",
     "phase": "Surgery", "difficulty": "Advanced", "evidence_level": "High",
     "source_organization": "EAO", "source_reference": "EAO Consensus — immediate placement",
     "publication_year": 2021,
     "tip_text": "Immediate post-extraction placement is predictable only when palatal/lingual bone is intact, primary stability of ≥ 25 Ncm is achievable, and the buccal jumping-gap can be grafted. Otherwise stage.",
     "tags": ["immediate", "extraction socket"]},

    {"tip_id": "ITI_021", "title": "Heat Generation", "category": "Surgical",
     "phase": "Surgery", "difficulty": "Beginner", "evidence_level": "High",
     "source_organization": "ITI", "source_reference": "ITI Consensus — surgical protocols",
     "publication_year": 2018,
     "tip_text": "Bone temperatures above 47 °C for more than a minute can impair osseointegration. Use copious external irrigation, sharp drills (replace after ~20 osteotomies) and intermittent pumping motion to dissipate heat.",
     "tags": ["heat", "drilling"]},

    {"tip_id": "ARTICLE_021", "title": "Osseodensification", "category": "Surgical",
     "phase": "Surgery", "difficulty": "Advanced", "evidence_level": "Moderate",
     "source_organization": "Contemporary Literature",
     "source_reference": "Contemporary systematic reviews on osseodensification",
     "publication_year": 2022,
     "tip_text": "Osseodensification burs run in reverse to compact rather than excavate trabecular bone. Evidence suggests improved stability in D3/D4 sites, but the technique requires deliberate hydration to prevent ridge fracture.",
     "tags": ["osseodensification", "d4"]},

    {"tip_id": "BUSER_020", "title": "Flap Design", "category": "Surgical",
     "phase": "Surgery", "difficulty": "Intermediate", "evidence_level": "Moderate",
     "source_organization": "Buser", "source_reference": "Buser — soft tissue handling",
     "publication_year": 2017,
     "tip_text": "Minimise periosteal stripping wherever possible. The periosteum is the principal source of vascular supply during early healing — aggressive degloving correlates with more crestal bone resorption.",
     "tags": ["flap", "vascular"]},

    {"tip_id": "ITI_022", "title": "Implant Angulation", "category": "Surgical",
     "phase": "Surgery", "difficulty": "Intermediate", "evidence_level": "High",
     "source_organization": "ITI", "source_reference": "ITI Treatment Guide Volume 10",
     "publication_year": 2019,
     "tip_text": "Angulate the implant so the screw access channel exits through the cingulum in the anterior or the central fossa in the posterior. Beyond 15° of correction, switch from screw to cement retention or use an angled channel abutment.",
     "tags": ["angulation", "screw access"]},

    {"tip_id": "EAO_021", "title": "One-Stage vs Two-Stage", "category": "Surgical",
     "phase": "Surgery", "difficulty": "Beginner", "evidence_level": "High",
     "source_organization": "EAO", "source_reference": "EAO Consensus — submerged vs non-submerged",
     "publication_year": 2019,
     "tip_text": "For routine cases with adequate primary stability, one-stage (transmucosal) healing yields equivalent osseointegration to two-stage. Reserve submerged healing for grafted sites or compromised primary stability.",
     "tags": ["protocol", "healing"]},

    {"tip_id": "MISCH_021", "title": "Cortical Engagement", "category": "Surgical",
     "phase": "Surgery", "difficulty": "Advanced", "evidence_level": "Moderate",
     "source_organization": "Misch", "source_reference": "Misch — bicortical anchorage",
     "publication_year": 2020,
     "tip_text": "Engaging two cortical plates (e.g. crestal + sinus floor or crestal + lingual cortex) markedly improves primary stability in D3/D4 bone — but only when violation of the second cortex is anatomically safe.",
     "tags": ["bicortical", "stability"]},

    {"tip_id": "ITI_023", "title": "Drill Sequence Discipline", "category": "Surgical",
     "phase": "Surgery", "difficulty": "Beginner", "evidence_level": "Moderate",
     "source_organization": "ITI", "source_reference": "ITI Treatment Guide Volume 11",
     "publication_year": 2020,
     "tip_text": "Honour the manufacturer's drill sequence — including the pilot. Skipping drills to save time concentrates heat and micro-fractures the osteotomy walls, undermining the very stability you were trying to improve.",
     "tags": ["drilling", "protocol"]},

    {"tip_id": "PASS_001", "title": "The PASS Principles for Bone Grafting", "category": "Surgical",
     "phase": "Surgery", "difficulty": "Intermediate", "evidence_level": "High",
     "source_organization": "Wang & Boyapati",
     "source_reference": "Wang & Boyapati — PASS principles for predictable bone regeneration",
     "publication_year": 2006,
     "tip_text": "The PASS principles for bone graft procedures:\n"
                 "1. Primary closure — the most crucial principle. It protects the blood clot and graft material from the external environment. Tension-free closure is mandatory.\n"
                 "2. Angiogenesis — adequate blood supply provides the nutrients and oxygen needed for new bone formation.\n"
                 "3. Space maintenance — physically maintain the space for bone formation with a barrier membrane or other structures (e.g. Ti-mesh, tenting screws).\n"
                 "4. Stability — minimise micromovement of the grafted blood clot and bone graft material to encourage healing. Fixation of the membrane and graft is key.",
     "tags": ["bone graft", "GBR", "augmentation", "PASS"]},

    # ─────────── Prosthetic (8) ───────────
    {"tip_id": "ITI_040", "title": "Soft-Tissue Thickness", "category": "Prosthetic",
     "phase": "Restoration", "difficulty": "Intermediate", "evidence_level": "High",
     "source_organization": "ITI", "source_reference": "ITI Consensus — soft tissue",
     "publication_year": 2018,
     "tip_text": "Vertical peri-implant mucosal thickness above 2 mm has been associated with significantly less crestal bone remodelling in the first year of function. Augment soft tissue when biotype is thin.",
     "tags": ["soft tissue", "crestal bone"]},

    {"tip_id": "BUSER_040", "title": "Emergence Profile", "category": "Prosthetic",
     "phase": "Restoration", "difficulty": "Intermediate", "evidence_level": "Moderate",
     "source_organization": "Buser", "source_reference": "Buser — emergence contours",
     "publication_year": 2017,
     "tip_text": "Build the emergence profile gradually with provisionals over 4–8 weeks rather than imposing the final contour at delivery. The tissue needs time to remodel; rushing it creates blanching and recession.",
     "tags": ["emergence", "provisional"]},

    {"tip_id": "MISCH_040", "title": "Cantilever Control", "category": "Prosthetic",
     "phase": "Restoration", "difficulty": "Intermediate", "evidence_level": "Moderate",
     "source_organization": "Misch", "source_reference": "Misch — biomechanics",
     "publication_year": 2020,
     "tip_text": "Cantilever length on implant-supported prostheses should be kept short — generally not exceeding the anterior-posterior implant spread. Long cantilevers magnify forces non-linearly and are a top cause of screw loosening.",
     "tags": ["cantilever", "biomechanics"]},

    {"tip_id": "ITI_041", "title": "Screw-Retained Preference", "category": "Prosthetic",
     "phase": "Restoration", "difficulty": "Beginner", "evidence_level": "High",
     "source_organization": "ITI", "source_reference": "ITI Treatment Guide Volume 12",
     "publication_year": 2021,
     "tip_text": "Whenever the screw access can be hidden, prefer screw retention. It removes residual cement (the leading iatrogenic cause of peri-implantitis) and makes retrieval for repair predictable.",
     "tags": ["screw retention", "retrievability"]},

    {"tip_id": "EAO_041", "title": "Platform Switching", "category": "Prosthetic",
     "phase": "Restoration", "difficulty": "Intermediate", "evidence_level": "High",
     "source_organization": "EAO", "source_reference": "EAO Consensus — platform switching",
     "publication_year": 2020,
     "tip_text": "Restoring with an abutment narrower than the implant platform shifts the implant-abutment interface inward and reduces marginal bone loss by roughly 0.3 mm in the first year, especially on wider fixtures.",
     "tags": ["platform switching", "marginal bone"]},

    {"tip_id": "MISCH_041", "title": "Occlusal Material Choice", "category": "Prosthetic",
     "phase": "Restoration", "difficulty": "Beginner", "evidence_level": "Moderate",
     "source_organization": "Misch", "source_reference": "Misch — material selection",
     "publication_year": 2020,
     "tip_text": "Monolithic zirconia and lithium disilicate both perform well on implants, but require careful adjustment and polishing — rough ceramic accelerates antagonist tooth wear and biofilm retention.",
     "tags": ["materials", "zirconia"]},

    {"tip_id": "ITI_042", "title": "Abutment Disconnection", "category": "Prosthetic",
     "phase": "Restoration", "difficulty": "Intermediate", "evidence_level": "Moderate",
     "source_organization": "ITI", "source_reference": "ITI Consensus — one-abutment-one-time",
     "publication_year": 2018,
     "tip_text": "Each disconnection of the abutment damages the mucosal seal and may cost ~0.1 mm of crestal bone. Where the workflow permits, follow the 'one-abutment one-time' principle and place the definitive abutment at uncovering.",
     "tags": ["abutment", "seal"]},

    {"tip_id": "EAO_042", "title": "Provisional Trial", "category": "Prosthetic",
     "phase": "Restoration", "difficulty": "Beginner", "evidence_level": "Moderate",
     "source_organization": "EAO", "source_reference": "EAO Consensus — provisional restorations",
     "publication_year": 2021,
     "tip_text": "Use a provisional restoration for at least 8 weeks in aesthetic cases. It refines emergence, validates phonetics and lets the patient signal preferences before the final ceramic is fabricated.",
     "tags": ["provisional", "aesthetic"]},

    # ─────────── Occlusion (5) ───────────
    {"tip_id": "MISCH_060", "title": "Implant-Protected Occlusion", "category": "Occlusion",
     "phase": "Restoration", "difficulty": "Intermediate", "evidence_level": "Moderate",
     "source_organization": "Misch", "source_reference": "Misch — occlusal scheme",
     "publication_year": 2020,
     "tip_text": "Light centric contact, no lateral interferences, and a canine-guided excursion are the cornerstones of implant-protected occlusion. The goal is axial loading only — implants tolerate compression far better than shear.",
     "tags": ["occlusion", "loading"]},

    {"tip_id": "ITI_060", "title": "Posterior Inter-Occlusal Space", "category": "Occlusion",
     "phase": "Planning", "difficulty": "Beginner", "evidence_level": "Moderate",
     "source_organization": "ITI", "source_reference": "ITI Treatment Guide Volume 8",
     "publication_year": 2018,
     "tip_text": "Ensure at least 7 mm of inter-occlusal space for posterior screw-retained implant crowns (5 mm restorative + 2 mm material). Tighter clearance forces compromise on either screw mechanics or ceramic thickness.",
     "tags": ["clearance", "restorative"]},

    {"tip_id": "MISCH_061", "title": "Parafunction Management", "category": "Occlusion",
     "phase": "Maintenance", "difficulty": "Beginner", "evidence_level": "Moderate",
     "source_organization": "Misch", "source_reference": "Misch — parafunction",
     "publication_year": 2020,
     "tip_text": "Bruxers should be fitted with a protective occlusal splint at the time of prosthesis delivery. Without it, the rate of screw loosening, ceramic chipping and component fracture increases significantly.",
     "tags": ["bruxism", "splint"]},

    {"tip_id": "EAO_060", "title": "Group Function in Full Arch", "category": "Occlusion",
     "phase": "Restoration", "difficulty": "Advanced", "evidence_level": "Moderate",
     "source_organization": "EAO", "source_reference": "EAO Consensus — full arch occlusion",
     "publication_year": 2021,
     "tip_text": "Full-arch implant-supported prostheses commonly use group function rather than canine guidance. It distributes load across multiple implants and reduces lateral stress on any single fixture.",
     "tags": ["full arch", "scheme"]},

    {"tip_id": "ARTICLE_060", "title": "Occlusal Adjustment Recall", "category": "Occlusion",
     "phase": "Maintenance", "difficulty": "Beginner", "evidence_level": "Moderate",
     "source_organization": "Contemporary Literature",
     "source_reference": "Contemporary reviews on prosthetic maintenance",
     "publication_year": 2022,
     "tip_text": "Implants do not intrude under load like natural teeth, so adjacent enamel attrition steadily creates supra-contacts on the implant crown. Re-check and adjust occlusion at every maintenance visit.",
     "tags": ["recall", "adjustment"]},

    # ─────────── Soft Tissue (5) ───────────
    {"tip_id": "BUSER_080", "title": "Keratinised Mucosa Width", "category": "Soft Tissue",
     "phase": "Planning", "difficulty": "Intermediate", "evidence_level": "High",
     "source_organization": "Buser", "source_reference": "Buser — keratinised tissue",
     "publication_year": 2017,
     "tip_text": "A keratinised mucosa width of at least 2 mm around the implant lowers plaque, bleeding and recession scores at recall. Augment with a free gingival graft before or during uncovering when the band is thin.",
     "tags": ["keratinised", "graft"]},

    {"tip_id": "ITI_080", "title": "Connective Tissue Graft Timing", "category": "Soft Tissue",
     "phase": "Surgery", "difficulty": "Advanced", "evidence_level": "Moderate",
     "source_organization": "ITI", "source_reference": "ITI Treatment Guide Volume 6",
     "publication_year": 2018,
     "tip_text": "In thin biotypes, a sub-epithelial connective tissue graft placed at uncovering thickens the facial mucosa and significantly reduces grey show-through of titanium beneath the soft tissue.",
     "tags": ["cTG", "aesthetic"]},

    {"tip_id": "ITI_081", "title": "Papilla Preservation Incision", "category": "Soft Tissue",
     "phase": "Surgery", "difficulty": "Advanced", "evidence_level": "Moderate",
     "source_organization": "ITI", "source_reference": "ITI Consensus — incision design",
     "publication_year": 2018,
     "tip_text": "When adjacent papillae are intact, use a palatal mid-crestal incision and lift the flap from the palate. Crossing the papilla unnecessarily is a one-way ticket to a black triangle.",
     "tags": ["incision", "papilla"]},

    {"tip_id": "MISCH_080", "title": "Biological Width Around Implants", "category": "Soft Tissue",
     "phase": "Planning", "difficulty": "Intermediate", "evidence_level": "High",
     "source_organization": "Misch", "source_reference": "Misch — biological width",
     "publication_year": 2020,
     "tip_text": "Peri-implant biological width is roughly 3–4 mm — slightly more apical than around teeth. Crown margins forced too deep into this zone provoke chronic inflammation and crestal bone resorption.",
     "tags": ["biological width", "margins"]},

    {"tip_id": "EAO_080", "title": "Healing Abutment Height", "category": "Soft Tissue",
     "phase": "Surgery", "difficulty": "Beginner", "evidence_level": "Moderate",
     "source_organization": "EAO", "source_reference": "EAO Consensus — healing abutments",
     "publication_year": 2021,
     "tip_text": "Choose a healing abutment that emerges 1–2 mm above the mucosa. Too short and the tissue collapses over it; too tall and it occludes prematurely on the antagonist and loosens.",
     "tags": ["healing abutment", "uncovering"]},

    # ─────────── Full Arch (5) ───────────
    {"tip_id": "FULLARCH_001", "title": "AP Spread", "category": "Full Arch Rehabilitation",
     "phase": "Planning", "difficulty": "Advanced", "evidence_level": "Moderate",
     "source_organization": "Misch", "source_reference": "Misch — A-P spread",
     "publication_year": 2020,
     "tip_text": "The greater the antero-posterior implant spread, the shorter the safe cantilever you can support. As a rule, distal cantilever length should not exceed 1.5× the A-P spread in mandibular full-arch.",
     "tags": ["ap spread", "cantilever"]},

    {"tip_id": "FULLARCH_002", "title": "Tilted Distal Implants", "category": "Full Arch Rehabilitation",
     "phase": "Surgery", "difficulty": "Advanced", "evidence_level": "Moderate",
     "source_organization": "Contemporary Literature",
     "source_reference": "Systematic reviews on All-on-4 protocols",
     "publication_year": 2022,
     "tip_text": "Tilting the distal implants up to 30° lets you avoid the mental loop or sinus floor and extend the A-P spread without grafting. Long-term survival rates parallel those of axial implants in the same arch.",
     "tags": ["tilted", "all on 4"]},

    {"tip_id": "ITI_100", "title": "Passive Framework Fit", "category": "Full Arch Rehabilitation",
     "phase": "Restoration", "difficulty": "Advanced", "evidence_level": "High",
     "source_organization": "ITI", "source_reference": "ITI Treatment Guide Volume 4",
     "publication_year": 2017,
     "tip_text": "A truly passive framework fit is the single most underestimated determinant of full-arch survival. Verify with a one-screw test (Sheffield) before final cementation or screw-down.",
     "tags": ["passive fit", "framework"]},

    {"tip_id": "EAO_100", "title": "Number of Implants Per Arch", "category": "Full Arch Rehabilitation",
     "phase": "Planning", "difficulty": "Advanced", "evidence_level": "High",
     "source_organization": "EAO", "source_reference": "EAO Consensus — full arch",
     "publication_year": 2021,
     "tip_text": "Four to six implants per arch remains the accepted range for fixed full-arch rehabilitation. Going below four removes redundancy if any implant fails; going beyond six does not consistently improve outcomes.",
     "tags": ["fixed", "number"]},

    {"tip_id": "MISCH_100", "title": "Posterior Anchorage", "category": "Full Arch Rehabilitation",
     "phase": "Planning", "difficulty": "Advanced", "evidence_level": "Moderate",
     "source_organization": "Misch", "source_reference": "Misch — full-arch biomechanics",
     "publication_year": 2020,
     "tip_text": "Where the maxillary sinus blocks distal implants, consider zygomatic anchorage or staged sinus elevation — but never compromise the A-P spread by hugging implants too anteriorly.",
     "tags": ["zygomatic", "sinus"]},

    # ─────────── Complications (3) ───────────
    {"tip_id": "ITI_120", "title": "Peri-Implantitis Diagnosis", "category": "Complications",
     "phase": "Maintenance", "difficulty": "Intermediate", "evidence_level": "High",
     "source_organization": "ITI", "source_reference": "ITI Consensus — peri-implant diseases",
     "publication_year": 2018,
     "tip_text": "Peri-implantitis is defined by bleeding on probing combined with radiographic bone loss beyond initial remodelling. A simple probing-depth increase alone is mucositis, not peri-implantitis — treat early and aggressively.",
     "tags": ["peri-implantitis", "diagnosis"]},

    {"tip_id": "EAO_120", "title": "Screw Loosening Trend", "category": "Complications",
     "phase": "Maintenance", "difficulty": "Beginner", "evidence_level": "Moderate",
     "source_organization": "EAO", "source_reference": "EAO Consensus — prosthetic complications",
     "publication_year": 2021,
     "tip_text": "Repeated screw loosening on the same implant is almost never the screw — it usually points to an occlusal interference, micro-leakage at the abutment, or a poor passive fit. Investigate the cause, not the symptom.",
     "tags": ["screw loosening", "occlusion"]},

    {"tip_id": "ARTICLE_120", "title": "Cement Remnants", "category": "Complications",
     "phase": "Restoration", "difficulty": "Beginner", "evidence_level": "High",
     "source_organization": "Contemporary Literature",
     "source_reference": "Systematic reviews on cement-related peri-implantitis",
     "publication_year": 2022,
     "tip_text": "Residual sub-mucosal cement is one of the strongest predictors of peri-implantitis. If cement retention is unavoidable, use minimal cement, an extra-oral cementation jig and meticulous removal protocols.",
     "tags": ["cement", "peri-implantitis"]},

    # ─────────── Digital Workflow (3) ───────────
    {"tip_id": "ITI_140", "title": "Guided Surgery Accuracy", "category": "Digital Workflow",
     "phase": "Surgery", "difficulty": "Intermediate", "evidence_level": "High",
     "source_organization": "ITI", "source_reference": "ITI Treatment Guide Volume 11",
     "publication_year": 2020,
     "tip_text": "Static guided implant placement reduces angular deviation to roughly 4° on average, but accuracy collapses if the guide rocks. Always verify three-point stability against teeth or fixation pins.",
     "tags": ["guided", "accuracy"]},

    {"tip_id": "EAO_140", "title": "Digital Impression", "category": "Digital Workflow",
     "phase": "Restoration", "difficulty": "Beginner", "evidence_level": "Moderate",
     "source_organization": "EAO", "source_reference": "EAO Consensus — digital workflows",
     "publication_year": 2021,
     "tip_text": "Intra-oral scans of single implants are now well validated. For full-arch, accuracy still falls behind conventional splinted impressions — bridge the gap with photogrammetry or stitching landmarks.",
     "tags": ["digital impression", "accuracy"]},

    {"tip_id": "ARTICLE_140", "title": "Dynamic Navigation", "category": "Digital Workflow",
     "phase": "Surgery", "difficulty": "Advanced", "evidence_level": "Moderate",
     "source_organization": "Contemporary Literature",
     "source_reference": "Contemporary studies on dynamic navigation",
     "publication_year": 2023,
     "tip_text": "Dynamic navigation matches static guides for accuracy in experienced hands and adds intra-operative flexibility. The learning curve is real — practice on typodonts before live cases.",
     "tags": ["navigation", "accuracy"]},

    # ─────────── Evidence Updates (3) ───────────
    {"tip_id": "EAO_160", "title": "Short Implants", "category": "Evidence Update",
     "phase": "Planning", "difficulty": "Intermediate", "evidence_level": "High",
     "source_organization": "EAO", "source_reference": "EAO Consensus — short implants",
     "publication_year": 2021,
     "tip_text": "Short implants (≤ 6 mm) in the posterior maxilla now show 3-year survival comparable to longer implants placed in grafted sites — and avoid the morbidity of sinus augmentation when bone is limited.",
     "tags": ["short implants", "evidence"]},

    {"tip_id": "ITI_160", "title": "Narrow Diameter Implants", "category": "Evidence Update",
     "phase": "Planning", "difficulty": "Intermediate", "evidence_level": "High",
     "source_organization": "ITI", "source_reference": "ITI Consensus — narrow diameter implants",
     "publication_year": 2018,
     "tip_text": "3.0–3.3 mm narrow-diameter implants have shown 5-year survival rates above 95% in the anterior region. Reserve wider fixtures for posterior load and consider narrow ones where bone and aesthetics demand it.",
     "tags": ["narrow diameter", "evidence"]},

    {"tip_id": "ARTICLE_160", "title": "Ceramic Implants", "category": "Evidence Update",
     "phase": "Planning", "difficulty": "Advanced", "evidence_level": "Moderate",
     "source_organization": "Contemporary Literature",
     "source_reference": "Systematic reviews on zirconia implants",
     "publication_year": 2023,
     "tip_text": "Zirconia implants are no longer experimental — survival approaches titanium at 5 years in selected indications. They remain a special-case choice for documented titanium hypersensitivity and metal-free aesthetic demand.",
     "tags": ["zirconia implant", "ceramic"]},

    # ─────────── Bone Augmentation (28) ───────────
    # Source: Haugen HJ, Sanz J, Perale G, Saiz AM, Romandini M, Rahmati M.
    # "Bone Grafts: Everything You Need to Know." J Periodontal Res 2026;
    # doi:10.1111/jre.70087 (open access, CC BY). Primary trials / meta-analyses
    # quoted inside a tip are the ones that review cites for that number.
    # phase "Planning" = before implant placement, "Surgery" = during placement.

    # ── Before placement: choosing the graft ──
    {"tip_id": "HAUGEN26_001", "title": "Pick the Graft by the Biology Needed", "category": "Bone Augmentation",
     "phase": "Planning", "difficulty": "Beginner", "evidence_level": "High",
     "source_organization": "J Periodontal Res", "source_reference": "Haugen et al. 2026 — Bone Grafts: Everything You Need to Know, Table 1",
     "publication_year": 2026,
     "tip_text": "Ask which mechanism the site needs. Socket preservation and standard sinus lifts need only osteoconduction and space maintenance, so a substitute alone works. Lateral or vertical ridge augmentation needs osteogenesis as well, so an autogenous component is essential.",
     "tags": ["bone augmentation", "graft selection", "before placement"]},

    {"tip_id": "HAUGEN26_002", "title": "Cell-Rich or Cell-Poor Site?", "category": "Bone Augmentation",
     "phase": "Planning", "difficulty": "Intermediate", "evidence_level": "Moderate",
     "source_organization": "J Periodontal Res", "source_reference": "Haugen et al. 2026 — §4, linking mechanisms to clinical strategy",
     "publication_year": 2026,
     "tip_text": "A fresh socket or a lifted sinus is surrounded by vascular bone or membrane, so cells come from the host. A ridge covered by a membrane or mesh is cut off from the periosteum, so the graft must bring its own living cells. Decide this before ordering material.",
     "tags": ["bone augmentation", "periosteum", "vascularity", "before placement"]},

    {"tip_id": "HAUGEN26_003", "title": "The Graft Triad at a Glance", "category": "Bone Augmentation",
     "phase": "Planning", "difficulty": "Beginner", "evidence_level": "High",
     "source_organization": "J Periodontal Res", "source_reference": "Haugen et al. 2026 — Figure 1, classification of bone grafts",
     "publication_year": 2026,
     "tip_text": "Autograft: osteogenic, osteoinductive and osteoconductive, but has donor-site morbidity and resorbs fast. Allograft: osteoconductive, weakly inductive, moderate resorption. Xenograft and synthetics: osteoconductive only, with no living cells or growth factors.",
     "tags": ["bone augmentation", "autograft", "allograft", "xenograft", "alloplast"]},

    {"tip_id": "HAUGEN26_004", "title": "Plan Around Resorption Speed", "category": "Bone Augmentation",
     "phase": "Planning", "difficulty": "Intermediate", "evidence_level": "Moderate",
     "source_organization": "J Periodontal Res", "source_reference": "Haugen et al. 2026 — §2.7 resorbable vs non-resorbable grafts",
     "publication_year": 2026,
     "tip_text": "Autograft resorbs fast, allograft moderately, deproteinised bovine bone very slowly, and β-TCP over several months; dense hydroxyapatite may never fully resorb. Choose a slow-resorbing graft where long-term contour matters, such as the aesthetic zone or sinus, and a resorbable one where you want full replacement by native bone.",
     "tags": ["bone augmentation", "resorption", "DBBM", "β-TCP", "before placement"]},

    {"tip_id": "HAUGEN26_005", "title": "Bovine or Porcine — Both Work", "category": "Bone Augmentation",
     "phase": "Planning", "difficulty": "Beginner", "evidence_level": "High",
     "source_organization": "J Periodontal Res", "source_reference": "Haugen et al. 2026 — §2.3, citing Wang 2025 meta-analysis and Galindo-Moreno 2022 RCT",
     "publication_year": 2026,
     "tip_text": "A meta-analysis of 202 grafted sites found no difference in new bone or radiographic gain between porcine and bovine xenografts in sinus and socket grafting. A split-mouth RCT showed matching histology and 100% implant survival at 6 months. Choose by availability and patient preference.",
     "tags": ["bone augmentation", "xenograft", "porcine", "bovine"]},

    {"tip_id": "HAUGEN26_006", "title": "Ask About Graft Origin at Consent", "category": "Bone Augmentation",
     "phase": "Planning", "difficulty": "Beginner", "evidence_level": "Moderate",
     "source_organization": "J Periodontal Res", "source_reference": "Haugen et al. 2026 — §2.3 and §7, ethical and religious considerations",
     "publication_year": 2026,
     "tip_text": "Some patients object to animal-derived (bovine or porcine) or human-donor bone on religious or ethical grounds. Name the graft's origin during consent, offer a synthetic alternative when needed, and record the patient's choice.",
     "tags": ["bone augmentation", "consent", "patient preference", "before placement"]},

    {"tip_id": "HAUGEN26_007", "title": "Answering 'Is the Graft Safe?'", "category": "Bone Augmentation",
     "phase": "Planning", "difficulty": "Beginner", "evidence_level": "Moderate",
     "source_organization": "J Periodontal Res", "source_reference": "Haugen et al. 2026 — §2.2–2.4, citing Kim 2013 systematic review",
     "publication_year": 2026,
     "tip_text": "Decades of use show no reported prion transmission from commercial deproteinised bovine grafts. Processed allografts carry only a small residual infection risk after screening and sterilisation. Synthetic grafts carry no disease-transmission risk at all.",
     "tags": ["bone augmentation", "safety", "patient communication"]},

    {"tip_id": "HAUGEN26_008", "title": "Know Your Allograft Prep", "category": "Bone Augmentation",
     "phase": "Planning", "difficulty": "Intermediate", "evidence_level": "Moderate",
     "source_organization": "J Periodontal Res", "source_reference": "Haugen et al. 2026 — §2.2 allografts",
     "publication_year": 2026,
     "tip_text": "Fresh-frozen allograft keeps more native proteins and may be more inductive, but has higher immune and disease risk and is harder to store. Freeze-dried bone (FDBA, DFDBA) keeps far longer and is less immunogenic, at the cost of lower osteogenic and mechanical strength.",
     "tags": ["bone augmentation", "allograft", "FDBA", "DFDBA"]},

    # ── Before placement: socket preservation ──
    {"tip_id": "HAUGEN26_009", "title": "Socket Preservation Pays Off", "category": "Bone Augmentation",
     "phase": "Planning", "difficulty": "Beginner", "evidence_level": "High",
     "source_organization": "J Periodontal Res", "source_reference": "Haugen et al. 2026 — §4.2, citing Avila-Ortiz 2019 meta-analysis",
     "publication_year": 2026,
     "tip_text": "Across 22 RCTs (607 patients), grafted sockets kept on average 2.0 mm more width, 1.7 mm more mid-buccal height and 1.2 mm more mid-lingual height than spontaneous healing. Some remodelling still happens, so plan the implant for the ridge you will have, not the one you see at extraction.",
     "tags": ["bone augmentation", "socket preservation", "ridge preservation", "before placement"]},

    {"tip_id": "HAUGEN26_010", "title": "Socket Grafts: Skip the Autograft", "category": "Bone Augmentation",
     "phase": "Planning", "difficulty": "Beginner", "evidence_level": "High",
     "source_organization": "J Periodontal Res", "source_reference": "Haugen et al. 2026 — §4.2 and Table 1",
     "publication_year": 2026,
     "tip_text": "A socket is already lined by vascular bone, so the graft does not need to form bone itself. Use a particulate xenograft, allograft or β-TCP with a collagen membrane or sponge, which also suits flapless extraction. Autogenous bone is not a first-line choice here.",
     "tags": ["bone augmentation", "socket preservation", "flapless", "before placement"]},

    {"tip_id": "HAUGEN26_011", "title": "Socket Graft: Stability vs Vital Bone", "category": "Bone Augmentation",
     "phase": "Planning", "difficulty": "Intermediate", "evidence_level": "High",
     "source_organization": "J Periodontal Res", "source_reference": "Haugen et al. 2026 — §4.2.2, citing Canullo 2022 network meta-analysis",
     "publication_year": 2026,
     "tip_text": "In 88 RCTs (3,073 sockets), xenografts gave the best dimensional stability but the lowest vital bone (28–35%); platelet concentrates gave the most new bone (around 43%). Implant survival was at least 97% at 12 months whatever the material, so choose by anatomy and timing of placement.",
     "tags": ["bone augmentation", "socket preservation", "xenograft", "PRF"]},

    {"tip_id": "HAUGEN26_012", "title": "Check Buccal Wall Thickness", "category": "Bone Augmentation",
     "phase": "Planning", "difficulty": "Intermediate", "evidence_level": "High",
     "source_organization": "J Periodontal Res", "source_reference": "Haugen et al. 2026 — §4.2, citing Avila-Ortiz 2019",
     "publication_year": 2026,
     "tip_text": "Socket grafts with xenograft or allograft under a collagen membrane preserved up to 3.2 mm more ridge when the buccal wall was thicker than 1 mm. Measure the buccal plate on CBCT before extraction to set realistic expectations.",
     "tags": ["bone augmentation", "buccal bone", "CBCT", "before placement"]},

    # ── Before placement: sinus floor elevation ──
    {"tip_id": "HAUGEN26_013", "title": "Staged Sinus Lift: Substitute Alone Is Enough", "category": "Bone Augmentation",
     "phase": "Planning", "difficulty": "Intermediate", "evidence_level": "High",
     "source_organization": "J Periodontal Res", "source_reference": "Haugen et al. 2026 — §4.3 and Table 1",
     "publication_year": 2026,
     "tip_text": "The lifted Schneiderian membrane is itself osteogenic, so for a staged lift a xenograft or synthetic graft only has to hold the space. Add up to 30% autogenous chips only when you want healing in under 4 months, or for very large lifts.",
     "tags": ["bone augmentation", "sinus lift", "xenograft", "before placement"]},

    {"tip_id": "HAUGEN26_014", "title": "Sinus Grafts: Biologics Add Vital Bone", "category": "Bone Augmentation",
     "phase": "Planning", "difficulty": "Advanced", "evidence_level": "High",
     "source_organization": "J Periodontal Res", "source_reference": "Haugen et al. 2026 — §4.3, citing Trimmel 2021 network meta-analysis",
     "publication_year": 2026,
     "tip_text": "Across 34 RCTs (842 sinuses, 5–8 months' healing), bovine xenograft plus bone-marrow concentrate ranked best for new bone (SUCRA 81%), followed by bovine plus PRP (77%). Autogenous bone alone ranked twelfth. Consider an autologous adjunct in large lifts to shorten healing.",
     "tags": ["bone augmentation", "sinus lift", "PRP", "bone marrow concentrate"]},

    # ── Before placement: ridge augmentation & materials ──
    {"tip_id": "HAUGEN26_015", "title": "Ridge Augmentation Needs Living Cells", "category": "Bone Augmentation",
     "phase": "Planning", "difficulty": "Intermediate", "evidence_level": "High",
     "source_organization": "J Periodontal Res", "source_reference": "Haugen et al. 2026 — §4.4 and Table 1",
     "publication_year": 2026,
     "tip_text": "For lateral or vertical GBR, plan 30–70% autogenous chips (or a block) mixed with a slowly resorbing scaffold, protected by titanium-reinforced PTFE or mesh. The autograft starts bone formation; the xenograft stops the contour from resorbing away.",
     "tags": ["bone augmentation", "GBR", "autograft", "composite graft", "before placement"]},

    {"tip_id": "HAUGEN26_016", "title": "Three Ways to Build a Composite Graft", "category": "Bone Augmentation",
     "phase": "Planning", "difficulty": "Intermediate", "evidence_level": "Moderate",
     "source_organization": "J Periodontal Res", "source_reference": "Haugen et al. 2026 — §2.5 and Figure 4",
     "publication_year": 2026,
     "tip_text": "Scaffold plus autograft adds volume and biology (e.g. Bio-Oss with autograft). Scaffold plus a growth factor improves induction (e.g. β-TCP with rhBMP-2). Scaffold plus a platelet concentrate adds autologous growth factors (e.g. DBBM with PRF). Even a small amount of autograft noticeably improves a synthetic graft.",
     "tags": ["bone augmentation", "composite graft", "PRF", "rhBMP-2"]},

    {"tip_id": "HAUGEN26_017", "title": "rhBMP-2: Powerful, Use With Care", "category": "Bone Augmentation",
     "phase": "Planning", "difficulty": "Advanced", "evidence_level": "Moderate",
     "source_organization": "J Periodontal Res", "source_reference": "Haugen et al. 2026 — §2.5 and §6.2",
     "publication_year": 2026,
     "tip_text": "rhBMP-2 on a calcium-phosphate carrier can match autograft bone formation without a donor site. At supraphysiological doses, though, it can cause ectopic bone, inflammation and oedema. Pay attention to dose, release and carrier, and reserve it for cases where the benefit is clear.",
     "tags": ["bone augmentation", "rhBMP-2", "growth factors", "safety"]},

    {"tip_id": "HAUGEN26_018", "title": "rhPDGF-BB Is a Recruiter, Not an Inducer", "category": "Bone Augmentation",
     "phase": "Planning", "difficulty": "Advanced", "evidence_level": "Moderate",
     "source_organization": "J Periodontal Res", "source_reference": "Haugen et al. 2026 — §2.5",
     "publication_year": 2026,
     "tip_text": "rhPDGF-BB mainly drives angiogenesis and cell recruitment, which helps early wound and soft-tissue healing with less inflammation than rhBMP-2. Its bone-forming effect is milder, so don't expect BMP-level induction from it.",
     "tags": ["bone augmentation", "rhPDGF-BB", "growth factors"]},

    {"tip_id": "HAUGEN26_019", "title": "CAD-CAM Blocks for Complex Defects", "category": "Bone Augmentation",
     "phase": "Planning", "difficulty": "Advanced", "evidence_level": "Moderate",
     "source_organization": "J Periodontal Res", "source_reference": "Haugen et al. 2026 — §2.6, citing Mangano 2022",
     "publication_year": 2026,
     "tip_text": "Custom HA/β-TCP onlay blocks designed from CBCT gave significant vertical and horizontal gains over 8 months with little trimming in surgery. They still only conduct bone, and they need imaging, cost and lead time. Consider adding an osteogenic component, and order early.",
     "tags": ["bone augmentation", "CAD-CAM", "custom block", "CBCT", "before placement"]},

    {"tip_id": "HAUGEN26_020", "title": "Log Every Graft Lot", "category": "Bone Augmentation",
     "phase": "Planning", "difficulty": "Beginner", "evidence_level": "Moderate",
     "source_organization": "J Periodontal Res", "source_reference": "Haugen et al. 2026 — §7.2 EU MDR post-market surveillance",
     "publication_year": 2026,
     "tip_text": "Most composite bone grafts are Class III devices under the EU MDR, which stresses post-market surveillance and tracing of biological origin. Record the brand, origin (autogenous, allogenic, xenogeneic or synthetic), lot and amount for every graft, as you do for implants.",
     "tags": ["bone augmentation", "traceability", "documentation", "regulatory"]},

    # ── During placement ──
    {"tip_id": "HAUGEN26_021", "title": "Lateral GBR: Technique Beats Material", "category": "Bone Augmentation",
     "phase": "Surgery", "difficulty": "Intermediate", "evidence_level": "High",
     "source_organization": "J Periodontal Res", "source_reference": "Haugen et al. 2026 — §4.4, citing Calciolari 2023 network meta-analysis",
     "publication_year": 2026,
     "tip_text": "Lateral GBR gains 3.5–5.5 mm. DBBM with a collagen membrane ranked best (SUCRA ~81%), and DBBM with autograft and a collagen membrane came a close second (~78%). Whatever the material, results depended most on primary closure, graft fixation and an intact membrane.",
     "tags": ["bone augmentation", "GBR", "lateral augmentation", "during placement"]},

    {"tip_id": "HAUGEN26_022", "title": "Vertical GBR: Mix, Don't Go Pure Autograft", "category": "Bone Augmentation",
     "phase": "Surgery", "difficulty": "Advanced", "evidence_level": "High",
     "source_organization": "J Periodontal Res", "source_reference": "Haugen et al. 2026 — §4.4, citing Merli 2020 Fence Technique RCT",
     "publication_year": 2026,
     "tip_text": "In a double-blind RCT, 50% DBBM with 50% autograft gained 3.7 mm of vertical bone versus 2.2 mm with 100% autograft (p = 0.038), with no more complications. The slowly resorbing xenograft keeps the volume that pure autograft loses.",
     "tags": ["bone augmentation", "vertical GBR", "composite graft", "during placement"]},

    {"tip_id": "HAUGEN26_023", "title": "Harvest Autograft Gently", "category": "Bone Augmentation",
     "phase": "Surgery", "difficulty": "Intermediate", "evidence_level": "Moderate",
     "source_organization": "J Periodontal Res", "source_reference": "Haugen et al. 2026 — §2.1, citing Miron 2013",
     "publication_year": 2026,
     "tip_text": "Bone cells survive better without mechanical trauma or drying out. Traumatic harvesting loses growth factors such as BMPs, TGF-β and VEGF and makes the graft resorb faster. Harvest gently, keep chips moist in blood or saline, and graft them quickly.",
     "tags": ["bone augmentation", "autograft harvesting", "cell viability", "during placement"]},

    {"tip_id": "HAUGEN26_024", "title": "No Micromovement Before Revascularisation", "category": "Bone Augmentation",
     "phase": "Surgery", "difficulty": "Intermediate", "evidence_level": "Moderate",
     "source_organization": "J Periodontal Res", "source_reference": "Haugen et al. 2026 — §4 and §4.4",
     "publication_year": 2026,
     "tip_text": "A ridge graft under a membrane must resist micromovement long before vessels reach it. Fix the membrane or mesh securely and immobilise the graft; together with tension-free primary closure, this drives GBR success more than the choice of material.",
     "tags": ["bone augmentation", "graft fixation", "membrane", "primary closure", "during placement"]},

    {"tip_id": "HAUGEN26_025", "title": "Keep the Scaffold Open for Vessels", "category": "Bone Augmentation",
     "phase": "Surgery", "difficulty": "Intermediate", "evidence_level": "Moderate",
     "source_organization": "J Periodontal Res", "source_reference": "Haugen et al. 2026 — §3.2 osteoconduction and §5",
     "publication_year": 2026,
     "tip_text": "Bone grows into a graft only where vessels can follow; pore sizes around 0.7–1.2 mm are considered optimal. Bulky or irregular grafts may not get enough blood to their core. Pack particulate firmly enough to stay put, but don't crush it into a dense mass.",
     "tags": ["bone augmentation", "porosity", "vascularisation", "during placement"]},

    {"tip_id": "HAUGEN26_026", "title": "Sinus Lift: Protect the Membrane", "category": "Bone Augmentation",
     "phase": "Surgery", "difficulty": "Intermediate", "evidence_level": "Moderate",
     "source_organization": "J Periodontal Res", "source_reference": "Haugen et al. 2026 — §4.3",
     "publication_year": 2026,
     "tip_text": "The lifted Schneiderian membrane forms a closed chamber with a good blood supply and its own bone-forming potential, and the graft only holds the space. Elevate gently and keep the membrane intact; given time, bone forms beneath it.",
     "tags": ["bone augmentation", "sinus lift", "Schneiderian membrane", "during placement"]},

    {"tip_id": "HAUGEN26_027", "title": "Add L-PRF to the Graft", "category": "Bone Augmentation",
     "phase": "Surgery", "difficulty": "Beginner", "evidence_level": "Moderate",
     "source_organization": "J Periodontal Res", "source_reference": "Haugen et al. 2026 — §2.5, citing Quirynen 2023 and Miron 2025",
     "publication_year": 2026,
     "tip_text": "L-PRF improves bone and soft-tissue healing in socket preservation and sinus augmentation. It is fully autologous and quick to prepare at the chair. Mixing xenograft with PRF (DBBM + PRF) adds growth factors to an otherwise inert scaffold.",
     "tags": ["bone augmentation", "L-PRF", "platelet concentrate", "during placement"]},

    {"tip_id": "HAUGEN26_028", "title": "Keep Inflammation in Check", "category": "Bone Augmentation",
     "phase": "Surgery", "difficulty": "Advanced", "evidence_level": "Low",
     "source_organization": "J Periodontal Res", "source_reference": "Haugen et al. 2026 — §3.4 osteoimmunology, citing Burgan 2025",
     "publication_year": 2026,
     "tip_text": "Healing needs a timely switch from inflammatory (M1) to reparative (M2) macrophages. Persistent inflammation leads to non-union, and too much M2 activity leads to fibrous tissue instead of bone. Minimal trauma, a clean field and a stable graft help this switch happen on time.",
     "tags": ["bone augmentation", "osteoimmunology", "inflammation", "during placement"]},
]
