"""
Narrow Ridge Suggest Endpoint Tests - Iteration 68
Tests for GET /api/implant-library/suggest with narrow_options, narrow_ridge_evaluation, narrow_ridge_warning
Tests for POST /api/implant-library/suggest-auto with narrow_ridge_blocked and narrow_ridge_evaluation
Tests for GET /api/implant-library/procedure-options with 'Narrow Ridge' procedure

Focus areas:
1. GET /api/implant-library/suggest — Returns narrow_options (array of implants <=3.5mm) when bone_width<6
2. GET /api/implant-library/suggest — Returns narrow_ridge_evaluation with classification and drilling_protocol_label when bone_type=D3
3. GET /api/implant-library/suggest — Returns narrow_ridge_warning when system has no narrow options
4. GET /api/implant-library/suggest — Returns NO narrow_options when bone_width>=6
5. GET /api/implant-library/suggest — narrow_ridge_evaluation.blocked=true when bone_width=2.5
6. POST /api/implant-library/suggest-auto — narrow_ridge_evaluation present when bone_width=4
7. POST /api/implant-library/suggest-auto — narrow_ridge_blocked=true when bone_width=2.5
8. POST /api/implant-library/suggest-auto — 'Narrow Ridge' as procedure works
9. GET /api/implant-library/procedure-options — 'Narrow Ridge' in procedures list
10. Verify narrow_options only contain implants with diameter <= 3.5mm
11. Verify narrow_ridge_evaluation includes recommendation.protocols array for moderate_narrow
12. Verify narrow_ridge_evaluation.recommendation.drilling_protocol_label present when bone_type is provided
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
    
    # ─── Feature 1: narrow_options returned when bone_width < 6 ───────────
    
    def test_osstem_ts3_narrow_options_returned_bone_width_4_tooth_21(self):
        """Test Osstem TS III returns narrow_options when bone_width=4, bone_type=D3, tooth=21"""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "system": "TS III",
                "brand": "Osstem",
                "bone_width": 4.0,
                "bone_height": 12.0,
                "bone_type": "D3",
                "tooth": "21"
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
        
        print(f"PASS: Osstem TS III returns {len(data['narrow_options'])} narrow_options (all <= 3.5mm) for bone_width=4, bone_type=D3, tooth=21")
    
    # ─── Feature 2: narrow_ridge_evaluation with classification and drilling_protocol_label ───
    
    def test_narrow_ridge_evaluation_with_bone_type_d3_drilling_protocol(self):
        """Test narrow_ridge_evaluation includes drilling_protocol_label when bone_type=D3"""
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
        assert nr_eval["classification_label"] == "Moderately Narrow Ridge", f"Expected 'Moderately Narrow Ridge' label"
        
        # Check drilling protocol for D3 bone
        assert "recommendation" in nr_eval, "Expected recommendation in narrow_ridge_evaluation"
        assert nr_eval["recommendation"]["drilling_protocol"] == "undersized_drilling", \
            f"Expected 'undersized_drilling' for D3 bone, got {nr_eval['recommendation'].get('drilling_protocol')}"
        assert "drilling_protocol_label" in nr_eval["recommendation"], \
            "Expected drilling_protocol_label in recommendation when bone_type is provided"
        assert "Undersized" in nr_eval["recommendation"]["drilling_protocol_label"], \
            f"Expected 'Undersized' in drilling_protocol_label, got {nr_eval['recommendation']['drilling_protocol_label']}"
        
        print("PASS: narrow_ridge_evaluation includes classification and drilling_protocol_label for D3 bone")
    
    # ─── Feature 3: narrow_ridge_warning when system has no narrow options ───
    
    def test_bredent_copa_sky_narrow_ridge_warning_bone_width_4(self):
        """Test Bredent Copa Sky returns narrow_ridge_warning when bone_width=4 (no narrow options)"""
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
        
        print(f"PASS: Bredent Copa Sky returns narrow_ridge_warning: {data['narrow_ridge_warning']}")
    
    # ─── Feature 4: NO narrow_options when bone_width >= 6 ───────────────
    
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
    
    # ─── Feature 5: narrow_ridge_evaluation.blocked=true when bone_width=2.5 ───
    
    def test_narrow_ridge_evaluation_blocked_true_bone_width_2_5(self):
        """Test narrow_ridge_evaluation.blocked=true when bone_width=2.5mm"""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "system": "TS III",
                "brand": "Osstem",
                "bone_width": 2.5,
                "bone_height": 12.0,
                "bone_type": "D3"
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Should have narrow_ridge_evaluation with blocked=true
        assert "narrow_ridge_evaluation" in data, "Expected narrow_ridge_evaluation when bone_width < 6"
        nr_eval = data["narrow_ridge_evaluation"]
        
        assert nr_eval["blocked"] == True, f"Expected blocked=True for bone_width=2.5mm, got {nr_eval['blocked']}"
        assert nr_eval["classification"] == "severe_narrow", f"Expected 'severe_narrow' for 2.5mm, got {nr_eval['classification']}"
        assert nr_eval["severity"] == "critical", f"Expected 'critical' severity for severe_narrow"
        
        # Should have severe_ridge warning
        warning_ids = [w["id"] for w in nr_eval.get("warnings", [])]
        assert "severe_ridge" in warning_ids, "Expected 'severe_ridge' warning for bone_width < 3mm"
        
        print("PASS: narrow_ridge_evaluation.blocked=true when bone_width=2.5mm")
    
    # ─── Feature 10: Verify narrow_options only contain implants with diameter <= 3.5mm ───
    
    def test_narrow_options_all_diameters_lte_3_5mm(self):
        """Verify all narrow_options have diameter <= 3.5mm"""
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
        
        for implant in data["narrow_options"]:
            assert implant["diameter"] <= 3.5, f"Found diameter {implant['diameter']} > 3.5mm in narrow_options"
        
        diameters = sorted(set(impl["diameter"] for impl in data["narrow_options"]))
        print(f"PASS: All narrow_options diameters <= 3.5mm: {diameters}")
    
    # ─── Feature 11: narrow_ridge_evaluation includes recommendation.protocols array for moderate_narrow ───
    
    def test_moderate_narrow_recommendation_protocols_array(self):
        """Test narrow_ridge_evaluation includes recommendation.protocols array for moderate_narrow"""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "system": "TS III",
                "brand": "Osstem",
                "bone_width": 4.0,  # moderate_narrow: 3-4.5mm
                "bone_height": 12.0
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "narrow_ridge_evaluation" in data
        nr_eval = data["narrow_ridge_evaluation"]
        
        assert nr_eval["classification"] == "moderate_narrow"
        assert "recommendation" in nr_eval
        assert "protocols" in nr_eval["recommendation"], "Expected 'protocols' array in recommendation for moderate_narrow"
        
        protocols = nr_eval["recommendation"]["protocols"]
        assert isinstance(protocols, list), "protocols should be a list"
        assert len(protocols) > 0, "protocols should not be empty for moderate_narrow"
        
        # moderate_narrow should have undersized_drilling, ridge_expansion, split_crest
        expected_protocols = ["undersized_drilling", "ridge_expansion", "split_crest"]
        for expected in expected_protocols:
            assert expected in protocols, f"Expected '{expected}' in protocols for moderate_narrow"
        
        print(f"PASS: moderate_narrow recommendation.protocols: {protocols}")
    
    # ─── Feature 12: drilling_protocol_label present when bone_type is provided ───
    
    def test_drilling_protocol_label_present_with_bone_type_d1(self):
        """Test drilling_protocol_label present when bone_type=D1"""
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
        nr_eval = data["narrow_ridge_evaluation"]
        
        assert "drilling_protocol_label" in nr_eval["recommendation"], \
            "Expected drilling_protocol_label when bone_type is provided"
        assert nr_eval["recommendation"]["drilling_protocol"] == "full_drilling"
        assert "Full" in nr_eval["recommendation"]["drilling_protocol_label"]
        
        print(f"PASS: D1 drilling_protocol_label: {nr_eval['recommendation']['drilling_protocol_label']}")
    
    def test_drilling_protocol_label_present_with_bone_type_d2(self):
        """Test drilling_protocol_label present when bone_type=D2"""
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
        nr_eval = data["narrow_ridge_evaluation"]
        
        assert "drilling_protocol_label" in nr_eval["recommendation"]
        assert nr_eval["recommendation"]["drilling_protocol"] == "slight_undersizing"
        
        print(f"PASS: D2 drilling_protocol_label: {nr_eval['recommendation']['drilling_protocol_label']}")
    
    def test_drilling_protocol_label_present_with_bone_type_d4(self):
        """Test drilling_protocol_label present when bone_type=D4"""
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
        nr_eval = data["narrow_ridge_evaluation"]
        
        assert "drilling_protocol_label" in nr_eval["recommendation"]
        assert nr_eval["recommendation"]["drilling_protocol"] == "osteotome_or_minimal_drilling"
        
        print(f"PASS: D4 drilling_protocol_label: {nr_eval['recommendation']['drilling_protocol_label']}")


class TestSuggestAutoNarrowRidge:
    """Tests for POST /api/implant-library/suggest-auto with narrow_ridge_blocked and narrow_ridge_evaluation"""
    
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
    
    # ─── Feature 6: narrow_ridge_evaluation present when bone_width=4 ───
    
    def test_narrow_ridge_evaluation_present_bone_width_4(self):
        """Test narrow_ridge_evaluation present in suggest-auto when bone_width=4"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            json={
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D3",
                "bone_width": 4.0,
                "bone_height": 12.0
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "narrow_ridge_evaluation" in data, "Expected narrow_ridge_evaluation in response"
        nr_eval = data["narrow_ridge_evaluation"]
        
        assert nr_eval["classification"] == "moderate_narrow", f"Expected 'moderate_narrow' for 4mm, got {nr_eval['classification']}"
        assert nr_eval["blocked"] == False
        
        # Should have drilling protocol for D3
        assert nr_eval["recommendation"]["drilling_protocol"] == "undersized_drilling"
        
        print("PASS: narrow_ridge_evaluation present when bone_width=4")
    
    # ─── Feature 7: narrow_ridge_blocked=true when bone_width=2.5 ───
    
    def test_narrow_ridge_blocked_true_bone_width_2_5(self):
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
    
    # ─── Feature 8: 'Narrow Ridge' as procedure works ───
    
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
        
        # Narrow Ridge should be in valid_procedures
        assert "Narrow Ridge" in data.get("valid_procedures", []), "Expected 'Narrow Ridge' in valid_procedures"
        
        print("PASS: 'Narrow Ridge' procedure option works correctly")
    
    def test_narrow_ridge_procedure_with_d3_bone(self):
        """Test 'Narrow Ridge' procedure with D3 bone type"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            json={
                "procedures": ["Narrow Ridge"],
                "bone_type": "D3",
                "bone_width": 4.0,
                "bone_height": 12.0
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "narrow_ridge_evaluation" in data
        nr_eval = data["narrow_ridge_evaluation"]
        
        # D3 should have undersized_drilling protocol
        assert nr_eval["recommendation"]["drilling_protocol"] == "undersized_drilling"
        
        print("PASS: 'Narrow Ridge' procedure with D3 bone type works")


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
    
    # ─── Feature 9: 'Narrow Ridge' in procedures list ───
    
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


class TestAdditionalNarrowRidgeScenarios:
    """Additional edge case tests for narrow ridge functionality"""
    
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
    
    def test_mild_narrow_classification_5mm(self):
        """Test mild_narrow classification for 5mm bone_width (4.5-6mm range)"""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "system": "TS III",
                "brand": "Osstem",
                "bone_width": 5.0,
                "bone_height": 12.0,
                "bone_type": "D2"
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "narrow_ridge_evaluation" in data
        nr_eval = data["narrow_ridge_evaluation"]
        
        assert nr_eval["classification"] == "mild_narrow", f"Expected 'mild_narrow' for 5mm, got {nr_eval['classification']}"
        assert nr_eval["classification_label"] == "Mildly Narrow Ridge"
        assert nr_eval["severity"] == "info"
        assert nr_eval["blocked"] == False
        
        print("PASS: mild_narrow classification for 5mm bone_width")
    
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
    
    def test_osstem_ms_narrow_options_verification(self):
        """Test Osstem MS narrow_options (MS has 2.0, 2.5, 3.0, 3.5mm diameters)"""
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
        
        for impl in data["narrow_options"]:
            assert impl["diameter"] <= 3.5, f"Found diameter {impl['diameter']} > 3.5mm in narrow_options"
        
        if data["narrow_options"]:
            diameters = sorted(set(impl["diameter"] for impl in data["narrow_options"]))
            print(f"PASS: Osstem MS narrow_options diameters: {diameters} (all <= 3.5mm)")
        else:
            print("INFO: Osstem MS returned empty narrow_options")
    
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
        
        # Without bone_type, drilling_protocol should NOT be present
        nr_eval = data["narrow_ridge_evaluation"]
        assert "drilling_protocol" not in nr_eval.get("recommendation", {}), \
            "drilling_protocol should NOT be present without bone_type"
        
        print("PASS: narrow_options returned without bone_type parameter")
    
    def test_suggest_auto_with_restricted_bone_height_and_narrow_ridge(self):
        """Test suggest-auto with restricted bone height still includes narrow_ridge_evaluation"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            json={
                "procedures": ["Restricted Bone Height"],
                "bone_type": "D3",
                "bone_width": 4.0,
                "bone_height": 8.0  # Restricted height
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Should have narrow_ridge_evaluation even with restricted bone height
        assert "narrow_ridge_evaluation" in data, "Expected narrow_ridge_evaluation with restricted bone height"
        assert data.get("restricted_bone_height") == True, "Expected restricted_bone_height=True"
        
        print("PASS: suggest-auto with restricted bone height includes narrow_ridge_evaluation")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
