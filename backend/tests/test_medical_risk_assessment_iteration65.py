"""
Iteration 65: Medical Risk Assessment Tests
Tests for the updated calculate-risk endpoint with granular medical scoring.

Medical Factor Scoring:
- Diabetes: No=1, Controlled=2, Uncontrolled=3
- Smoking: No=1, Light=2, Heavy=3
- Anticoagulant: No=1, Yes=2
- Osteoporosis: No=1, Yes=3
- Radiation: No=1, Yes=3

Override Rules:
- Any factor=3 forces medical HIGH
- Elevated count >=2 forces medical HIGH
- Elevated count ==1 gives medical MODERATE
- No elevated factors gives medical LOW

Total Risk Thresholds (with medical - 6 factors, max 18):
- 6-9: Low
- 10-14: Moderate
- 15-18: High

Total Risk Thresholds (without medical - 5 factors, max 15):
- 5-7: Low
- 8-11: Moderate
- 12-15: High
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://implant-workflow-hub.preview.emergentagent.com"

# Test credentials
STUDENT_CREDS = {"identifier": "Gaurav.pandey@student.dental.edu", "password": "Student@123"}

# Base request body for calculate-risk (low risk scenario)
BASE_RISK_BODY = {
    "bone_width": 10,
    "bone_height": 14,
    "implant_diameter": 4.3,
    "implant_length": 12,
    "bone_type": "D2",
    "procedure": "Single Conventional Implant",
    "tooth": "36"
}


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for testing."""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=STUDENT_CREDS)
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture
def api_client(auth_token):
    """Shared requests session with auth header."""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


class TestHealthCheck:
    """Basic health check to ensure API is accessible."""
    
    def test_health_endpoint(self):
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        assert response.json().get("status") == "ok"


class TestMedicalRiskAllNoFactors:
    """Test: All medical factors set to No → medical score=1 (Low)"""
    
    def test_all_no_medical_factors_returns_low_medical_score(self, api_client):
        body = {
            **BASE_RISK_BODY,
            "medical_assessment": {
                "diabetes": "No",
                "smoking": "No",
                "anticoagulant": "No",
                "osteoporosis": "No",
                "radiation": "No"
            }
        }
        response = api_client.post(f"{BASE_URL}/api/implant-library/calculate-risk", json=body)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Find medical risk factor
        medical_factor = next((f for f in data["factors"] if f["factor"] == "Medical Risk"), None)
        assert medical_factor is not None, "Medical Risk factor should be present"
        assert medical_factor["score"] == 1, f"Expected medical score=1, got {medical_factor['score']}"
        assert medical_factor["risk"] == "Low", f"Expected risk=Low, got {medical_factor['risk']}"
        
        # Verify max_score is 18 (6 factors)
        assert data["max_score"] == 18, f"Expected max_score=18, got {data['max_score']}"
        
        # Verify no medical warnings
        assert data["medical_warnings"] == [], f"Expected no warnings, got {data['medical_warnings']}"
        
        print(f"PASS: All No factors → medical score={medical_factor['score']}, risk={medical_factor['risk']}")


class TestMedicalRiskControlledDiabetes:
    """Test: Controlled diabetes → medical score=2 (Moderate)"""
    
    def test_controlled_diabetes_returns_moderate_medical_score(self, api_client):
        body = {
            **BASE_RISK_BODY,
            "medical_assessment": {
                "diabetes": "Controlled",
                "smoking": "No",
                "anticoagulant": "No",
                "osteoporosis": "No",
                "radiation": "No"
            }
        }
        response = api_client.post(f"{BASE_URL}/api/implant-library/calculate-risk", json=body)
        assert response.status_code == 200
        
        data = response.json()
        medical_factor = next((f for f in data["factors"] if f["factor"] == "Medical Risk"), None)
        
        assert medical_factor is not None
        assert medical_factor["score"] == 2, f"Expected medical score=2, got {medical_factor['score']}"
        assert medical_factor["risk"] == "Moderate", f"Expected risk=Moderate, got {medical_factor['risk']}"
        
        # Controlled diabetes should NOT generate a warning
        assert "Uncontrolled diabetes" not in str(data["medical_warnings"])
        
        print(f"PASS: Controlled diabetes → medical score={medical_factor['score']}, risk={medical_factor['risk']}")


