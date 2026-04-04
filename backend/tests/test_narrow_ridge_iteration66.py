"""
Narrow Ridge Clinical Decision Engine Tests - Iteration 66
Tests for POST /api/implant-library/evaluate-narrow-ridge endpoint
Tests for narrow_ridge_evaluation in suggest and suggest-auto endpoints
Tests for 'Narrow Ridge' procedure option
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://implant-workflow-hub.preview.emergentagent.com"


class TestNarrowRidgeEvaluateEndpoint:
    """Tests for POST /api/implant-library/evaluate-narrow-ridge endpoint"""
    
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
    
    # ─── Ridge Classification Tests (4 levels) ───────────────────────
    
    def test_adequate_ridge_classification_6mm_or_more(self):
        """Test adequate ridge classification (>=6mm)"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/evaluate-narrow-ridge",
            json={"ridge_width_mm": 7.0},
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert data["classification"] == "adequate", f"Expected 'adequate', got {data['classification']}"
        assert data["classification_label"] == "Adequate Ridge Width"
        assert data["clinical_action"] == "standard_implant"
        assert data["severity"] == "safe"
        assert data["blocked"] == False
        assert data["ridge_width_mm"] == 7.0
        print("PASS: Adequate ridge classification (>=6mm) works correctly")
    
    def test_mild_narrow_ridge_classification_4_5_to_6mm(self):
        """Test mild narrow ridge classification (4.5-6mm)"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/evaluate-narrow-ridge",
            json={"ridge_width_mm": 5.0},
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert data["classification"] == "mild_narrow", f"Expected 'mild_narrow', got {data['classification']}"
        assert data["classification_label"] == "Mildly Narrow Ridge"
        assert data["clinical_action"] == "standard_or_narrow"
        assert data["severity"] == "info"
        assert data["blocked"] == False
        print("PASS: Mild narrow ridge classification (4.5-6mm) works correctly")
    
    def test_moderate_narrow_ridge_classification_3_to_4_5mm(self):
        """Test moderate narrow ridge classification (3-4.5mm)"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/evaluate-narrow-ridge",
            json={"ridge_width_mm": 4.0},
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert data["classification"] == "moderate_narrow", f"Expected 'moderate_narrow', got {data['classification']}"
        assert data["classification_label"] == "Moderately Narrow Ridge"
        assert data["clinical_action"] == "narrow_or_expansion"
        assert data["severity"] == "warning"
        assert data["blocked"] == False
        print("PASS: Moderate narrow ridge classification (3-4.5mm) works correctly")
    
    def test_severe_narrow_ridge_classification_less_than_3mm(self):
        """Test severe narrow ridge classification (<3mm) - BLOCKED"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/evaluate-narrow-ridge",
            json={"ridge_width_mm": 2.5},
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert data["classification"] == "severe_narrow", f"Expected 'severe_narrow', got {data['classification']}"
        assert data["classification_label"] == "Severely Narrow Ridge"
        assert data["clinical_action"] == "augmentation_required"
        assert data["severity"] == "critical"
        assert data["blocked"] == True, "Expected blocked=True for severe narrow ridge"
        
        # Check for severe_ridge warning
        warning_ids = [w["id"] for w in data["warnings"]]
        assert "severe_ridge" in warning_ids, "Expected 'severe_ridge' warning"
        print("PASS: Severe narrow ridge classification (<3mm) works correctly with blocked=True")
    
    # ─── Safety Rules Tests ───────────────────────────────────────────
    
    def test_bone_envelope_warning_insufficient_clearance(self):
        """Test bone_envelope warning when ridge_width - implant_diameter < 2"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/evaluate-narrow-ridge",
            json={"ridge_width_mm": 5.0, "implant_diameter_mm": 4.0},
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # 5.0 - 4.0 = 1.0mm remaining, which is < 2mm
        warning_ids = [w["id"] for w in data["warnings"]]
        assert "bone_envelope" in warning_ids, f"Expected 'bone_envelope' warning, got {warning_ids}"
        
        bone_envelope_warning = next(w for w in data["warnings"] if w["id"] == "bone_envelope")
        assert bone_envelope_warning["severity"] == "high"
        assert "1.0mm remaining" in bone_envelope_warning["message"]
        print("PASS: Bone envelope warning triggered correctly")
    
    def test_severe_ridge_critical_warning_less_than_3mm(self):
        """Test severe_ridge critical warning when ridge_width < 3mm"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/evaluate-narrow-ridge",
            json={"ridge_width_mm": 2.8},
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        warning_ids = [w["id"] for w in data["warnings"]]
        assert "severe_ridge" in warning_ids, f"Expected 'severe_ridge' warning, got {warning_ids}"
        
        severe_warning = next(w for w in data["warnings"] if w["id"] == "severe_ridge")
        assert severe_warning["severity"] == "critical"
        assert "augmentation" in severe_warning["message"].lower()
        print("PASS: Severe ridge critical warning triggered correctly")
    
    # ─── Prosthetic Rules Tests ───────────────────────────────────────
    
    def test_narrow_in_molar_warning(self):
        """Test narrow_in_molar warning when diameter<=3.5 and molar region"""
        # Tooth 36 is a molar (FDI notation)
        response = requests.post(
            f"{BASE_URL}/api/implant-library/evaluate-narrow-ridge",
            json={"ridge_width_mm": 5.0, "implant_diameter_mm": 3.5, "tooth": "36"},
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        warning_ids = [w["id"] for w in data["warnings"]]
        assert "narrow_in_molar" in warning_ids, f"Expected 'narrow_in_molar' warning, got {warning_ids}"
        
        molar_warning = next(w for w in data["warnings"] if w["id"] == "narrow_in_molar")
        assert molar_warning["severity"] == "warning"
        assert "molar" in molar_warning["message"].lower()
        print("PASS: Narrow in molar warning triggered correctly")
    
    def test_splinting_needed_warning(self):
        """Test splinting_needed warning when diameter<=3.3 (requires tooth_region)"""
        # Note: splinting_needed warning requires both implant_diameter_mm AND tooth_region
        # Using tooth "21" (central incisor) to provide tooth_region
        response = requests.post(
            f"{BASE_URL}/api/implant-library/evaluate-narrow-ridge",
            json={"ridge_width_mm": 5.0, "implant_diameter_mm": 3.3, "tooth": "21"},
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        warning_ids = [w["id"] for w in data["warnings"]]
        assert "splinting_needed" in warning_ids, f"Expected 'splinting_needed' warning, got {warning_ids}"
        
        splinting_warning = next(w for w in data["warnings"] if w["id"] == "splinting_needed")
        assert splinting_warning["severity"] == "info"
        assert "splinting" in splinting_warning["message"].lower()
        print("PASS: Splinting needed warning triggered correctly")
    
    # ─── Bone Density Protocol Tests ──────────────────────────────────
    
    def test_bone_density_d1_protocol(self):
        """Test D1 bone density drilling protocol"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/evaluate-narrow-ridge",
            json={"ridge_width_mm": 6.0, "bone_density": "D1"},
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert data["recommendation"]["drilling_protocol"] == "full_drilling"
        assert "Full sequential drilling" in data["recommendation"]["drilling_protocol_label"]
        print("PASS: D1 bone density protocol mapping works correctly")
    
    def test_bone_density_d2_protocol(self):
        """Test D2 bone density drilling protocol"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/evaluate-narrow-ridge",
            json={"ridge_width_mm": 6.0, "bone_density": "D2"},
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert data["recommendation"]["drilling_protocol"] == "slight_undersizing"
        assert "undersizing" in data["recommendation"]["drilling_protocol_label"].lower()
        print("PASS: D2 bone density protocol mapping works correctly")
    
    def test_bone_density_d3_protocol(self):
        """Test D3 bone density drilling protocol"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/evaluate-narrow-ridge",
            json={"ridge_width_mm": 6.0, "bone_density": "D3"},
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert data["recommendation"]["drilling_protocol"] == "undersized_drilling"
        assert "undersized" in data["recommendation"]["drilling_protocol_label"].lower()
        print("PASS: D3 bone density protocol mapping works correctly")
    
    def test_bone_density_d4_protocol(self):
        """Test D4 bone density drilling protocol"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/evaluate-narrow-ridge",
            json={"ridge_width_mm": 6.0, "bone_density": "D4"},
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert data["recommendation"]["drilling_protocol"] == "osteotome_or_minimal_drilling"
        assert "osteotome" in data["recommendation"]["drilling_protocol_label"].lower()
        print("PASS: D4 bone density protocol mapping works correctly")
    
    # ─── Blocked Flow Test ────────────────────────────────────────────
    
    def test_blocked_true_when_ridge_less_than_3mm(self):
        """Test blocked=true when ridge_width < 3mm"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/evaluate-narrow-ridge",
            json={"ridge_width_mm": 2.9},
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert data["blocked"] == True, f"Expected blocked=True, got {data['blocked']}"
        assert data["recommendation"]["implant_type"] is None
        assert "GBR" in data["recommendation"]["protocols"] or "block_graft" in data["recommendation"]["protocols"]
        print("PASS: blocked=true when ridge_width < 3mm")
    
    # ─── Validation Tests ─────────────────────────────────────────────
    
    def test_missing_ridge_width_returns_400(self):
        """Test that missing ridge_width_mm returns 400 error"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/evaluate-narrow-ridge",
            json={},
            headers=self.headers
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("PASS: Missing ridge_width_mm returns 400")
    
    def test_zero_ridge_width_returns_400(self):
        """Test that ridge_width_mm=0 returns 400 error"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/evaluate-narrow-ridge",
            json={"ridge_width_mm": 0},
            headers=self.headers
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("PASS: Zero ridge_width_mm returns 400")


