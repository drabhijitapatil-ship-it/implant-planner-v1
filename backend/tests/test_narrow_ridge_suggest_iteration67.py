"""
Narrow Ridge Suggest Endpoint Tests - Iteration 67
Tests for GET /api/implant-library/suggest with narrow_options, narrow_ridge_warning, and bone_type parameter
Tests for POST /api/implant-library/suggest-auto with narrow_ridge_blocked and narrow_ridge_evaluation
Tests for GET /api/implant-library/procedure-options with 'Narrow Ridge' procedure
Verifies narrow_options contain only implants with diameter <= 3.5mm
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://implant-workflow-hub.preview.emergentagent.com"


class TestSuggestEndpointNarrowOptions:
    """Tests for GET /api/implant-library/suggest with narrow_options and narrow_ridge_warning"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": "Gaurav.pandey@student.dental.edu",
            "password": "Student@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.token = login_resp.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    # ─── Osstem TS III Tests (has narrow options: 3.0, 3.5mm) ───────────
    
    def test_osstem_ts3_narrow_options_returned_when_bone_width_less_than_6(self):
        """Test Osstem TS III returns narrow_options when bone_width=4 (< 6mm)"""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "system": "TS III",
                "brand": "Osstem",
                "bone_width": 4.0,
                "bone_height": 12.0,
                "bone_type": "D3"
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Should have narrow_options
        assert "narrow_options" in data, "Expected narrow_options in response when bone_width < 6"
        assert len(data["narrow_options"]) > 0, "Expected non-empty narrow_options for Osstem TS III"
        
        # Verify all narrow_options have diameter <= 3.5mm
        for implant in data["narrow_options"]:
            assert implant["diameter"] <= 3.5, f"narrow_options should only contain diameter <= 3.5mm, found {implant['diameter']}"
        
        # Should NOT have narrow_ridge_warning (since narrow options exist)
        assert "narrow_ridge_warning" not in data or data.get("narrow_ridge_warning") is None, \
            "Should NOT have narrow_ridge_warning when narrow_options exist"
        
        print(f"PASS: Osstem TS III returns {len(data['narrow_options'])} narrow_options (all <= 3.5mm)")
    
    def test_osstem_ts3_narrow_ridge_evaluation_with_bone_type_d3(self):
        """Test narrow_ridge_evaluation includes bone_density drilling protocol when bone_type=D3"""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "system": "TS III",
                "brand": "Osstem",
                "bone_width": 4.0,
                "bone_height": 12.0,
                "bone_type": "D3"
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Should have narrow_ridge_evaluation
        assert "narrow_ridge_evaluation" in data, "Expected narrow_ridge_evaluation when bone_width < 6"
        nr_eval = data["narrow_ridge_evaluation"]
        
        # Check classification (4.0mm is moderate_narrow: 3-4.5mm)
        assert nr_eval["classification"] == "moderate_narrow", f"Expected 'moderate_narrow' for 4mm, got {nr_eval['classification']}"
        
        # Check drilling protocol for D3 bone
        assert "recommendation" in nr_eval, "Expected recommendation in narrow_ridge_evaluation"
        assert nr_eval["recommendation"]["drilling_protocol"] == "undersized_drilling", \
            f"Expected 'undersized_drilling' for D3 bone, got {nr_eval['recommendation']['drilling_protocol']}"
        
        print("PASS: narrow_ridge_evaluation includes correct bone_density drilling protocol for D3")
    
    def test_osstem_ts3_narrow_options_diameters_verified(self):
        """Verify Osstem TS III narrow_options contain only 3.0 and 3.5mm diameters"""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "system": "TS III",
                "brand": "Osstem",
                "bone_width": 4.0,
                "bone_height": 12.0
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "narrow_options" in data, "Expected narrow_options"
        diameters = set(impl["diameter"] for impl in data["narrow_options"])
        
        # Osstem TS III has 3.0 and 3.5mm narrow diameters
        for d in diameters:
            assert d <= 3.5, f"Found diameter {d} > 3.5mm in narrow_options"
        
        print(f"PASS: Osstem TS III narrow_options diameters: {sorted(diameters)}")
    
    # ─── Bredent Copa Sky Tests (NO narrow options: 4.0, 5.0, 6.0mm) ────
    
    def test_bredent_copa_sky_narrow_ridge_warning_when_no_narrow_options(self):
        """Test Bredent Copa Sky returns narrow_ridge_warning when no narrow options available"""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "system": "Copa Sky",
                "brand": "Bredent",
                "bone_width": 4.0,
                "bone_height": 12.0
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Should have narrow_options (but empty)
        assert "narrow_options" in data, "Expected narrow_options key in response"
        assert len(data["narrow_options"]) == 0, f"Expected empty narrow_options for Bredent Copa Sky, got {len(data['narrow_options'])}"
        
        # Should have narrow_ridge_warning
        assert "narrow_ridge_warning" in data, "Expected narrow_ridge_warning when no narrow options"
        assert "Bredent Copa Sky" in data["narrow_ridge_warning"], "Warning should mention the system name"
        assert "≤3.5mm" in data["narrow_ridge_warning"] or "<=3.5mm" in data["narrow_ridge_warning"], \
            "Warning should mention narrow diameter threshold"
        
        print(f"PASS: Bredent Copa Sky returns narrow_ridge_warning: {data['narrow_ridge_warning']}")
    
    def test_bredent_copa_sky_still_has_narrow_ridge_evaluation(self):
        """Test Bredent Copa Sky still returns narrow_ridge_evaluation even without narrow options"""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "system": "Copa Sky",
                "brand": "Bredent",
                "bone_width": 4.0,
                "bone_height": 12.0
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Should still have narrow_ridge_evaluation
        assert "narrow_ridge_evaluation" in data, "Expected narrow_ridge_evaluation even without narrow options"
        assert data["narrow_ridge_evaluation"]["classification"] == "moderate_narrow"
        
        print("PASS: Bredent Copa Sky still returns narrow_ridge_evaluation")
    
    # ─── bone_width >= 6 Tests (NO narrow_options) ──────────────────────
    
    def test_no_narrow_options_when_bone_width_6_or_more(self):
        """Test NO narrow_options when bone_width >= 6mm"""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "system": "TS III",
                "brand": "Osstem",
                "bone_width": 7.0,
                "bone_height": 12.0
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Should NOT have narrow_options
        assert "narrow_options" not in data, "Should NOT have narrow_options when bone_width >= 6"
        
        # Should NOT have narrow_ridge_evaluation
        assert "narrow_ridge_evaluation" not in data, "Should NOT have narrow_ridge_evaluation when bone_width >= 6"
        
        # Should NOT have narrow_ridge_warning
        assert "narrow_ridge_warning" not in data, "Should NOT have narrow_ridge_warning when bone_width >= 6"
        
        print("PASS: No narrow_options/evaluation/warning when bone_width >= 6")
    
    def test_boundary_exactly_6mm_no_narrow_options(self):
        """Test exactly 6mm bone_width does NOT return narrow_options"""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "system": "TS III",
                "brand": "Osstem",
                "bone_width": 6.0,
                "bone_height": 12.0
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Exactly 6mm should NOT trigger narrow ridge logic
        assert "narrow_options" not in data, "Should NOT have narrow_options at exactly 6mm"
        assert "narrow_ridge_evaluation" not in data, "Should NOT have narrow_ridge_evaluation at exactly 6mm"
        
        print("PASS: Boundary 6mm does NOT return narrow_options")
    
    def test_boundary_5_99mm_has_narrow_options(self):
        """Test 5.99mm bone_width DOES return narrow_options"""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "system": "TS III",
                "brand": "Osstem",
                "bone_width": 5.99,
                "bone_height": 12.0
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # 5.99mm should trigger narrow ridge logic
        assert "narrow_options" in data, "Should have narrow_options at 5.99mm"
        assert "narrow_ridge_evaluation" in data, "Should have narrow_ridge_evaluation at 5.99mm"
        
        print("PASS: Boundary 5.99mm DOES return narrow_options")
    
    # ─── bone_type Parameter Tests ──────────────────────────────────────
    
    def test_bone_type_d1_drilling_protocol(self):
        """Test bone_type=D1 returns full_drilling protocol"""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "system": "TS III",
                "brand": "Osstem",
                "bone_width": 4.0,
                "bone_height": 12.0,
                "bone_type": "D1"
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "narrow_ridge_evaluation" in data
        assert data["narrow_ridge_evaluation"]["recommendation"]["drilling_protocol"] == "full_drilling"
        print("PASS: bone_type=D1 returns full_drilling protocol")
    
    def test_bone_type_d2_drilling_protocol(self):
        """Test bone_type=D2 returns slight_undersizing protocol"""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "system": "TS III",
                "brand": "Osstem",
                "bone_width": 4.0,
                "bone_height": 12.0,
                "bone_type": "D2"
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "narrow_ridge_evaluation" in data
        assert data["narrow_ridge_evaluation"]["recommendation"]["drilling_protocol"] == "slight_undersizing"
        print("PASS: bone_type=D2 returns slight_undersizing protocol")
    
    def test_bone_type_d4_drilling_protocol(self):
        """Test bone_type=D4 returns osteotome_or_minimal_drilling protocol"""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "system": "TS III",
                "brand": "Osstem",
                "bone_width": 4.0,
                "bone_height": 12.0,
                "bone_type": "D4"
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "narrow_ridge_evaluation" in data
        assert data["narrow_ridge_evaluation"]["recommendation"]["drilling_protocol"] == "osteotome_or_minimal_drilling"
        print("PASS: bone_type=D4 returns osteotome_or_minimal_drilling protocol")
    
    def test_no_bone_type_still_returns_narrow_options(self):
        """Test narrow_options returned even without bone_type parameter"""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "system": "TS III",
                "brand": "Osstem",
                "bone_width": 4.0,
                "bone_height": 12.0
                # No bone_type
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "narrow_options" in data, "Should have narrow_options even without bone_type"
        assert "narrow_ridge_evaluation" in data, "Should have narrow_ridge_evaluation even without bone_type"
        
        print("PASS: narrow_options returned without bone_type parameter")