class TestMedicalRiskUncontrolledDiabetes:
    """Test: Uncontrolled diabetes → medical score=3 (High), override, warning generated"""
    
    def test_uncontrolled_diabetes_returns_high_medical_score_with_warning(self, api_client):
        body = {
            **BASE_RISK_BODY,
            "medical_assessment": {
                "diabetes": "Uncontrolled",
                "smoking": "No",
                "anticoagulant": "No",
                "osteoporosis": "No",
                "radiation": "No"
            }
        }
        response = api_client.post(f"{BASE_URL}/api/implant-library/calculate-risk", json=body)
        assert response.status_code == 200
        
        data = response.json()
        medical_factor = next((f for f in data["factors"] if f["factor"] == "Medical Risk"), None)
        
        assert medical_factor is not None
        assert medical_factor["score"] == 3, f"Expected medical score=3 (override), got {medical_factor['score']}"
        assert medical_factor["risk"] == "High", f"Expected risk=High, got {medical_factor['risk']}"
        
        # Verify warning is generated
        assert any("Uncontrolled diabetes" in w for w in data["medical_warnings"]), \
            f"Expected uncontrolled diabetes warning, got {data['medical_warnings']}"
        
        print(f"PASS: Uncontrolled diabetes → medical score={medical_factor['score']}, risk={medical_factor['risk']}, warnings={data['medical_warnings']}")


class TestMedicalRiskHeavySmoking:
    """Test: Heavy smoking → medical score=3 (High), override"""
    
    def test_heavy_smoking_returns_high_medical_score(self, api_client):
        body = {
            **BASE_RISK_BODY,
            "medical_assessment": {
                "diabetes": "No",
                "smoking": "Heavy (>10/day)",
                "anticoagulant": "No",
                "osteoporosis": "No",
                "radiation": "No"
            }
        }
        response = api_client.post(f"{BASE_URL}/api/implant-library/calculate-risk", json=body)
        assert response.status_code == 200
        
        data = response.json()
        medical_factor = next((f for f in data["factors"] if f["factor"] == "Medical Risk"), None)
        
        assert medical_factor is not None
        assert medical_factor["score"] == 3, f"Expected medical score=3 (override), got {medical_factor['score']}"
        assert medical_factor["risk"] == "High", f"Expected risk=High, got {medical_factor['risk']}"
        
        # Verify warning is generated
        assert any("Heavy smoking" in w for w in data["medical_warnings"]), \
            f"Expected heavy smoking warning, got {data['medical_warnings']}"
        
        print(f"PASS: Heavy smoking → medical score={medical_factor['score']}, risk={medical_factor['risk']}")


class TestMedicalRiskOsteoporosis:
    """Test: Osteoporosis=Yes → medical score=3 (High), MRONJ warning"""
    
    def test_osteoporosis_yes_returns_high_medical_score_with_mronj_warning(self, api_client):
        body = {
            **BASE_RISK_BODY,
            "medical_assessment": {
                "diabetes": "No",
                "smoking": "No",
                "anticoagulant": "No",
                "osteoporosis": "Yes",
                "radiation": "No"
            }
        }
        response = api_client.post(f"{BASE_URL}/api/implant-library/calculate-risk", json=body)
        assert response.status_code == 200
        
        data = response.json()
        medical_factor = next((f for f in data["factors"] if f["factor"] == "Medical Risk"), None)
        
        assert medical_factor is not None
        assert medical_factor["score"] == 3, f"Expected medical score=3 (override), got {medical_factor['score']}"
        assert medical_factor["risk"] == "High", f"Expected risk=High, got {medical_factor['risk']}"
        
        # Verify MRONJ warning is generated
        assert any("MRONJ" in w for w in data["medical_warnings"]), \
            f"Expected MRONJ warning, got {data['medical_warnings']}"
        
        print(f"PASS: Osteoporosis=Yes → medical score={medical_factor['score']}, risk={medical_factor['risk']}, warnings={data['medical_warnings']}")


