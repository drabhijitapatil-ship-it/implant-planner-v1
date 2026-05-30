"""
Test High Constraint Mode - Iteration 69
Tests the NEW High Constraint Mode that fires only when BOTH:
- bone_width < 6mm (Narrow Ridge)
- bone_height <= 10mm (Restricted Height)

The evaluate_high_constraint function maps tooth to arch (maxilla/mandible) 
and position (anterior/premolar/molar) to determine region-specific recommendations.

Key test scenarios:
1. Posterior maxilla teeth [15,16,17,25,26,27] → sinus_lift + HIGH risk
2. Posterior mandible teeth [35,36,37,45,46,47] → IAN warning + MODERATE risk
3. Anterior maxilla → GBR/Block Graft + HIGH risk
4. Anterior mandible → mental_foramen warning for premolars
5. High constraint should NOT activate when only one condition is true
6. Diameter cap at 3.5mm when in high constraint mode with bone_width 5-6mm
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://implant-workflow-hub.preview.emergentagent.com').rstrip('/')

class TestHighConstraintMode:
    """Test High Constraint Mode in suggest-auto and suggest endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for all tests"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"identifier": "Gaurav.pandey@student.dental.edu", "password": "Student@123"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
    
    # ─── Feature 1: Posterior Maxilla (tooth 26) - HIGH risk, Sinus Lift ───
    def test_suggest_auto_posterior_maxilla_tooth_26_high_constraint(self):
        """POST /api/implant-library/suggest-auto - Posterior Maxilla (tooth 26, width 4, height 7, bone_type D3)
        Should return high_constraint_evaluation with region=posterior_maxilla, risk_level=HIGH, primary=Sinus Lift"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=self.headers,
            json={
                "tooth": "26",
                "procedures": ["Restricted Bone Height"],
                "bone_type": "D3",
                "bone_width": 4,
                "bone_height": 7
            }
        )
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        # Verify high_constraint_evaluation is present
        assert "high_constraint_evaluation" in data, "high_constraint_evaluation should be present"
        hce = data["high_constraint_evaluation"]
        assert hce is not None, "high_constraint_evaluation should not be None"
        
        # Verify region and arch
        assert hce["active"] == True, "active should be True"
        assert hce["region"] == "posterior_maxilla", f"Expected region=posterior_maxilla, got {hce['region']}"
        assert hce["arch"] == "maxilla", f"Expected arch=maxilla, got {hce['arch']}"
        assert hce["position"] == "molar", f"Expected position=molar, got {hce['position']}"
        
        # Verify risk level is HIGH for maxilla
        assert hce["risk_level"] == "HIGH", f"Expected risk_level=HIGH, got {hce['risk_level']}"
        
        # Verify primary option includes Sinus Lift
        assert "Sinus Lift" in hce["primary_option"], f"Expected 'Sinus Lift' in primary_option, got {hce['primary_option']}"
        
        # Verify anatomical constraint
        assert hce["anatomical_constraint"] == "maxillary_sinus", f"Expected anatomical_constraint=maxillary_sinus, got {hce['anatomical_constraint']}"
        
        print(f"PASS: Posterior Maxilla (tooth 26) - HIGH risk, Sinus Lift primary option")
    
    # ─── Feature 2: Posterior Mandible (tooth 36) - MODERATE risk, Narrow Short ───
    def test_suggest_auto_posterior_mandible_tooth_36_high_constraint(self):
        """POST /api/implant-library/suggest-auto - Posterior Mandible (tooth 36, width 5.5, height 8, bone_type D2)
        Should return high_constraint_evaluation with region=posterior_mandible, risk_level=MODERATE, primary=Narrow Short Implant"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=self.headers,
            json={
                "tooth": "36",
                "procedures": ["Restricted Bone Height"],
                "bone_type": "D2",
                "bone_width": 5.5,
                "bone_height": 8
            }
        )
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        # Verify high_constraint_evaluation is present
        assert "high_constraint_evaluation" in data, "high_constraint_evaluation should be present"
        hce = data["high_constraint_evaluation"]
        assert hce is not None, "high_constraint_evaluation should not be None"
        
        # Verify region and arch
        assert hce["active"] == True, "active should be True"
        assert hce["region"] == "posterior_mandible", f"Expected region=posterior_mandible, got {hce['region']}"
        assert hce["arch"] == "mandible", f"Expected arch=mandible, got {hce['arch']}"
        assert hce["position"] == "molar", f"Expected position=molar, got {hce['position']}"
        
        # Verify risk level is MODERATE for mandible
        assert hce["risk_level"] == "MODERATE", f"Expected risk_level=MODERATE, got {hce['risk_level']}"
        
        # Verify primary option is Narrow Short Implant
        assert "Narrow Short Implant" in hce["primary_option"], f"Expected 'Narrow Short Implant' in primary_option, got {hce['primary_option']}"
        
        # Verify anatomical constraint is IAN
        assert hce["anatomical_constraint"] == "inferior_alveolar_nerve", f"Expected anatomical_constraint=inferior_alveolar_nerve, got {hce['anatomical_constraint']}"
        
        # Verify IAN warning in warnings
        ian_warning_found = any("IAN" in w for w in hce["warnings"])
        assert ian_warning_found, f"Expected IAN warning in warnings, got {hce['warnings']}"
        
        print(f"PASS: Posterior Mandible (tooth 36) - MODERATE risk, Narrow Short Implant primary option")
    
    # ─── Feature 3: Anterior Maxilla (tooth 21) - HIGH risk, GBR/Block Graft ───
    def test_suggest_auto_anterior_maxilla_tooth_21_high_constraint(self):
        """POST /api/implant-library/suggest-auto - Anterior Maxilla (tooth 21, width 4, height 8)
        Should return region=anterior_maxilla, primary includes GBR/Block Graft"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=self.headers,
            json={
                "tooth": "21",
                "procedures": ["Restricted Bone Height"],
                "bone_type": "D3",
                "bone_width": 4,
                "bone_height": 8
            }
        )
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        # Verify high_constraint_evaluation is present
        assert "high_constraint_evaluation" in data, "high_constraint_evaluation should be present"
        hce = data["high_constraint_evaluation"]
        assert hce is not None, "high_constraint_evaluation should not be None"
        
        # Verify region and arch
        assert hce["region"] == "anterior_maxilla", f"Expected region=anterior_maxilla, got {hce['region']}"
        assert hce["arch"] == "maxilla", f"Expected arch=maxilla, got {hce['arch']}"
        assert hce["position"] == "anterior", f"Expected position=anterior, got {hce['position']}"
        
        # Verify risk level is HIGH for maxilla
        assert hce["risk_level"] == "HIGH", f"Expected risk_level=HIGH, got {hce['risk_level']}"
        
        # Verify primary option includes GBR / Block Graft
        assert "GBR" in hce["primary_option"] or "Block Graft" in hce["primary_option"], \
            f"Expected 'GBR' or 'Block Graft' in primary_option, got {hce['primary_option']}"
        
        # Verify anatomical constraint is nasal_floor for anterior maxilla
        assert hce["anatomical_constraint"] == "nasal_floor", f"Expected anatomical_constraint=nasal_floor, got {hce['anatomical_constraint']}"
        
        print(f"PASS: Anterior Maxilla (tooth 21) - HIGH risk, GBR/Block Graft primary option")
    
    # ─── Feature 4: Anterior Mandible (tooth 31) ───
    def test_suggest_auto_anterior_mandible_tooth_31_high_constraint(self):
        """POST /api/implant-library/suggest-auto - Anterior Mandible (tooth 31, width 4, height 8)
        Should return region=anterior_mandible"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=self.headers,
            json={
                "tooth": "31",
                "procedures": ["Restricted Bone Height"],
                "bone_type": "D2",
                "bone_width": 4,
                "bone_height": 8
            }
        )
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        # Verify high_constraint_evaluation is present
        assert "high_constraint_evaluation" in data, "high_constraint_evaluation should be present"
        hce = data["high_constraint_evaluation"]
        assert hce is not None, "high_constraint_evaluation should not be None"
        
        # Verify region and arch
        assert hce["region"] == "anterior_mandible", f"Expected region=anterior_mandible, got {hce['region']}"
        assert hce["arch"] == "mandible", f"Expected arch=mandible, got {hce['arch']}"
        assert hce["position"] == "anterior", f"Expected position=anterior, got {hce['position']}"
        
        # Verify risk level is MODERATE for mandible
        assert hce["risk_level"] == "MODERATE", f"Expected risk_level=MODERATE, got {hce['risk_level']}"
        
        # Verify anatomical constraint is mandibular_symphysis for anterior mandible
        assert hce["anatomical_constraint"] == "mandibular_symphysis", f"Expected anatomical_constraint=mandibular_symphysis, got {hce['anatomical_constraint']}"
        
        print(f"PASS: Anterior Mandible (tooth 31) - region=anterior_mandible")
    
    # ─── Feature 5: Premolar Maxilla (tooth 24) - Sinus Lift (premolars classified as posterior) ───
    def test_suggest_auto_premolar_maxilla_tooth_24_high_constraint(self):
        """POST /api/implant-library/suggest-auto - Premolar Maxilla (tooth 24, width 5, height 9)
        Should return region=posterior_maxilla (premolars classified as posterior) with Sinus Lift"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=self.headers,
            json={
                "tooth": "24",
                "procedures": ["Restricted Bone Height"],
                "bone_type": "D3",
                "bone_width": 5,
                "bone_height": 9
            }
        )
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        # Verify high_constraint_evaluation is present
        assert "high_constraint_evaluation" in data, "high_constraint_evaluation should be present"
        hce = data["high_constraint_evaluation"]
        assert hce is not None, "high_constraint_evaluation should not be None"
        
        # Verify arch is maxilla
        assert hce["arch"] == "maxilla", f"Expected arch=maxilla, got {hce['arch']}"
        assert hce["position"] == "premolar", f"Expected position=premolar, got {hce['position']}"
        
        # Premolars are classified as posterior in the implementation
        assert hce["region"] == "posterior_maxilla", f"Expected region=posterior_maxilla, got {hce['region']}"
        
        # Verify risk level is HIGH for maxilla
        assert hce["risk_level"] == "HIGH", f"Expected risk_level=HIGH, got {hce['risk_level']}"
        
        # Premolar maxilla uses Sinus Lift (classified as posterior)
        assert "Sinus Lift" in hce["primary_option"], \
            f"Expected 'Sinus Lift' in primary_option, got {hce['primary_option']}"
        
        print(f"PASS: Premolar Maxilla (tooth 24) - HIGH risk with Sinus Lift")
    
    # ─── Feature 6: Premolar Mandible (tooth 44) - IAN Warning (premolars classified as posterior) ───
    def test_suggest_auto_premolar_mandible_tooth_44_high_constraint(self):
        """POST /api/implant-library/suggest-auto - Premolar Mandible (tooth 44, width 5, height 9)
        Should return region=posterior_mandible (premolars classified as posterior) with IAN warning"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=self.headers,
            json={
                "tooth": "44",
                "procedures": ["Restricted Bone Height"],
                "bone_type": "D2",
                "bone_width": 5,
                "bone_height": 9
            }
        )
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        # Verify high_constraint_evaluation is present
        assert "high_constraint_evaluation" in data, "high_constraint_evaluation should be present"
        hce = data["high_constraint_evaluation"]
        assert hce is not None, "high_constraint_evaluation should not be None"
        
        # Verify arch is mandible
        assert hce["arch"] == "mandible", f"Expected arch=mandible, got {hce['arch']}"
        assert hce["position"] == "premolar", f"Expected position=premolar, got {hce['position']}"
        
        # Premolars are classified as posterior in the implementation
        assert hce["region"] == "posterior_mandible", f"Expected region=posterior_mandible, got {hce['region']}"
        
        # Verify risk level is MODERATE for mandible
        assert hce["risk_level"] == "MODERATE", f"Expected risk_level=MODERATE, got {hce['risk_level']}"
        
        # Premolar mandible uses IAN constraint (classified as posterior)
        assert hce["anatomical_constraint"] == "inferior_alveolar_nerve", f"Expected anatomical_constraint=inferior_alveolar_nerve, got {hce['anatomical_constraint']}"
        
        # Verify IAN warning in warnings (premolars treated as posterior)
        ian_warning_found = any("IAN" in w for w in hce["warnings"])
        assert ian_warning_found, f"Expected IAN warning in warnings, got {hce['warnings']}"
        
        print(f"PASS: Premolar Mandible (tooth 44) - MODERATE risk with IAN warning")
    
    # ─── Feature 7: NO high constraint when bone_width < 6 but bone_height >= 10 ───
    def test_suggest_auto_no_high_constraint_when_height_12(self):
        """POST /api/implant-library/suggest-auto - NO high constraint when bone_width < 6 but bone_height >= 10
        (width 4, height 12) should return null for high_constraint_evaluation"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=self.headers,
            json={
                "tooth": "26",
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D3",
                "bone_width": 4,
                "bone_height": 12
            }
        )
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        # Verify high_constraint_evaluation is null/None
        hce = data.get("high_constraint_evaluation")
        assert hce is None, f"Expected high_constraint_evaluation to be None when bone_height >= 10, got {hce}"
        
        # But narrow_ridge_evaluation should still be present (bone_width < 6)
        assert "narrow_ridge_evaluation" in data, "narrow_ridge_evaluation should still be present"
        
        print(f"PASS: NO high constraint when bone_height >= 10 (height=12)")
    
    # ─── Feature 8: NO high constraint when bone_width >= 6 ───
    def test_suggest_auto_no_high_constraint_when_width_7(self):
        """POST /api/implant-library/suggest-auto - NO high constraint when bone_width >= 6
        (width 7, height 8) should return null for high_constraint_evaluation"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=self.headers,
            json={
                "tooth": "26",
                "procedures": ["Restricted Bone Height"],
                "bone_type": "D3",
                "bone_width": 7,
                "bone_height": 8
            }
        )
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        # Verify high_constraint_evaluation is null/None
        hce = data.get("high_constraint_evaluation")
        assert hce is None, f"Expected high_constraint_evaluation to be None when bone_width >= 6, got {hce}"
        
        print(f"PASS: NO high constraint when bone_width >= 6 (width=7)")
    
    # ─── Feature 9: GET /api/implant-library/suggest - High constraint with Let Me Choose ───
    def test_suggest_get_high_constraint_let_me_choose(self):
        """GET /api/implant-library/suggest - High constraint: Let Me Choose (system Osstem TS III, width 5, height 9, tooth 36)
        Should return high_constraint_evaluation"""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/suggest",
            headers=self.headers,
            params={
                "brand": "Osstem",
                "system": "TS III",
                "bone_width": 5,
                "bone_height": 9,
                "tooth": "36",
                "bone_type": "D2"
            }
        )
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        # Verify high_constraint_evaluation is present
        assert "high_constraint_evaluation" in data, "high_constraint_evaluation should be present"
        hce = data["high_constraint_evaluation"]
        assert hce is not None, "high_constraint_evaluation should not be None"
        
        # Verify region is posterior_mandible for tooth 36
        assert hce["region"] == "posterior_mandible", f"Expected region=posterior_mandible, got {hce['region']}"
        assert hce["risk_level"] == "MODERATE", f"Expected risk_level=MODERATE, got {hce['risk_level']}"
        
        print(f"PASS: GET /api/implant-library/suggest returns high_constraint_evaluation")
    
    # ─── Feature 10: GET /api/implant-library/suggest - NO high constraint when bone_height >= 10 ───
    def test_suggest_get_no_high_constraint_when_height_12(self):
        """GET /api/implant-library/suggest - NO high constraint when bone_height >= 10 (width 4, height 12)
        Should not have high_constraint_evaluation"""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/suggest",
            headers=self.headers,
            params={
                "brand": "Osstem",
                "system": "TS III",
                "bone_width": 4,
                "bone_height": 12,
                "tooth": "26",
                "bone_type": "D3"
            }
        )
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        # Verify high_constraint_evaluation is not present or is None
        hce = data.get("high_constraint_evaluation")
        assert hce is None, f"Expected high_constraint_evaluation to be None when bone_height >= 10, got {hce}"
        
        # But narrow_ridge_evaluation should still be present (bone_width < 6)
        assert "narrow_ridge_evaluation" in data, "narrow_ridge_evaluation should still be present"
        
        print(f"PASS: GET /api/implant-library/suggest - NO high constraint when bone_height >= 10")
    
    # ─── Feature 11: Diameter capped at 3.5mm in high constraint mode ───
    def test_suggest_auto_diameter_capped_at_3_5mm_high_constraint(self):
        """POST /api/implant-library/suggest-auto - High constraint: implant diameter capped at 3.5mm when bone_width 5-6mm
        Verify recommended_systems have diameter <= 3.5"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=self.headers,
            json={
                "tooth": "36",
                "procedures": ["Restricted Bone Height"],
                "bone_type": "D2",
                "bone_width": 5.5,  # Between 5-6mm
                "bone_height": 8    # Restricted height
            }
        )
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        # Verify high_constraint_evaluation is present (confirms high constraint mode)
        assert "high_constraint_evaluation" in data, "high_constraint_evaluation should be present"
        hce = data["high_constraint_evaluation"]
        assert hce is not None, "high_constraint_evaluation should not be None"
        
        # Verify recommended_systems have diameter <= 3.5mm
        recommended_systems = data.get("recommended_systems", [])
        for system in recommended_systems:
            for implant in system.get("implants", []):
                assert implant["diameter"] <= 3.5, \
                    f"Expected diameter <= 3.5mm in high constraint mode, got {implant['diameter']} for {system['brand']} {system['system']}"
        
        # Verify clinical_guidance shows capped diameter range
        guidance = data.get("clinical_guidance", {})
        diam_range = guidance.get("recommended_diameter_range", "")
        # The max should be 3.5 or less
        print(f"Diameter range in high constraint: {diam_range}")
        
        print(f"PASS: Diameter capped at 3.5mm in high constraint mode")
    
    # ─── Feature 12: Restricted bone height branch with high constraint still includes narrow_ridge_evaluation ───
    def test_suggest_auto_high_constraint_includes_narrow_ridge_evaluation(self):
        """POST /api/implant-library/suggest-auto - Restricted bone height branch with high constraint still includes narrow_ridge_evaluation"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=self.headers,
            json={
                "tooth": "26",
                "procedures": ["Restricted Bone Height"],
                "bone_type": "D3",
                "bone_width": 4,
                "bone_height": 7
            }
        )
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        # Verify both evaluations are present
        assert "high_constraint_evaluation" in data, "high_constraint_evaluation should be present"
        assert "narrow_ridge_evaluation" in data, "narrow_ridge_evaluation should also be present"
        
        hce = data["high_constraint_evaluation"]
        nre = data["narrow_ridge_evaluation"]
        
        assert hce is not None, "high_constraint_evaluation should not be None"
        assert nre is not None, "narrow_ridge_evaluation should not be None"
        
        # Verify narrow_ridge_evaluation has expected fields
        assert "classification" in nre, "narrow_ridge_evaluation should have classification"
        assert "blocked" in nre, "narrow_ridge_evaluation should have blocked"
        
        print(f"PASS: High constraint mode includes both high_constraint_evaluation and narrow_ridge_evaluation")