class TestSuggestAutoNarrowRidge:
    """Tests for narrow ridge evaluation in POST /api/implant-library/suggest-auto"""
    
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
    
    def test_narrow_ridge_blocked_flow_bone_width_2_5mm(self):
        """Test narrow ridge blocked flow: bone_width=2.5 returns narrow_ridge_blocked=true with empty recommended_systems"""
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
        assert data.get("recommended_systems") == [], f"Expected empty recommended_systems, got {data.get('recommended_systems')}"
        assert "narrow_ridge_evaluation" in data, "Expected narrow_ridge_evaluation in response"
        assert data["narrow_ridge_evaluation"]["blocked"] == True
        assert data["narrow_ridge_evaluation"]["classification"] == "severe_narrow"
        print("PASS: Narrow ridge blocked flow works correctly (bone_width=2.5mm)")
    
    def test_narrow_ridge_evaluation_included_in_normal_response(self):
        """Test narrow_ridge_evaluation is included in normal suggest-auto response (bone_width=5.0)"""
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
        assert nr_eval["classification"] == "mild_narrow", f"Expected 'mild_narrow', got {nr_eval['classification']}"
        assert nr_eval["blocked"] == False
        assert data.get("narrow_ridge_blocked") is None or data.get("narrow_ridge_blocked") == False
        print("PASS: Narrow ridge evaluation included in normal suggest-auto response")
    
    def test_narrow_ridge_procedure_option_works(self):
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