class TestSuggestAutoNarrowRidgeBlocked:
    """Tests for POST /api/implant-library/suggest-auto with narrow_ridge_blocked"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": "Gaurav.pandey@student.dental.edu",
            "password": "Student@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.token = login_resp.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_narrow_ridge_blocked_true_when_bone_width_2_5mm(self):
        """Test narrow_ridge_blocked=true when bone_width=2.5mm (< 3mm)"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            json={
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D2",
                "bone_width": 2.5,
                "bone_height": 12.0
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert data.get("narrow_ridge_blocked") == True, f"Expected narrow_ridge_blocked=True, got {data.get('narrow_ridge_blocked')}"
        assert data.get("recommended_systems") == [], f"Expected empty recommended_systems when blocked"
        assert "narrow_ridge_evaluation" in data, "Expected narrow_ridge_evaluation in response"
        assert data["narrow_ridge_evaluation"]["blocked"] == True
        assert data["narrow_ridge_evaluation"]["classification"] == "severe_narrow"
        
        print("PASS: narrow_ridge_blocked=true when bone_width=2.5mm")
    
    def test_narrow_ridge_evaluation_in_response_when_bone_width_5mm(self):
        """Test narrow_ridge_evaluation included in response when bone_width=5mm"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            json={
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D2",
                "bone_width": 5.0,
                "bone_height": 12.0
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "narrow_ridge_evaluation" in data, "Expected narrow_ridge_evaluation in response"
        nr_eval = data["narrow_ridge_evaluation"]
        assert nr_eval["classification"] == "mild_narrow", f"Expected 'mild_narrow' for 5mm, got {nr_eval['classification']}"
        assert nr_eval["blocked"] == False
        assert data.get("narrow_ridge_blocked") is None or data.get("narrow_ridge_blocked") == False
        
        print("PASS: narrow_ridge_evaluation included when bone_width=5mm")
    
    def test_narrow_ridge_procedure_works(self):
        """Test 'Narrow Ridge' as a procedure option works correctly"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            json={
                "procedures": ["Narrow Ridge"],
                "bone_type": "D2",
                "bone_width": 4.0,
                "bone_height": 12.0
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Should not fail and should include narrow_ridge_evaluation
        assert "narrow_ridge_evaluation" in data, "Expected narrow_ridge_evaluation in response"
        assert "clinical_guidance" in data
        
        print("PASS: 'Narrow Ridge' procedure option works correctly")