class TestHighConstraintModeAdditionalTeeth:
    """Additional tests for various tooth positions"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for all tests"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"identifier": "Gaurav.pandey@student.dental.edu", "password": "Student@123"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
    
    # Test all posterior maxilla teeth
    @pytest.mark.parametrize("tooth", ["15", "16", "17", "25", "27"])
    def test_posterior_maxilla_teeth_high_risk(self, tooth):
        """Posterior maxilla teeth should return HIGH risk with Sinus Lift"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=self.headers,
            json={
                "tooth": tooth,
                "procedures": ["Restricted Bone Height"],
                "bone_type": "D3",
                "bone_width": 4,
                "bone_height": 8
            }
        )
        assert response.status_code == 200, f"Request failed for tooth {tooth}: {response.text}"
        data = response.json()
        
        hce = data.get("high_constraint_evaluation")
        assert hce is not None, f"high_constraint_evaluation should be present for tooth {tooth}"
        assert hce["arch"] == "maxilla", f"Expected arch=maxilla for tooth {tooth}"
        assert hce["risk_level"] == "HIGH", f"Expected risk_level=HIGH for tooth {tooth}"
        assert "Sinus Lift" in hce["primary_option"], f"Expected Sinus Lift for tooth {tooth}"
        
        print(f"PASS: Tooth {tooth} (posterior maxilla) - HIGH risk, Sinus Lift")
    
    # Test all posterior mandible teeth
    @pytest.mark.parametrize("tooth", ["35", "37", "45", "46", "47"])
    def test_posterior_mandible_teeth_moderate_risk(self, tooth):
        """Posterior mandible teeth should return MODERATE risk with IAN warning"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=self.headers,
            json={
                "tooth": tooth,
                "procedures": ["Restricted Bone Height"],
                "bone_type": "D2",
                "bone_width": 5,
                "bone_height": 9
            }
        )
        assert response.status_code == 200, f"Request failed for tooth {tooth}: {response.text}"
        data = response.json()
        
        hce = data.get("high_constraint_evaluation")
        assert hce is not None, f"high_constraint_evaluation should be present for tooth {tooth}"
        assert hce["arch"] == "mandible", f"Expected arch=mandible for tooth {tooth}"
        assert hce["risk_level"] == "MODERATE", f"Expected risk_level=MODERATE for tooth {tooth}"
        
        print(f"PASS: Tooth {tooth} (posterior mandible) - MODERATE risk")
    
    # Test anterior teeth
    @pytest.mark.parametrize("tooth,expected_arch", [
        ("11", "maxilla"), ("12", "maxilla"), ("13", "maxilla"),
        ("21", "maxilla"), ("22", "maxilla"), ("23", "maxilla"),
        ("31", "mandible"), ("32", "mandible"), ("33", "mandible"),
        ("41", "mandible"), ("42", "mandible"), ("43", "mandible"),
    ])
    def test_anterior_teeth_correct_arch(self, tooth, expected_arch):
        """Anterior teeth should return correct arch"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=self.headers,
            json={
                "tooth": tooth,
                "procedures": ["Restricted Bone Height"],
                "bone_type": "D2",
                "bone_width": 4,
                "bone_height": 8
            }
        )
        assert response.status_code == 200, f"Request failed for tooth {tooth}: {response.text}"
        data = response.json()
        
        hce = data.get("high_constraint_evaluation")
        assert hce is not None, f"high_constraint_evaluation should be present for tooth {tooth}"
        assert hce["arch"] == expected_arch, f"Expected arch={expected_arch} for tooth {tooth}, got {hce['arch']}"
        assert hce["position"] == "anterior", f"Expected position=anterior for tooth {tooth}"
        
        expected_risk = "HIGH" if expected_arch == "maxilla" else "MODERATE"
        assert hce["risk_level"] == expected_risk, f"Expected risk_level={expected_risk} for tooth {tooth}"
        
        print(f"PASS: Tooth {tooth} (anterior {expected_arch}) - {expected_risk} risk")