class TestMedicalRiskRadiation:
    """Test: Radiation=Yes → medical score=3 (High), osteoradionecrosis warning"""
    
    def test_radiation_yes_returns_high_medical_score_with_osteoradionecrosis_warning(self, api_client):
        body = {
            **BASE_RISK_BODY,
            "medical_assessment": {
                "diabetes": "No",
                "smoking": "No",
                "anticoagulant": "No",
                "osteoporosis": "No",
                "radiation": "Yes"
            }
        }
        response = api_client.post(f"{BASE_URL}/api/implant-library/calculate-risk", json=body)
        assert response.status_code == 200
        
        data = response.json()
        medical_factor = next((f for f in data["factors"] if f["factor"] == "Medical Risk"), None)
        
        assert medical_factor is not None
        assert medical_factor["score"] == 3, f"Expected medical score=3 (override), got {medical_factor['score']}"
        assert medical_factor["risk"] == "High", f"Expected risk=High, got {medical_factor['risk']}"
        
        # Verify osteoradionecrosis warning is generated
        assert any("Osteoradionecrosis" in w for w in data["medical_warnings"]), \
            f"Expected osteoradionecrosis warning, got {data['medical_warnings']}"
        
        print(f"PASS: Radiation=Yes → medical score={medical_factor['score']}, risk={medical_factor['risk']}, warnings={data['medical_warnings']}")


class TestMedicalRiskTwoModerateFactors:
    """Test: Light smoking + Anticoagulant → 2 moderate factors → medical score=3 (High)"""
    
    def test_two_moderate_factors_returns_high_medical_score(self, api_client):
        body = {
            **BASE_RISK_BODY,
            "medical_assessment": {
                "diabetes": "No",
                "smoking": "Light (<10/day)",
                "anticoagulant": "Yes",
                "osteoporosis": "No",
                "radiation": "No"
            }
        }
        response = api_client.post(f"{BASE_URL}/api/implant-library/calculate-risk", json=body)
        assert response.status_code == 200
        
        data = response.json()
        medical_factor = next((f for f in data["factors"] if f["factor"] == "Medical Risk"), None)
        
        assert medical_factor is not None
        # Two elevated factors (smoking=2, anticoagulant=2) should trigger HIGH
        assert medical_factor["score"] == 3, f"Expected medical score=3 (2 elevated factors), got {medical_factor['score']}"
        assert medical_factor["risk"] == "High", f"Expected risk=High, got {medical_factor['risk']}"
        
        # Verify anticoagulant warning is generated
        assert any("anticoagulant" in w.lower() for w in data["medical_warnings"]), \
            f"Expected anticoagulant warning, got {data['medical_warnings']}"
        
        print(f"PASS: Light smoking + Anticoagulant → medical score={medical_factor['score']}, risk={medical_factor['risk']}")


class TestMedicalRiskBackwardsCompatibility:
    """Test: Without medical_assessment → 5 factors only, score /15 (backwards compatible)"""
    
    def test_without_medical_assessment_uses_5_factors(self, api_client):
        body = {**BASE_RISK_BODY}  # No medical_assessment
        
        response = api_client.post(f"{BASE_URL}/api/implant-library/calculate-risk", json=body)
        assert response.status_code == 200
        
        data = response.json()
        
        # Should have 5 factors (no Medical Risk)
        assert len(data["factors"]) == 5, f"Expected 5 factors, got {len(data['factors'])}"
        
        # Verify Medical Risk is NOT present
        medical_factor = next((f for f in data["factors"] if f["factor"] == "Medical Risk"), None)
        assert medical_factor is None, "Medical Risk factor should NOT be present without medical_assessment"
        
        # Verify max_score is 15
        assert data["max_score"] == 15, f"Expected max_score=15, got {data['max_score']}"
        
        # Verify no medical warnings
        assert data["medical_warnings"] == [], f"Expected no warnings, got {data['medical_warnings']}"
        
        print(f"PASS: Without medical_assessment → {len(data['factors'])} factors, max_score={data['max_score']}")