class TestProcedureOptionsNarrowRidge:
    """Tests for GET /api/implant-library/procedure-options with 'Narrow Ridge'"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": "Gaurav.pandey@student.dental.edu",
            "password": "Student@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.token = login_resp.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_narrow_ridge_in_procedures_list(self):
        """Test 'Narrow Ridge' appears in procedures list"""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/procedure-options",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "procedures" in data, "Expected 'procedures' in response"
        assert "Narrow Ridge" in data["procedures"], f"Expected 'Narrow Ridge' in procedures list, got {data['procedures']}"
        
        # Also check compatibility info
        assert "compatibility" in data
        assert "Narrow Ridge" in data["compatibility"]
        assert data["compatibility"]["Narrow Ridge"]["allowedBone"] == ["D1", "D2", "D3", "D4"]
        
        print("PASS: 'Narrow Ridge' appears in procedures list with correct compatibility")


class TestNarrowOptionsVerification:
    """Tests to verify narrow_options only contain implants with diameter <= 3.5mm"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": "Gaurav.pandey@student.dental.edu",
            "password": "Student@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.token = login_resp.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_osstem_etiii_nh_narrow_options_all_lte_3_5mm(self):
        """Test Osstem ETIII NH narrow_options all have diameter <= 3.5mm"""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "system": "ETIII NH",
                "brand": "Osstem",
                "bone_width": 4.0,
                "bone_height": 12.0
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        if "narrow_options" in data and len(data["narrow_options"]) > 0:
            for impl in data["narrow_options"]:
                assert impl["diameter"] <= 3.5, f"Found diameter {impl['diameter']} > 3.5mm in narrow_options"
            diameters = sorted(set(impl["diameter"] for impl in data["narrow_options"]))
            print(f"PASS: Osstem ETIII NH narrow_options diameters: {diameters} (all <= 3.5mm)")
        else:
            print("INFO: Osstem ETIII NH has no narrow_options (may not have narrow diameters)")
    
    def test_osstem_ms_narrow_options_all_lte_3_5mm(self):
        """Test Osstem MS narrow_options all have diameter <= 3.5mm (MS has 2.0, 2.5, 3.0, 3.5)"""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "system": "MS",
                "brand": "Osstem",
                "bone_width": 4.0,
                "bone_height": 12.0
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "narrow_options" in data, "Expected narrow_options for Osstem MS"
        assert len(data["narrow_options"]) > 0, "Expected non-empty narrow_options for Osstem MS"
        
        for impl in data["narrow_options"]:
            assert impl["diameter"] <= 3.5, f"Found diameter {impl['diameter']} > 3.5mm in narrow_options"
        
        diameters = sorted(set(impl["diameter"] for impl in data["narrow_options"]))
        print(f"PASS: Osstem MS narrow_options diameters: {diameters} (all <= 3.5mm)")
    
    def test_biohorizons_narrow_diameter_system(self):
        """Test BioHorizons Narrow Diameter system narrow_options"""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "system": "Narrow Diameter",
                "brand": "BioHorizons",
                "bone_width": 4.0,
                "bone_height": 12.0
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "narrow_options" in data, "Expected narrow_options for BioHorizons Narrow Diameter"
        
        for impl in data["narrow_options"]:
            assert impl["diameter"] <= 3.5, f"Found diameter {impl['diameter']} > 3.5mm in narrow_options"
        
        if data["narrow_options"]:
            diameters = sorted(set(impl["diameter"] for impl in data["narrow_options"]))
            print(f"PASS: BioHorizons Narrow Diameter narrow_options diameters: {diameters}")
        else:
            print("INFO: BioHorizons Narrow Diameter returned empty narrow_options")


