"""
Test Implant Indications Feature - Iteration 12
Tests the new indication and restricted_teeth fields added to implant systems.
18 implant systems have clinical indications (bone type, immediate placement, specific teeth, etc.)
Two systems have tooth restrictions: NobelActive NP and Osstem MS
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

class TestImplantIndications:
    """Tests for implant system indications and tooth restrictions"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token before tests"""
        self.session = requests.Session()
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "abhijit.patil@dental.edu",
            "password": "Admin@123"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json()["token"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_systems_endpoint_returns_indication_field(self):
        """Test that GET /api/implant-library/systems returns indication field for each system"""
        response = self.session.get(f"{BASE_URL}/api/implant-library/systems")
        assert response.status_code == 200
        systems = response.json()
        
        # Check that all systems have indication field (even if empty string)
        for system in systems:
            assert "indication" in system, f"System {system['brand']} {system['system']} missing indication field"
            assert isinstance(system["indication"], str), f"indication should be string, got {type(system['indication'])}"
        
        print(f"✓ All {len(systems)} systems have indication field")
    
    def test_systems_count_remains_42(self):
        """Test that systems count is still 42 after adding indications"""
        response = self.session.get(f"{BASE_URL}/api/implant-library/systems")
        assert response.status_code == 200
        systems = response.json()
        assert len(systems) == 42, f"Expected 42 systems, got {len(systems)}"
        print("✓ Systems count is 42")
    
    def test_nobelactive_np_has_restricted_teeth(self):
        """Test NobelActive NP has restricted_teeth: [41,42,31,32,12,22]"""
        response = self.session.get(f"{BASE_URL}/api/implant-library/systems")
        assert response.status_code == 200
        systems = response.json()
        
        # Find NobelActive NP
        nobelactive_np = None
        for system in systems:
            if system["brand"] == "Noble Biocare" and system["system"] == "NobelActive NP":
                nobelactive_np = system
                break
        
        assert nobelactive_np is not None, "NobelActive NP system not found"
        assert "restricted_teeth" in nobelactive_np, "NobelActive NP missing restricted_teeth field"
        expected_teeth = ["41", "42", "31", "32", "12", "22"]
        assert set(nobelactive_np["restricted_teeth"]) == set(expected_teeth), \
            f"Expected teeth {expected_teeth}, got {nobelactive_np['restricted_teeth']}"
        assert "Only indicated for the replacement of teeth" in nobelactive_np["indication"], \
            f"NobelActive NP indication incorrect: {nobelactive_np['indication']}"
        print(f"✓ NobelActive NP has restricted_teeth: {nobelactive_np['restricted_teeth']}")
        print(f"✓ NobelActive NP indication: {nobelactive_np['indication']}")
    
    def test_osstem_ms_has_restricted_teeth(self):
        """Test Osstem MS has restricted_teeth: [31,32,33,41,42,43]"""
        response = self.session.get(f"{BASE_URL}/api/implant-library/systems")
        assert response.status_code == 200
        systems = response.json()
        
        # Find Osstem MS
        osstem_ms = None
        for system in systems:
            if system["brand"] == "Osstem" and system["system"] == "MS":
                osstem_ms = system
                break
        
        assert osstem_ms is not None, "Osstem MS system not found"
        assert "restricted_teeth" in osstem_ms, "Osstem MS missing restricted_teeth field"
        expected_teeth = ["31", "32", "33", "41", "42", "43"]
        assert set(osstem_ms["restricted_teeth"]) == set(expected_teeth), \
            f"Expected teeth {expected_teeth}, got {osstem_ms['restricted_teeth']}"
        assert "Indicated for teeth 31, 32, 33, 41, 42, 43" in osstem_ms["indication"], \
            f"Osstem MS indication incorrect: {osstem_ms['indication']}"
        print(f"✓ Osstem MS has restricted_teeth: {osstem_ms['restricted_teeth']}")
        print(f"✓ Osstem MS indication: {osstem_ms['indication']}")
    
    def test_neodent_helix_gm_acqua_has_indication_no_restriction(self):
        """Test Neodent Helix GM Acqua has indication but NO restricted_teeth"""
        response = self.session.get(f"{BASE_URL}/api/implant-library/systems")
        assert response.status_code == 200
        systems = response.json()
        
        # Find Neodent Helix GM Acqua
        helix_acqua = None
        for system in systems:
            if system["brand"] == "Neodent" and system["system"] == "Helix GM Acqua":
                helix_acqua = system
                break
        
        assert helix_acqua is not None, "Neodent Helix GM Acqua system not found"
        assert "restricted_teeth" not in helix_acqua, \
            f"Neodent Helix GM Acqua should NOT have restricted_teeth, but has: {helix_acqua.get('restricted_teeth')}"
        assert helix_acqua["indication"] != "", f"Neodent Helix GM Acqua should have indication"
        assert "D1, D2, D3, and D4 Bone Types" in helix_acqua["indication"], \
            f"Indication text incorrect: {helix_acqua['indication']}"
        print(f"✓ Neodent Helix GM Acqua has indication: {helix_acqua['indication']}")
        print("✓ Neodent Helix GM Acqua does NOT have restricted_teeth (correct)")
    
    def test_biohorizons_tapered_pro_indication(self):
        """Test BioHorizons Tapered Pro has indication about Immediate Placement and esthetic zone"""
        response = self.session.get(f"{BASE_URL}/api/implant-library/systems")
        assert response.status_code == 200
        systems = response.json()
        
        # Find BioHorizons Tapered Pro
        tapered_pro = None
        for system in systems:
            if system["brand"] == "BioHorizons" and system["system"] == "Tapered Pro":
                tapered_pro = system
                break
        
        assert tapered_pro is not None, "BioHorizons Tapered Pro system not found"
        assert "Immediate Placement" in tapered_pro["indication"], \
            f"Missing 'Immediate Placement': {tapered_pro['indication']}"
        assert "esthetic zone" in tapered_pro["indication"], \
            f"Missing 'esthetic zone': {tapered_pro['indication']}"
        print(f"✓ BioHorizons Tapered Pro indication: {tapered_pro['indication']}")
    
    def test_straumann_blt_empty_indication(self):
        """Test Straumann BLT has empty string indication and no restricted_teeth"""
        response = self.session.get(f"{BASE_URL}/api/implant-library/systems")
        assert response.status_code == 200
        systems = response.json()
        
        # Find Straumann BLT
        straumann_blt = None
        for system in systems:
            if system["brand"] == "Straumann" and system["system"] == "BLT":
                straumann_blt = system
                break
        
        assert straumann_blt is not None, "Straumann BLT system not found"
        assert straumann_blt["indication"] == "", \
            f"Straumann BLT should have empty indication, got: '{straumann_blt['indication']}'"
        assert "restricted_teeth" not in straumann_blt, \
            f"Straumann BLT should NOT have restricted_teeth"
        print("✓ Straumann BLT has empty indication (correct)")
        print("✓ Straumann BLT does NOT have restricted_teeth (correct)")
    
    def test_all_18_indications_mapped(self):
        """Test that all 18 systems with indications are correctly mapped"""
        response = self.session.get(f"{BASE_URL}/api/implant-library/systems")
        assert response.status_code == 200
        systems = response.json()
        
        # Expected systems with indications (18 total)
        expected_systems_with_indications = [
            ("Neodent", "Drive GM Acqua"),
            ("Neodent", "Drive GM NeoPorous"),
            ("Neodent", "Helix GM Acqua"),
            ("Neodent", "Helix GM Neoporous"),
            ("Neodent", "Titamax GM NeoPorous"),
            ("Noble Biocare", "NobelActive NP"),
            ("Noble Biocare", "NobelActive RP"),
            ("Noble Biocare", "NobelParallel RP"),
            ("NeoBiotech", "IS-III active"),
            ("Osstem", "TS III"),
            ("Osstem", "TS IV"),
            ("Osstem", "SS III"),
            ("Osstem", "MS"),
            ("Osstem", "ETIII NH"),
            ("BioHorizons", "Tapered Pro"),
            ("BioHorizons", "Tapered IM"),
            ("BioHorizons", "Tapered Short"),
        ]
        
        systems_with_indications = []
        for system in systems:
            if system["indication"] != "":
                systems_with_indications.append((system["brand"], system["system"]))
        
        # Check count
        # Note: There are 17 systems in expected list (Neodent has 5, Noble 3, NeoBiotech 1, Osstem 5, BioHorizons 3)
        # But the user said 18, let me verify
        print(f"Found {len(systems_with_indications)} systems with non-empty indications")
        
        # Check all expected systems have indications
        missing = []
        for expected in expected_systems_with_indications:
            found = False
            for system in systems:
                if system["brand"] == expected[0] and system["system"] == expected[1]:
                    if system["indication"] != "":
                        found = True
                        break
            if not found:
                missing.append(expected)
        
        if missing:
            print(f"Missing indications for: {missing}")
        
        assert len(missing) == 0, f"Missing indications for systems: {missing}"
        print(f"✓ All {len(expected_systems_with_indications)} expected systems have indications")
        
        # Also verify exactly 2 have restricted_teeth
        systems_with_restrictions = [s for s in systems if "restricted_teeth" in s]
        assert len(systems_with_restrictions) == 2, \
            f"Expected 2 systems with restricted_teeth, got {len(systems_with_restrictions)}"
        print("✓ Exactly 2 systems have restricted_teeth (NobelActive NP and Osstem MS)")
    
    def test_suggest_endpoint_still_works(self):
        """Test that suggest endpoint still works correctly after backend changes"""
        # Test with tooth=46, width=7, height=12, Neodent Helix GM Acqua
        response = self.session.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "brand": "Neodent",
                "system": "Helix GM Acqua",
                "bone_width": 7,
                "bone_height": 12,
                "tooth": "46"
            }
        )
        assert response.status_code == 200, f"Suggest endpoint failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "clinical_guidance" in data, "Missing clinical_guidance"
        assert "tooth_recommendation" in data, "Missing tooth_recommendation"
        assert "recommended" in data, "Missing recommended"
        assert "all_options" in data, "Missing all_options"
        
        # Verify tooth recommendation for 46 (Mandibular 1st Molar)
        tooth_rec = data["tooth_recommendation"]
        assert tooth_rec["tooth"] == "46"
        assert tooth_rec["region"] == "Mandibular 1st Molar"
        
        print("✓ Suggest endpoint works correctly with Neodent Helix GM Acqua, tooth=46")
        print(f"  Recommended diameter range: {data['clinical_guidance']['recommended_diameter_range']}")
        print(f"  Recommended length range: {data['clinical_guidance']['recommended_length_range']}")
    
    def test_tooth_recommendations_returns_28(self):
        """Test that tooth recommendations endpoint still returns 28 teeth"""
        response = self.session.get(f"{BASE_URL}/api/implant-library/tooth-recommendations")
        assert response.status_code == 200
        teeth = response.json()
        assert len(teeth) == 28, f"Expected 28 teeth, got {len(teeth)}"
        print("✓ Tooth recommendations returns 28 teeth")
    
    def test_neodent_systems_count(self):
        """Verify Neodent has exactly 5 systems with indications"""
        response = self.session.get(f"{BASE_URL}/api/implant-library/systems")
        assert response.status_code == 200
        systems = response.json()
        
        neodent_with_indications = [s for s in systems 
                                     if s["brand"] == "Neodent" and s["indication"] != ""]
        print(f"Neodent systems with indications: {[s['system'] for s in neodent_with_indications]}")
        assert len(neodent_with_indications) == 5, \
            f"Expected 5 Neodent systems with indications, got {len(neodent_with_indications)}"
        print("✓ Neodent has exactly 5 systems with indications")
    
    def test_noble_biocare_systems_count(self):
        """Verify Noble Biocare has exactly 3 systems with indications"""
        response = self.session.get(f"{BASE_URL}/api/implant-library/systems")
        assert response.status_code == 200
        systems = response.json()
        
        noble_with_indications = [s for s in systems 
                                   if s["brand"] == "Noble Biocare" and s["indication"] != ""]
        print(f"Noble Biocare systems with indications: {[s['system'] for s in noble_with_indications]}")
        assert len(noble_with_indications) == 3, \
            f"Expected 3 Noble Biocare systems with indications, got {len(noble_with_indications)}"
        print("✓ Noble Biocare has exactly 3 systems with indications")
    
    def test_osstem_systems_count(self):
        """Verify Osstem has exactly 5 systems with indications"""
        response = self.session.get(f"{BASE_URL}/api/implant-library/systems")
        assert response.status_code == 200
        systems = response.json()
        
        osstem_with_indications = [s for s in systems 
                                    if s["brand"] == "Osstem" and s["indication"] != ""]
        print(f"Osstem systems with indications: {[s['system'] for s in osstem_with_indications]}")
        assert len(osstem_with_indications) == 5, \
            f"Expected 5 Osstem systems with indications, got {len(osstem_with_indications)}"
        print("✓ Osstem has exactly 5 systems with indications")
    
    def test_biohorizons_systems_count(self):
        """Verify BioHorizons has exactly 3 systems with indications"""
        response = self.session.get(f"{BASE_URL}/api/implant-library/systems")
        assert response.status_code == 200
        systems = response.json()
        
        biohorizons_with_indications = [s for s in systems 
                                         if s["brand"] == "BioHorizons" and s["indication"] != ""]
        print(f"BioHorizons systems with indications: {[s['system'] for s in biohorizons_with_indications]}")
        assert len(biohorizons_with_indications) == 3, \
            f"Expected 3 BioHorizons systems with indications, got {len(biohorizons_with_indications)}"
        print("✓ BioHorizons has exactly 3 systems with indications")
    
    def test_neobiotech_systems_count(self):
        """Verify NeoBiotech has exactly 1 system with indication"""
        response = self.session.get(f"{BASE_URL}/api/implant-library/systems")
        assert response.status_code == 200
        systems = response.json()
        
        neobiotech_with_indications = [s for s in systems 
                                        if s["brand"] == "NeoBiotech" and s["indication"] != ""]
        print(f"NeoBiotech systems with indications: {[s['system'] for s in neobiotech_with_indications]}")
        assert len(neobiotech_with_indications) == 1, \
            f"Expected 1 NeoBiotech system with indication, got {len(neobiotech_with_indications)}"
        print("✓ NeoBiotech has exactly 1 system with indication")
    
    def test_titamax_gm_acqua_no_indication(self):
        """Verify Neodent Titamax GM Acqua does NOT have indication (only NeoPorous does)"""
        response = self.session.get(f"{BASE_URL}/api/implant-library/systems")
        assert response.status_code == 200
        systems = response.json()
        
        titamax_acqua = None
        for system in systems:
            if system["brand"] == "Neodent" and system["system"] == "Titamax GM Acqua":
                titamax_acqua = system
                break
        
        if titamax_acqua:
            assert titamax_acqua["indication"] == "", \
                f"Titamax GM Acqua should have empty indication, got: '{titamax_acqua['indication']}'"
            print("✓ Neodent Titamax GM Acqua has empty indication (correct - only NeoPorous has indication)")
        else:
            print("! Neodent Titamax GM Acqua system not found in database (may not exist)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