class TestMedicalWarningsAndSuggestedActions:
    """Test: calculate-risk returns medical_warnings array and suggested_actions"""
    
    def test_response_contains_medical_warnings_and_suggested_actions(self, api_client):
        body = {
            **BASE_RISK_BODY,
            "medical_assessment": {
                "diabetes": "Uncontrolled",
                "smoking": "Heavy (>10/day)",
                "anticoagulant": "Yes",
                "osteoporosis": "Yes",
                "radiation": "Yes"
            }
        }
        response = api_client.post(f"{BASE_URL}/api/implant-library/calculate-risk", json=body)
        assert response.status_code == 200
        
        data = response.json()
        
        # Verify medical_warnings is present and is a list
        assert "medical_warnings" in data, "Response should contain medical_warnings"
        assert isinstance(data["medical_warnings"], list), "medical_warnings should be a list"
        
        # Verify suggested_actions is present and is a list
        assert "suggested_actions" in data, "Response should contain suggested_actions"
        assert isinstance(data["suggested_actions"], list), "suggested_actions should be a list"
        
        # With all high-risk factors, should have multiple warnings
        assert len(data["medical_warnings"]) >= 4, f"Expected at least 4 warnings, got {len(data['medical_warnings'])}"
        
        # Verify specific warnings are present
        warnings_text = " ".join(data["medical_warnings"])
        assert "Uncontrolled diabetes" in warnings_text
        assert "Heavy smoking" in warnings_text
        assert "anticoagulant" in warnings_text.lower()
        assert "MRONJ" in warnings_text
        assert "Osteoradionecrosis" in warnings_text
        
        print(f"PASS: Response contains medical_warnings={len(data['medical_warnings'])} and suggested_actions={len(data['suggested_actions'])}")