class TestSuggestEndpointNarrowRidge:
    """Tests for narrow_ridge_evaluation in GET /api/implant-library/suggest"""
    
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
    
    def test_narrow_ridge_evaluation_included_when_bone_width_less_than_6(self):
        """Test narrow_ridge_evaluation is included when bone_width < 6"""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "system": "Tapered Pro",
                "brand": "BioHorizons",
                "bone_width": 5.0,
                "bone_height": 12.0
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "narrow_ridge_evaluation" in data, "Expected narrow_ridge_evaluation when bone_width < 6"
        nr_eval = data["narrow_ridge_evaluation"]
        assert nr_eval["classification"] == "mild_narrow"
        print("PASS: narrow_ridge_evaluation included when bone_width < 6")
    
    def test_no_narrow_ridge_evaluation_when_bone_width_6_or_more(self):
        """Test no narrow_ridge_evaluation when bone_width >= 6"""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "system": "Tapered Pro",
                "brand": "BioHorizons",
                "bone_width": 7.0,
                "bone_height": 12.0
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # narrow_ridge_evaluation should NOT be present when bone_width >= 6
        assert "narrow_ridge_evaluation" not in data, f"Expected no narrow_ridge_evaluation when bone_width >= 6, but found it"
        print("PASS: No narrow_ridge_evaluation when bone_width >= 6")


class TestProcedureOptions:
    """Tests for GET /api/implant-library/procedure-options"""
    
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


class TestEdgeCases:
    """Edge case tests for narrow ridge evaluation"""
    
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
    
    def test_boundary_6mm_is_adequate(self):
        """Test boundary: exactly 6mm is adequate (not mild_narrow)"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/evaluate-narrow-ridge",
            json={"ridge_width_mm": 6.0},
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert data["classification"] == "adequate", f"Expected 'adequate' at 6mm, got {data['classification']}"
        print("PASS: Boundary 6mm is classified as adequate")
    
    def test_boundary_4_5mm_is_mild_narrow(self):
        """Test boundary: exactly 4.5mm is mild_narrow (not moderate_narrow)"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/evaluate-narrow-ridge",
            json={"ridge_width_mm": 4.5},
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert data["classification"] == "mild_narrow", f"Expected 'mild_narrow' at 4.5mm, got {data['classification']}"
        print("PASS: Boundary 4.5mm is classified as mild_narrow")
    
    def test_boundary_3mm_is_moderate_narrow(self):
        """Test boundary: exactly 3mm is moderate_narrow (not severe_narrow)"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/evaluate-narrow-ridge",
            json={"ridge_width_mm": 3.0},
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert data["classification"] == "moderate_narrow", f"Expected 'moderate_narrow' at 3mm, got {data['classification']}"
        assert data["blocked"] == False, "Expected blocked=False at exactly 3mm"
        print("PASS: Boundary 3mm is classified as moderate_narrow (not blocked)")
    
    def test_just_below_3mm_is_severe_narrow(self):
        """Test just below 3mm (2.99mm) is severe_narrow and blocked"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/evaluate-narrow-ridge",
            json={"ridge_width_mm": 2.99},
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert data["classification"] == "severe_narrow", f"Expected 'severe_narrow' at 2.99mm, got {data['classification']}"
        assert data["blocked"] == True, "Expected blocked=True at 2.99mm"
        print("PASS: Just below 3mm (2.99mm) is classified as severe_narrow and blocked")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