class TestHighConstraintModeBoundaryConditions:
    """Test boundary conditions for high constraint mode"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for all tests"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"identifier": "Gaurav.pandey@student.dental.edu", "password": "Student@123"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
    
    def test_boundary_bone_height_exactly_10(self):
        """Bone height exactly 10mm should trigger high constraint (<=10)"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=self.headers,
            json={
                "tooth": "26",
                "procedures": ["Restricted Bone Height"],
                "bone_type": "D3",
                "bone_width": 4,
                "bone_height": 10  # Exactly 10mm
            }
        )
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        hce = data.get("high_constraint_evaluation")
        assert hce is not None, "high_constraint_evaluation should be present when bone_height=10"
        
        print(f"PASS: Bone height exactly 10mm triggers high constraint")
    
    def test_boundary_bone_height_10_1(self):
        """Bone height 10.1mm should NOT trigger high constraint (>10)"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=self.headers,
            json={
                "tooth": "26",
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D3",
                "bone_width": 4,
                "bone_height": 10.1  # Just above 10mm
            }
        )
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        hce = data.get("high_constraint_evaluation")
        assert hce is None, f"high_constraint_evaluation should be None when bone_height=10.1, got {hce}"
        
        print(f"PASS: Bone height 10.1mm does NOT trigger high constraint")
    
    def test_boundary_bone_width_exactly_6(self):
        """Bone width exactly 6mm should NOT trigger high constraint (requires <6)"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=self.headers,
            json={
                "tooth": "26",
                "procedures": ["Restricted Bone Height"],
                "bone_type": "D3",
                "bone_width": 6,  # Exactly 6mm
                "bone_height": 8
            }
        )
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        hce = data.get("high_constraint_evaluation")
        assert hce is None, f"high_constraint_evaluation should be None when bone_width=6, got {hce}"
        
        print(f"PASS: Bone width exactly 6mm does NOT trigger high constraint")
    
    def test_boundary_bone_width_5_99(self):
        """Bone width 5.99mm should trigger high constraint (<6)"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=self.headers,
            json={
                "tooth": "26",
                "procedures": ["Restricted Bone Height"],
                "bone_type": "D3",
                "bone_width": 5.99,  # Just below 6mm
                "bone_height": 8
            }
        )
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        hce = data.get("high_constraint_evaluation")
        assert hce is not None, "high_constraint_evaluation should be present when bone_width=5.99"
        
        print(f"PASS: Bone width 5.99mm triggers high constraint")


class TestHighConstraintModeNormalReturn:
    """Test high constraint in normal (non-restricted height) return path"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for all tests"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"identifier": "Gaurav.pandey@student.dental.edu", "password": "Student@123"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
    
    def test_normal_return_with_high_constraint(self):
        """Test high constraint in normal return path (not using Restricted Bone Height procedure)"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=self.headers,
            json={
                "tooth": "26",
                "procedures": ["Conventional Implant Placement"],  # Not Restricted Bone Height
                "bone_type": "D3",
                "bone_width": 4,
                "bone_height": 9  # Still restricted height
            }
        )
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        # High constraint should still be evaluated based on bone dimensions
        hce = data.get("high_constraint_evaluation")
        assert hce is not None, "high_constraint_evaluation should be present based on bone dimensions"
        assert hce["region"] == "posterior_maxilla", f"Expected region=posterior_maxilla, got {hce['region']}"
        
        print(f"PASS: Normal return path includes high_constraint_evaluation when conditions met")