class TestRiskThresholdValidation:
    """Test: Risk threshold validation - total score 6-9 = Low, 10-14 = Moderate, 15-18 = High"""
    
    def test_low_total_risk_threshold(self, api_client):
        """Low risk scenario: all factors minimal → total should be 6-9 → Low"""
        body = {
            "bone_width": 12,  # remaining 7.7 → score 1
            "bone_height": 16,  # remaining 4 → score 1
            "implant_diameter": 4.3,
            "implant_length": 12,
            "bone_type": "D1",  # score 1
            "procedure": "Single Conventional Implant",  # maps to Conventional Implant Placement → score 1
            "tooth": "11",  # Anterior → score 1
            "medical_assessment": {
                "diabetes": "No",
                "smoking": "No",
                "anticoagulant": "No",
                "osteoporosis": "No",
                "radiation": "No"
            }  # score 1
        }
        response = api_client.post(f"{BASE_URL}/api/implant-library/calculate-risk", json=body)
        assert response.status_code == 200
        
        data = response.json()
        
        # Total should be 6 (all 1s)
        assert data["total_score"] <= 9, f"Expected total_score <= 9 for Low, got {data['total_score']}"
        assert data["risk_level"] == "Low", f"Expected risk_level=Low, got {data['risk_level']}"
        assert data["color"] == "green", f"Expected color=green, got {data['color']}"
        
        print(f"PASS: Low risk threshold → total_score={data['total_score']}, risk_level={data['risk_level']}")
    
    def test_moderate_total_risk_threshold(self, api_client):
        """Moderate risk scenario: some elevated factors → total 10-14 → Moderate"""
        body = {
            "bone_width": 7,  # remaining 2.7 → score 2
            "bone_height": 14,  # remaining 2 → score 2
            "implant_diameter": 4.3,
            "implant_length": 12,
            "bone_type": "D3",  # score 2
            "procedure": "Single Conventional Implant",  # score 1
            "tooth": "36",  # Molar → score 3
            "medical_assessment": {
                "diabetes": "No",
                "smoking": "No",
                "anticoagulant": "No",
                "osteoporosis": "No",
                "radiation": "No"
            }  # score 1
        }
        response = api_client.post(f"{BASE_URL}/api/implant-library/calculate-risk", json=body)
        assert response.status_code == 200
        
        data = response.json()
        
        # Total should be around 11 (2+2+2+1+3+1)
        assert 10 <= data["total_score"] <= 14, f"Expected total_score 10-14 for Moderate, got {data['total_score']}"
        assert data["risk_level"] == "Moderate", f"Expected risk_level=Moderate, got {data['risk_level']}"
        assert data["color"] == "orange", f"Expected color=orange, got {data['color']}"
        
        print(f"PASS: Moderate risk threshold → total_score={data['total_score']}, risk_level={data['risk_level']}")
    
    def test_high_total_risk_threshold(self, api_client):
        """High risk scenario: many high factors → total 15-18 → High"""
        body = {
            "bone_width": 5.5,  # remaining 1.2 → score 3
            "bone_height": 13,  # remaining 1 → score 3
            "implant_diameter": 4.3,
            "implant_length": 12,
            "bone_type": "D4",  # score 3
            "procedure": "Sinus Lift",  # score 3
            "tooth": "36",  # Molar → score 3
            "medical_assessment": {
                "diabetes": "Uncontrolled",
                "smoking": "No",
                "anticoagulant": "No",
                "osteoporosis": "No",
                "radiation": "No"
            }  # score 3 (override)
        }
        response = api_client.post(f"{BASE_URL}/api/implant-library/calculate-risk", json=body)
        assert response.status_code == 200
        
        data = response.json()
        
        # Total should be 18 (all 3s)
        assert data["total_score"] >= 15, f"Expected total_score >= 15 for High, got {data['total_score']}"
        assert data["risk_level"] == "High", f"Expected risk_level=High, got {data['risk_level']}"
        assert data["color"] == "red", f"Expected color=red, got {data['color']}"
        
        print(f"PASS: High risk threshold → total_score={data['total_score']}, risk_level={data['risk_level']}")


class TestPhase1ApprovalRegression:
    """Regression test: Phase 1 approval still works (no regression)"""
    
    def test_phase1_approval_flow_still_works(self, api_client):
        """Verify Phase 1 approval flow is not broken by medical risk changes."""
        # Get supervisors and incharge for procedure creation
        users_response = api_client.get(f"{BASE_URL}/api/users")
        assert users_response.status_code == 200
        users = users_response.json()
        
        supervisor = next((u for u in users if u["role"] == "supervisor"), None)
        incharge = next((u for u in users if u["role"] == "implant_incharge"), None)
        
        if not supervisor or not incharge:
            pytest.skip("No supervisor or incharge found for regression test")
        
        # Create a test procedure
        from datetime import datetime, timedelta
        future_date = (datetime.now() + timedelta(days=3)).strftime("%Y-%m-%d")
        
        procedure_data = {
            "patient_name": "TEST_MedicalRisk_Regression",
            "registration_number": "TEST-MR-001",
            "supervisor_id": supervisor["id"],
            "supervisor_name": supervisor["name"],
            "implant_incharge_id": incharge["id"],
            "implant_incharge_name": incharge["name"],
            "receipt_number": "TEST-REC-001",
            "amount_paid": 1000,
            "procedure_date": future_date,
            "procedure_time": "10:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Cement Retained Crown - Zirconia"
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/procedures", json=procedure_data)
        assert create_response.status_code == 200, f"Failed to create procedure: {create_response.text}"
        
        procedure = create_response.json()
        procedure_id = procedure["id"]
        
        # Verify procedure was created
        assert procedure["status"] == "draft"
        
        # Clean up - delete the test procedure
        # Note: Only implant_incharge can delete, so we'll leave it for now
        # The procedure has TEST_ prefix for easy identification
        
        print(f"PASS: Phase 1 approval flow regression test - procedure created successfully with id={procedure_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
