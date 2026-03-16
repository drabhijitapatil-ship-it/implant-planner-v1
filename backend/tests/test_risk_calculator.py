"""
Iteration 14: Implant Risk Calculator Tests
Tests for POST /api/implant-library/calculate-risk endpoint

Scoring Rules:
- Width Risk: remaining_width = bone_width - implant_diameter
  - >=3 → score 1 (Low), >=2 → score 2 (Moderate), <2 → score 3 (High)
- Height Risk: remaining_height = bone_height - implant_length
  - >=3 → score 1 (Low), >=2 → score 2 (Moderate), <2 → score 3 (High)
- Bone Density: D1=1, D2=1, D3=2, D4=3
- Procedure: Conventional=1, Conventional+Graft=2, Immediate=2, Immediate+Graft=2, Sinus Lift=3, Restricted Bone Height=3
- Tooth Position: Anterior(1,2,3)=1, Premolar(4,5)=2, Molar(6,7)=3

Total Score 5-15, Risk Levels: Low(5-7), Moderate(8-11), High(12-15)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://implant-phase1.preview.emergentagent.com')


class TestRiskCalculator:
    """Risk Calculator endpoint tests"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "abhijit.patil@dental.edu",
            "password": "Admin@123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json().get("token")

    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Return headers with auth token"""
        return {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }

    # ── Test Case 1: High Risk Example from Spec ──
    def test_high_risk_case_example(self, auth_headers):
        """
        Example case from spec: bone_width=7, bone_height=12, implant_diameter=4.3, 
        implant_length=11.5, bone_type=D3, procedure=Immediate Implant Placement, tooth=46
        Expected: total_score=12, risk_level=High, color=red
        """
        payload = {
            "bone_width": 7,
            "bone_height": 12,
            "implant_diameter": 4.3,
            "implant_length": 11.5,
            "bone_type": "D3",
            "procedure": "Immediate Implant Placement",
            "tooth": "46"
        }
        response = requests.post(f"{BASE_URL}/api/implant-library/calculate-risk", 
                                 json=payload, headers=auth_headers)
        
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        # Width: 7 - 4.3 = 2.7, >=2 → score 2
        # Height: 12 - 11.5 = 0.5, <2 → score 3
        # Density: D3 → score 2
        # Procedure: Immediate Implant Placement → score 2
        # Tooth: 46 (unit digit 6, Molar) → score 3
        # Total: 2 + 3 + 2 + 2 + 3 = 12 → High risk
        
        assert data["total_score"] == 12, f"Expected total_score=12, got {data['total_score']}"
        assert data["risk_level"] == "High", f"Expected risk_level=High, got {data['risk_level']}"
        assert data["color"] == "red", f"Expected color=red, got {data['color']}"
        print("✓ High risk example case passed: score=12, risk=High, color=red")

    # ── Test Case 2: Width Risk Calculation (remaining >= 2) ──
    def test_width_risk_moderate(self, auth_headers):
        """
        Width: bone_width=7, implant_diameter=4.3 → remaining=2.7 → >=2 → score=2
        """
        payload = {
            "bone_width": 7,
            "bone_height": 15,  # High enough for low height risk
            "implant_diameter": 4.3,
            "implant_length": 10,
            "bone_type": "D1",  # Low density risk
            "procedure": "Conventional Implant Placement",  # Low procedure risk
            "tooth": "11"  # Anterior, low tooth risk
        }
        response = requests.post(f"{BASE_URL}/api/implant-library/calculate-risk", 
                                 json=payload, headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Find width factor
        width_factor = next((f for f in data["factors"] if f["factor"] == "Bone Width"), None)
        assert width_factor is not None, "Width factor not found"
        assert width_factor["remaining"] == 2.7, f"Expected remaining=2.7, got {width_factor['remaining']}"
        assert width_factor["score"] == 2, f"Expected score=2, got {width_factor['score']}"
        print(f"✓ Width risk (2.7mm remaining) → score=2 (Moderate)")

    # ── Test Case 3: Height Risk Calculation (remaining < 2) ──
    def test_height_risk_high(self, auth_headers):
        """
        Height: bone_height=12, implant_length=11.5 → remaining=0.5 → <2 → score=3
        """
        payload = {
            "bone_width": 10,
            "bone_height": 12,
            "implant_diameter": 4.0,
            "implant_length": 11.5,
            "bone_type": "D1",
            "procedure": "Conventional Implant Placement",
            "tooth": "11"
        }
        response = requests.post(f"{BASE_URL}/api/implant-library/calculate-risk", 
                                 json=payload, headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        
        height_factor = next((f for f in data["factors"] if f["factor"] == "Bone Height"), None)
        assert height_factor is not None, "Height factor not found"
        assert height_factor["remaining"] == 0.5, f"Expected remaining=0.5, got {height_factor['remaining']}"
        assert height_factor["score"] == 3, f"Expected score=3, got {height_factor['score']}"
        print(f"✓ Height risk (0.5mm remaining) → score=3 (High)")

    # ── Test Case 4: Bone Density Scores ──
    def test_bone_density_d1(self, auth_headers):
        """D1 = score 1"""
        payload = {
            "bone_width": 10, "bone_height": 15, "implant_diameter": 4.0, 
            "implant_length": 10, "bone_type": "D1", 
            "procedure": "Conventional Implant Placement", "tooth": "11"
        }
        response = requests.post(f"{BASE_URL}/api/implant-library/calculate-risk", 
                                 json=payload, headers=auth_headers)
        data = response.json()
        density_factor = next((f for f in data["factors"] if f["factor"] == "Bone Density"), None)
        assert density_factor["score"] == 1, f"D1 expected score=1, got {density_factor['score']}"
        print("✓ D1 bone density → score=1")

    def test_bone_density_d2(self, auth_headers):
        """D2 = score 1"""
        payload = {
            "bone_width": 10, "bone_height": 15, "implant_diameter": 4.0, 
            "implant_length": 10, "bone_type": "D2", 
            "procedure": "Conventional Implant Placement", "tooth": "11"
        }
        response = requests.post(f"{BASE_URL}/api/implant-library/calculate-risk", 
                                 json=payload, headers=auth_headers)
        data = response.json()
        density_factor = next((f for f in data["factors"] if f["factor"] == "Bone Density"), None)
        assert density_factor["score"] == 1, f"D2 expected score=1, got {density_factor['score']}"
        print("✓ D2 bone density → score=1")

    def test_bone_density_d3(self, auth_headers):
        """D3 = score 2"""
        payload = {
            "bone_width": 10, "bone_height": 15, "implant_diameter": 4.0, 
            "implant_length": 10, "bone_type": "D3", 
            "procedure": "Conventional Implant Placement", "tooth": "11"
        }
        response = requests.post(f"{BASE_URL}/api/implant-library/calculate-risk", 
                                 json=payload, headers=auth_headers)
        data = response.json()
        density_factor = next((f for f in data["factors"] if f["factor"] == "Bone Density"), None)
        assert density_factor["score"] == 2, f"D3 expected score=2, got {density_factor['score']}"
        print("✓ D3 bone density → score=2")

    def test_bone_density_d4(self, auth_headers):
        """D4 = score 3"""
        payload = {
            "bone_width": 10, "bone_height": 15, "implant_diameter": 4.0, 
            "implant_length": 10, "bone_type": "D4", 
            "procedure": "Conventional Implant Placement", "tooth": "11"
        }
        response = requests.post(f"{BASE_URL}/api/implant-library/calculate-risk", 
                                 json=payload, headers=auth_headers)
        data = response.json()
        density_factor = next((f for f in data["factors"] if f["factor"] == "Bone Density"), None)
        assert density_factor["score"] == 3, f"D4 expected score=3, got {density_factor['score']}"
        print("✓ D4 bone density → score=3")

    # ── Test Case 5: Procedure Risk Scores ──
    def test_procedure_conventional(self, auth_headers):
        """Conventional Implant Placement = score 1"""
        payload = {
            "bone_width": 10, "bone_height": 15, "implant_diameter": 4.0, 
            "implant_length": 10, "bone_type": "D1", 
            "procedure": "Conventional Implant Placement", "tooth": "11"
        }
        response = requests.post(f"{BASE_URL}/api/implant-library/calculate-risk", 
                                 json=payload, headers=auth_headers)
        data = response.json()
        proc_factor = next((f for f in data["factors"] if f["factor"] == "Procedure"), None)
        assert proc_factor["score"] == 1, f"Conventional expected score=1, got {proc_factor['score']}"
        print("✓ Conventional Implant Placement → score=1")

    def test_procedure_immediate(self, auth_headers):
        """Immediate Implant Placement = score 2"""
        payload = {
            "bone_width": 10, "bone_height": 15, "implant_diameter": 4.0, 
            "implant_length": 10, "bone_type": "D1", 
            "procedure": "Immediate Implant Placement", "tooth": "11"
        }
        response = requests.post(f"{BASE_URL}/api/implant-library/calculate-risk", 
                                 json=payload, headers=auth_headers)
        data = response.json()
        proc_factor = next((f for f in data["factors"] if f["factor"] == "Procedure"), None)
        assert proc_factor["score"] == 2, f"Immediate expected score=2, got {proc_factor['score']}"
        print("✓ Immediate Implant Placement → score=2")

    def test_procedure_sinus_lift(self, auth_headers):
        """Sinus Lift = score 3"""
        payload = {
            "bone_width": 10, "bone_height": 15, "implant_diameter": 4.0, 
            "implant_length": 10, "bone_type": "D1", 
            "procedure": "Sinus Lift", "tooth": "11"
        }
        response = requests.post(f"{BASE_URL}/api/implant-library/calculate-risk", 
                                 json=payload, headers=auth_headers)
        data = response.json()
        proc_factor = next((f for f in data["factors"] if f["factor"] == "Procedure"), None)
        assert proc_factor["score"] == 3, f"Sinus Lift expected score=3, got {proc_factor['score']}"
        print("✓ Sinus Lift → score=3")

    def test_procedure_restricted_bone_height(self, auth_headers):
        """Restricted Bone Height = score 3"""
        payload = {
            "bone_width": 10, "bone_height": 15, "implant_diameter": 4.0, 
            "implant_length": 10, "bone_type": "D1", 
            "procedure": "Restricted Bone Height", "tooth": "11"
        }
        response = requests.post(f"{BASE_URL}/api/implant-library/calculate-risk", 
                                 json=payload, headers=auth_headers)
        data = response.json()
        proc_factor = next((f for f in data["factors"] if f["factor"] == "Procedure"), None)
        assert proc_factor["score"] == 3, f"Restricted Bone Height expected score=3, got {proc_factor['score']}"
        print("✓ Restricted Bone Height → score=3")

    # ── Test Case 6: Tooth Position Scores ──
    def test_tooth_position_molar(self, auth_headers):
        """Tooth 46 (unit digit 6) = Molar = score 3"""
        payload = {
            "bone_width": 10, "bone_height": 15, "implant_diameter": 4.0, 
            "implant_length": 10, "bone_type": "D1", 
            "procedure": "Conventional Implant Placement", "tooth": "46"
        }
        response = requests.post(f"{BASE_URL}/api/implant-library/calculate-risk", 
                                 json=payload, headers=auth_headers)
        data = response.json()
        tooth_factor = next((f for f in data["factors"] if f["factor"] == "Tooth Position"), None)
        assert tooth_factor["score"] == 3, f"Molar expected score=3, got {tooth_factor['score']}"
        assert "(Molar)" in tooth_factor["detail"], f"Expected Molar region in detail"
        print("✓ Tooth 46 (Molar) → score=3")

    def test_tooth_position_anterior(self, auth_headers):
        """Tooth 11 (unit digit 1) = Anterior = score 1"""
        payload = {
            "bone_width": 10, "bone_height": 15, "implant_diameter": 4.0, 
            "implant_length": 10, "bone_type": "D1", 
            "procedure": "Conventional Implant Placement", "tooth": "11"
        }
        response = requests.post(f"{BASE_URL}/api/implant-library/calculate-risk", 
                                 json=payload, headers=auth_headers)
        data = response.json()
        tooth_factor = next((f for f in data["factors"] if f["factor"] == "Tooth Position"), None)
        assert tooth_factor["score"] == 1, f"Anterior expected score=1, got {tooth_factor['score']}"
        assert "(Anterior)" in tooth_factor["detail"], f"Expected Anterior region in detail"
        print("✓ Tooth 11 (Anterior) → score=1")

    def test_tooth_position_premolar(self, auth_headers):
        """Tooth 14 (unit digit 4) = Premolar = score 2"""
        payload = {
            "bone_width": 10, "bone_height": 15, "implant_diameter": 4.0, 
            "implant_length": 10, "bone_type": "D1", 
            "procedure": "Conventional Implant Placement", "tooth": "14"
        }
        response = requests.post(f"{BASE_URL}/api/implant-library/calculate-risk", 
                                 json=payload, headers=auth_headers)
        data = response.json()
        tooth_factor = next((f for f in data["factors"] if f["factor"] == "Tooth Position"), None)
        assert tooth_factor["score"] == 2, f"Premolar expected score=2, got {tooth_factor['score']}"
        assert "(Premolar)" in tooth_factor["detail"], f"Expected Premolar region in detail"
        print("✓ Tooth 14 (Premolar) → score=2")

    # ── Test Case 7: Low Risk Case ──
    def test_low_risk_case(self, auth_headers):
        """
        Low risk case: bone_width=10, bone_height=15, implant_diameter=4.0, 
        implant_length=10, bone_type=D1, procedure=Conventional, tooth=11
        Expected: Low risk (score 5-7)
        """
        payload = {
            "bone_width": 10,
            "bone_height": 15,
            "implant_diameter": 4.0,
            "implant_length": 10,
            "bone_type": "D1",
            "procedure": "Conventional Implant Placement",
            "tooth": "11"
        }
        response = requests.post(f"{BASE_URL}/api/implant-library/calculate-risk", 
                                 json=payload, headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Width: 10 - 4.0 = 6.0, >=3 → score 1
        # Height: 15 - 10 = 5.0, >=3 → score 1
        # Density: D1 → score 1
        # Procedure: Conventional → score 1
        # Tooth: 11 (Anterior) → score 1
        # Total: 1 + 1 + 1 + 1 + 1 = 5 → Low risk
        
        assert data["total_score"] == 5, f"Expected total_score=5, got {data['total_score']}"
        assert data["risk_level"] == "Low", f"Expected risk_level=Low, got {data['risk_level']}"
        assert data["color"] == "green", f"Expected color=green, got {data['color']}"
        print("✓ Low risk case passed: score=5, risk=Low, color=green")

    # ── Test Case 8: Missing Fields ──
    def test_missing_fields_returns_400(self, auth_headers):
        """Missing required fields should return 400"""
        # Missing tooth
        payload = {
            "bone_width": 10,
            "bone_height": 15,
            "implant_diameter": 4.0,
            "implant_length": 10,
            "bone_type": "D1",
            "procedure": "Conventional Implant Placement"
            # tooth is missing
        }
        response = requests.post(f"{BASE_URL}/api/implant-library/calculate-risk", 
                                 json=payload, headers=auth_headers)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ Missing fields returns 400")

    def test_empty_bone_type_returns_400(self, auth_headers):
        """Empty bone_type should return 400"""
        payload = {
            "bone_width": 10,
            "bone_height": 15,
            "implant_diameter": 4.0,
            "implant_length": 10,
            "bone_type": "",  # Empty
            "procedure": "Conventional Implant Placement",
            "tooth": "11"
        }
        response = requests.post(f"{BASE_URL}/api/implant-library/calculate-risk", 
                                 json=payload, headers=auth_headers)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ Empty bone_type returns 400")

    # ── Test Case 9: Factors Array Contains 5 Items ──
    def test_factors_array_has_5_items(self, auth_headers):
        """Response should contain factors array with 5 items"""
        payload = {
            "bone_width": 10, "bone_height": 15, "implant_diameter": 4.0, 
            "implant_length": 10, "bone_type": "D1", 
            "procedure": "Conventional Implant Placement", "tooth": "11"
        }
        response = requests.post(f"{BASE_URL}/api/implant-library/calculate-risk", 
                                 json=payload, headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        
        assert "factors" in data, "Response should contain factors array"
        assert len(data["factors"]) == 5, f"Expected 5 factors, got {len(data['factors'])}"
        
        factor_names = [f["factor"] for f in data["factors"]]
        expected_factors = ["Bone Width", "Bone Height", "Bone Density", "Procedure", "Tooth Position"]
        for expected in expected_factors:
            assert expected in factor_names, f"Missing factor: {expected}"
        
        print(f"✓ Factors array contains 5 items: {factor_names}")

    # ── Test Case 10: Suggested Actions for High Risk ──
    def test_suggested_actions_for_high_risk(self, auth_headers):
        """High risk cases should return suggested_actions array"""
        payload = {
            "bone_width": 7,
            "bone_height": 12,
            "implant_diameter": 4.3,
            "implant_length": 11.5,
            "bone_type": "D3",
            "procedure": "Immediate Implant Placement",
            "tooth": "46"
        }
        response = requests.post(f"{BASE_URL}/api/implant-library/calculate-risk", 
                                 json=payload, headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        
        assert "suggested_actions" in data, "Response should contain suggested_actions"
        assert isinstance(data["suggested_actions"], list), "suggested_actions should be a list"
        assert len(data["suggested_actions"]) > 0, "High risk should have suggested actions"
        
        # For score 12, expect "Consider bone graft" and "Evaluate CBCT carefully"
        assert any("bone graft" in action.lower() for action in data["suggested_actions"]), \
            "High risk should suggest bone graft"
        
        print(f"✓ Suggested actions for high risk: {data['suggested_actions']}")

    # ── Test Case 11: Moderate Risk Case ──
    def test_moderate_risk_case(self, auth_headers):
        """Test case that results in moderate risk (score 8-11)"""
        payload = {
            "bone_width": 8,  # 8 - 4.0 = 4.0, >=3 → score 1
            "bone_height": 13,  # 13 - 10 = 3.0, >=3 → score 1
            "implant_diameter": 4.0,
            "implant_length": 10,
            "bone_type": "D3",  # score 2
            "procedure": "Immediate Implant Placement",  # score 2
            "tooth": "46"  # Molar, score 3
        }
        # Total: 1 + 1 + 2 + 2 + 3 = 9 → Moderate
        response = requests.post(f"{BASE_URL}/api/implant-library/calculate-risk", 
                                 json=payload, headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["total_score"] == 9, f"Expected total_score=9, got {data['total_score']}"
        assert data["risk_level"] == "Moderate", f"Expected Moderate, got {data['risk_level']}"
        assert data["color"] == "orange", f"Expected orange, got {data['color']}"
        print("✓ Moderate risk case passed: score=9, risk=Moderate, color=orange")

    # ── Test Case 12: Regression Test - Suggest Endpoint Still Works ──
    def test_suggest_endpoint_regression(self, auth_headers):
        """Existing /api/implant-library/suggest endpoint should still work (GET)"""
        # Suggest endpoint requires system, brand, tooth, bone_width, bone_height
        params = {
            "tooth": "46",
            "bone_width": 8,
            "bone_height": 12,
            "system": "NobelActive",
            "brand": "Nobel Biocare"
        }
        response = requests.get(f"{BASE_URL}/api/implant-library/suggest", 
                                params=params, headers=auth_headers)
        
        assert response.status_code == 200, f"Suggest endpoint failed: {response.text}"
        data = response.json()
        
        assert "recommended" in data or "alternatives" in data or "all_implants" in data, \
            "Suggest endpoint should return implant data"
        print("✓ Regression: /api/implant-library/suggest still works")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