class TestEvaluateNarrowRidgeEndpoint:
    """Tests for POST /api/implant-library/evaluate-narrow-ridge endpoint (from iteration 66)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": "Gaurav.pandey@student.dental.edu",
            "password": "Student@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.token = login_resp.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_adequate_classification_6mm_plus(self):
        """Test adequate ridge classification (>=6mm)"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/evaluate-narrow-ridge",
            json={"ridge_width_mm": 7.0},
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert data["classification"] == "adequate"
        assert data["blocked"] == False
        print("PASS: Adequate classification (>=6mm)")
    
    def test_mild_narrow_classification_4_5_to_6mm(self):
        """Test mild narrow ridge classification (4.5-6mm)"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/evaluate-narrow-ridge",
            json={"ridge_width_mm": 5.0},
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert data["classification"] == "mild_narrow"
        assert data["blocked"] == False
        print("PASS: Mild narrow classification (4.5-6mm)")
    
    def test_moderate_narrow_classification_3_to_4_5mm(self):
        """Test moderate narrow ridge classification (3-4.5mm)"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/evaluate-narrow-ridge",
            json={"ridge_width_mm": 4.0},
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert data["classification"] == "moderate_narrow"
        assert data["blocked"] == False
        print("PASS: Moderate narrow classification (3-4.5mm)")
    
    def test_severe_narrow_classification_less_than_3mm(self):
        """Test severe narrow ridge classification (<3mm) - BLOCKED"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/evaluate-narrow-ridge",
            json={"ridge_width_mm": 2.5},
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert data["classification"] == "severe_narrow"
        assert data["blocked"] == True
        print("PASS: Severe narrow classification (<3mm) with blocked=True")
    
    def test_bone_envelope_warning(self):
        """Test bone_envelope warning when ridge_width - implant_diameter < 2"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/evaluate-narrow-ridge",
            json={"ridge_width_mm": 5.0, "implant_diameter_mm": 4.0},
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        warning_ids = [w["id"] for w in data["warnings"]]
        assert "bone_envelope" in warning_ids
        print("PASS: Bone envelope warning triggered")
    
    def test_prosthetic_narrow_in_molar_warning(self):
        """Test narrow_in_molar warning when diameter<=3.5 and molar region"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/evaluate-narrow-ridge",
            json={"ridge_width_mm": 5.0, "implant_diameter_mm": 3.5, "tooth": "36"},
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        warning_ids = [w["id"] for w in data["warnings"]]
        assert "narrow_in_molar" in warning_ids
        print("PASS: Narrow in molar warning triggered")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
