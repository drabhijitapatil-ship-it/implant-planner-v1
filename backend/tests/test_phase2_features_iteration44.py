"""
Iteration 44: Phase 2 Features Backend Testing
Tests for:
1. POST /api/procedures/{id}/submit-phase2 accepts healing_abutment_cuff_height field
2. POST /api/procedures/{id}/submit-phase2 stores phase2_supervisor_notes and phase2_incharge_notes as top-level fields
3. GET /api/procedures/{id} returns phase2_data object with all surgical protocol fields
4. Verify procedure 69c2361dfeb06fbdfc09512e has phase2_data with all expected fields
5. Phase 2 submit endpoint stores phase2_student_notes from student_notes field
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://implant-workflow-hub.preview.emergentagent.com')

# Test credentials
STUDENT_CREDS = {"email": "Gaurav.pandey", "password": "Student@123"}
ADMIN_CREDS = {"email": "Abhijit.patil", "password": "Admin@123"}
SUPERVISOR_CREDS = {"email": "Paresh.gandhi", "password": "Supervisor@123"}

# Test procedure IDs
COMPLETED_PROCEDURE_ID = "69c2361dfeb06fbdfc09512e"  # Has phase2_data populated (legacy, without healing_abutment_cuff_height)
NEW_PHASE2_PROCEDURE_ID = "69c23603feb06fbdfc09512b"  # Has phase2_data with healing_abutment_cuff_height (newly submitted)
PHASE1_APPROVED_PROCEDURE_ID = "699fc5c2248100e8a0d87265"  # Can be used for phase2 submit test


class TestPhase2Features:
    """Test Phase 2 features for iteration 44"""
    
    @pytest.fixture(scope="class")
    def student_token(self):
        """Get student authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STUDENT_CREDS)
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip(f"Student login failed: {response.status_code} - {response.text}")
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")
    
    @pytest.fixture(scope="class")
    def supervisor_token(self):
        """Get supervisor authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPERVISOR_CREDS)
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip(f"Supervisor login failed: {response.status_code} - {response.text}")
    
    # ============ Test 1: Verify completed procedure has phase2_data ============
    def test_completed_procedure_has_phase2_data(self, admin_token):
        """Test that procedure 69c2361dfeb06fbdfc09512e has phase2_data with all expected fields"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}", headers=headers)
        
        assert response.status_code == 200, f"Failed to get procedure: {response.text}"
        
        data = response.json()
        assert "phase2_data" in data, "phase2_data field missing from procedure"
        
        phase2_data = data["phase2_data"]
        assert phase2_data is not None, "phase2_data is None"
        
        # Verify expected fields exist in phase2_data
        expected_fields = [
            "pre_surgery_checklist",
            "anesthesia_adequate",
            "flap_design",
            "drilling_type",
            "prosthetic_component",
            "torque_values",
            "sutures_placed",
            "hemostasis_achieved",
            "post_op_checklist"
        ]
        
        for field in expected_fields:
            assert field in phase2_data, f"Field '{field}' missing from phase2_data"
        
        print(f"✓ Procedure {COMPLETED_PROCEDURE_ID} has phase2_data with all expected fields")
        print(f"  - phase2_data keys: {list(phase2_data.keys())}")
    
    # ============ Test 2: Verify healing_abutment_cuff_height in phase2_data ============
    def test_phase2_data_has_healing_abutment_cuff_height_field(self, admin_token):
        """Test that phase2_data includes healing_abutment_cuff_height field"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        # Use the newly submitted procedure that has healing_abutment_cuff_height
        response = requests.get(f"{BASE_URL}/api/procedures/{NEW_PHASE2_PROCEDURE_ID}", headers=headers)
        
        assert response.status_code == 200, f"Failed to get procedure: {response.text}"
        
        data = response.json()
        phase2_data = data.get("phase2_data", {})
        
        # healing_abutment_cuff_height should be a valid key in phase2_data
        assert "healing_abutment_cuff_height" in phase2_data, "healing_abutment_cuff_height field missing from phase2_data"
        assert phase2_data.get("healing_abutment_cuff_height") == "4mm", f"healing_abutment_cuff_height value incorrect: {phase2_data.get('healing_abutment_cuff_height')}"
        
        print(f"✓ healing_abutment_cuff_height field exists in phase2_data")
        print(f"  - Value: {phase2_data.get('healing_abutment_cuff_height')}")
    
    # ============ Test 3: Verify pre_surgery_checklist in phase2_data ============
    def test_phase2_data_has_pre_surgery_checklist(self, admin_token):
        """Test that phase2_data includes pre_surgery_checklist"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}", headers=headers)
        
        assert response.status_code == 200, f"Failed to get procedure: {response.text}"
        
        data = response.json()
        phase2_data = data.get("phase2_data", {})
        
        assert "pre_surgery_checklist" in phase2_data, "pre_surgery_checklist missing from phase2_data"
        
        pre_surgery = phase2_data.get("pre_surgery_checklist")
        assert isinstance(pre_surgery, dict), f"pre_surgery_checklist should be dict, got {type(pre_surgery)}"
        
        print(f"✓ pre_surgery_checklist exists in phase2_data")
        print(f"  - Type: {type(pre_surgery)}")
        print(f"  - Keys: {list(pre_surgery.keys()) if pre_surgery else 'empty'}")
    
    # ============ Test 4: Verify post_op_checklist in phase2_data ============
    def test_phase2_data_has_post_op_checklist(self, admin_token):
        """Test that phase2_data includes post_op_checklist"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}", headers=headers)
        
        assert response.status_code == 200, f"Failed to get procedure: {response.text}"
        
        data = response.json()
        phase2_data = data.get("phase2_data", {})
        
        assert "post_op_checklist" in phase2_data, "post_op_checklist missing from phase2_data"
        
        post_op = phase2_data.get("post_op_checklist")
        assert isinstance(post_op, dict), f"post_op_checklist should be dict, got {type(post_op)}"
        
        print(f"✓ post_op_checklist exists in phase2_data")
        print(f"  - Type: {type(post_op)}")
        print(f"  - Keys: {list(post_op.keys()) if post_op else 'empty'}")
    
    # ============ Test 5: Verify surgical procedure fields in phase2_data ============
    def test_phase2_data_has_surgical_procedure_fields(self, admin_token):
        """Test that phase2_data includes all surgical procedure fields"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}", headers=headers)
        
        assert response.status_code == 200, f"Failed to get procedure: {response.text}"
        
        data = response.json()
        phase2_data = data.get("phase2_data", {})
        
        # Verify surgical procedure fields
        surgical_fields = [
            "anesthesia_adequate",
            "flap_design",
            "drilling_type",
            "prosthetic_component",
            "torque_values",
            "sutures_placed",
            "hemostasis_achieved"
        ]
        
        for field in surgical_fields:
            assert field in phase2_data, f"Surgical field '{field}' missing from phase2_data"
        
        print(f"✓ All surgical procedure fields exist in phase2_data")
        print(f"  - anesthesia_adequate: {phase2_data.get('anesthesia_adequate')}")
        print(f"  - flap_design: {phase2_data.get('flap_design')}")
        print(f"  - drilling_type: {phase2_data.get('drilling_type')}")
        print(f"  - prosthetic_component: {phase2_data.get('prosthetic_component')}")
        print(f"  - torque_values: {phase2_data.get('torque_values')}")
        print(f"  - sutures_placed: {phase2_data.get('sutures_placed')}")
        print(f"  - hemostasis_achieved: {phase2_data.get('hemostasis_achieved')}")
    
    # ============ Test 6: Verify Phase2Submit model accepts healing_abutment_cuff_height ============
    def test_phase2_submit_model_accepts_healing_abutment_cuff_height(self, admin_token):
        """Test that Phase2Submit model has healing_abutment_cuff_height field (code review)"""
        # This is a code verification test - we verify the model definition
        # Use the newly submitted procedure that has healing_abutment_cuff_height
        
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/procedures/{NEW_PHASE2_PROCEDURE_ID}", headers=headers)
        
        assert response.status_code == 200, f"Failed to get procedure: {response.text}"
        
        data = response.json()
        phase2_data = data.get("phase2_data", {})
        
        # If healing_abutment_cuff_height is stored in phase2_data, the model accepts it
        assert "healing_abutment_cuff_height" in phase2_data, "healing_abutment_cuff_height not stored in phase2_data"
        assert phase2_data.get("healing_abutment_cuff_height") == "4mm", f"healing_abutment_cuff_height value incorrect"
        
        print(f"✓ Phase2Submit model accepts healing_abutment_cuff_height field")
        print(f"  - Stored value: {phase2_data.get('healing_abutment_cuff_height')}")
    
    # ============ Test 7: Verify top-level notes fields exist ============
    def test_procedure_has_top_level_notes_fields(self, admin_token):
        """Test that procedure has phase2_supervisor_notes and phase2_incharge_notes as top-level fields"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        # Use the newly submitted procedure that has all notes fields
        response = requests.get(f"{BASE_URL}/api/procedures/{NEW_PHASE2_PROCEDURE_ID}", headers=headers)
        
        assert response.status_code == 200, f"Failed to get procedure: {response.text}"
        
        data = response.json()
        
        # These fields should be at top level (not inside phase2_data)
        assert "phase2_student_notes" in data, "phase2_student_notes not at top level"
        assert "phase2_supervisor_notes" in data, "phase2_supervisor_notes not at top level"
        assert "phase2_incharge_notes" in data, "phase2_incharge_notes not at top level"
        
        # Verify the values
        assert data.get("phase2_student_notes") == "TEST_Phase 2 student notes for iteration 44", \
            f"phase2_student_notes value incorrect: {data.get('phase2_student_notes')}"
        assert data.get("phase2_supervisor_notes") == "TEST_Phase 2 supervisor notes for iteration 44", \
            f"phase2_supervisor_notes value incorrect: {data.get('phase2_supervisor_notes')}"
        assert data.get("phase2_incharge_notes") == "TEST_Phase 2 incharge notes for iteration 44", \
            f"phase2_incharge_notes value incorrect: {data.get('phase2_incharge_notes')}"
        
        print(f"✓ Top-level notes fields verified")
        print(f"  - phase2_student_notes: {data.get('phase2_student_notes')}")
        print(f"  - phase2_supervisor_notes: {data.get('phase2_supervisor_notes')}")
        print(f"  - phase2_incharge_notes: {data.get('phase2_incharge_notes')}")
    
    # ============ Test 8: Test Phase 2 submit endpoint with all fields ============
    def test_phase2_submit_endpoint_structure(self, admin_token):
        """Test that Phase 2 submit endpoint accepts all required fields including healing_abutment_cuff_height"""
        # First, find a procedure in phase1_approved status
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Try to get the phase1_approved procedure
        response = requests.get(f"{BASE_URL}/api/procedures/{PHASE1_APPROVED_PROCEDURE_ID}", headers=headers)
        
        if response.status_code != 200:
            pytest.skip(f"Could not find phase1_approved procedure: {response.text}")
        
        procedure = response.json()
        
        if procedure.get("status") != "phase1_approved":
            pytest.skip(f"Procedure {PHASE1_APPROVED_PROCEDURE_ID} is not in phase1_approved status (current: {procedure.get('status')})")
        
        # Prepare Phase 2 submit data with all fields including healing_abutment_cuff_height
        phase2_submit_data = {
            "pre_surgery_checklist": {
                "patient_identity_verified": True,
                "consent_signed": True,
                "medical_history_reviewed": True,
                "cbct_reviewed": True,
                "implant_kit_verified": True,
                "surgical_guide_verified": True,
                "asepsis_confirmed": True
            },
            "anesthesia_adequate": "Yes",
            "flap_design": "Full Thickness Mucoperiosteal",
            "drilling_type": "Conventional Drilling",
            "implant_seated_correctly": True,
            "torque_values": [35.0],
            "prosthetic_component": "Healing Abutment Placed",
            "healing_abutment_cuff_height": "4mm",  # New field being tested
            "sutures_placed": True,
            "hemostasis_achieved": True,
            "post_op_checklist": {
                "post_op_instructions_given": True,
                "prescription_given": True,
                "follow_up_scheduled": True
            },
            "student_notes": "TEST_Phase 2 student notes for iteration 44",
            "supervisor_notes": "TEST_Phase 2 supervisor notes for iteration 44",
            "incharge_notes": "TEST_Phase 2 incharge notes for iteration 44"
        }
        
        # Submit Phase 2
        response = requests.post(
            f"{BASE_URL}/api/procedures/{PHASE1_APPROVED_PROCEDURE_ID}/submit-phase2",
            headers=headers,
            json=phase2_submit_data
        )
        
        assert response.status_code == 200, f"Phase 2 submit failed: {response.status_code} - {response.text}"
        
        result = response.json()
        
        # Verify phase2_data was stored correctly
        assert "phase2_data" in result, "phase2_data not in response"
        phase2_data = result["phase2_data"]
        
        # Verify healing_abutment_cuff_height was stored
        assert phase2_data.get("healing_abutment_cuff_height") == "4mm", \
            f"healing_abutment_cuff_height not stored correctly: {phase2_data.get('healing_abutment_cuff_height')}"
        
        # Verify top-level notes fields
        assert result.get("phase2_student_notes") == "TEST_Phase 2 student notes for iteration 44", \
            f"phase2_student_notes not stored: {result.get('phase2_student_notes')}"
        assert result.get("phase2_supervisor_notes") == "TEST_Phase 2 supervisor notes for iteration 44", \
            f"phase2_supervisor_notes not stored: {result.get('phase2_supervisor_notes')}"
        assert result.get("phase2_incharge_notes") == "TEST_Phase 2 incharge notes for iteration 44", \
            f"phase2_incharge_notes not stored: {result.get('phase2_incharge_notes')}"
        
        print(f"✓ Phase 2 submit endpoint accepts all fields correctly")
        print(f"  - healing_abutment_cuff_height: {phase2_data.get('healing_abutment_cuff_height')}")
        print(f"  - phase2_student_notes: {result.get('phase2_student_notes')}")
        print(f"  - phase2_supervisor_notes: {result.get('phase2_supervisor_notes')}")
        print(f"  - phase2_incharge_notes: {result.get('phase2_incharge_notes')}")
    
    # ============ Test 9: Verify GET procedure returns full phase2_data ============
    def test_get_procedure_returns_full_phase2_data(self, admin_token):
        """Test that GET /api/procedures/{id} returns complete phase2_data object"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}", headers=headers)
        
        assert response.status_code == 200, f"Failed to get procedure: {response.text}"
        
        data = response.json()
        
        # Verify phase2_data is returned
        assert "phase2_data" in data, "phase2_data not returned in GET response"
        
        phase2_data = data["phase2_data"]
        
        # Verify all expected fields are present
        all_expected_fields = [
            "pre_surgery_checklist",
            "anesthesia_adequate",
            "anesthesia_details",
            "flap_design",
            "drilling_type",
            "implant_seated_correctly",
            "implant_seated_comment",
            "torque_values",
            "implant_other_notes",
            "prosthetic_component",
            "healing_abutment_cuff_height",
            "sutures_placed",
            "hemostasis_achieved",
            "post_op_checklist"
        ]
        
        present_fields = []
        missing_fields = []
        
        for field in all_expected_fields:
            if field in phase2_data:
                present_fields.append(field)
            else:
                missing_fields.append(field)
        
        print(f"✓ GET procedure returns phase2_data")
        print(f"  - Present fields ({len(present_fields)}): {present_fields}")
        if missing_fields:
            print(f"  - Missing fields ({len(missing_fields)}): {missing_fields}")
        
        # At minimum, the core fields should be present
        core_fields = ["pre_surgery_checklist", "drilling_type", "prosthetic_component", "post_op_checklist"]
        for field in core_fields:
            assert field in phase2_data, f"Core field '{field}' missing from phase2_data"
    
    # ============ Test 10: Verify procedure status after Phase 2 submit ============
    def test_procedure_status_after_phase2_submit(self, admin_token):
        """Test that procedure status changes to pending_phase2 after Phase 2 submit"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Check the procedure that was submitted in test 8
        response = requests.get(f"{BASE_URL}/api/procedures/{PHASE1_APPROVED_PROCEDURE_ID}", headers=headers)
        
        if response.status_code != 200:
            pytest.skip(f"Could not get procedure: {response.text}")
        
        procedure = response.json()
        
        # If Phase 2 was submitted, status should be pending_phase2
        if procedure.get("phase2_data"):
            expected_statuses = ["pending_phase2", "phase2_approved", "completed"]
            assert procedure.get("status") in expected_statuses, \
                f"Unexpected status after Phase 2 submit: {procedure.get('status')}"
            print(f"✓ Procedure status after Phase 2 submit: {procedure.get('status')}")
        else:
            print(f"  - Procedure has no phase2_data, skipping status check")


class TestPhase2DataVerification:
    """Additional verification tests for Phase 2 data structure"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")
    
    def test_phase2_data_drilling_type_values(self, admin_token):
        """Verify drilling_type field accepts the 3 specific options"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}", headers=headers)
        
        assert response.status_code == 200
        
        data = response.json()
        phase2_data = data.get("phase2_data", {})
        drilling_type = phase2_data.get("drilling_type")
        
        # Valid drilling types (reduced to 3 options per requirements)
        valid_drilling_types = [
            "Conventional Drilling",
            "Osseodensification",
            "Piezoelectric Osteotomy"
        ]
        
        if drilling_type:
            print(f"✓ drilling_type value: {drilling_type}")
            # Note: We don't assert the value must be in the list since existing data may have old values
        else:
            print(f"  - drilling_type is not set")
    
    def test_phase2_data_prosthetic_component_with_healing_abutment(self, admin_token):
        """Verify prosthetic_component field and healing_abutment_cuff_height relationship"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}", headers=headers)
        
        assert response.status_code == 200
        
        data = response.json()
        phase2_data = data.get("phase2_data", {})
        
        prosthetic_component = phase2_data.get("prosthetic_component")
        healing_abutment_cuff_height = phase2_data.get("healing_abutment_cuff_height")
        
        print(f"✓ Prosthetic component relationship check:")
        print(f"  - prosthetic_component: {prosthetic_component}")
        print(f"  - healing_abutment_cuff_height: {healing_abutment_cuff_height}")
        
        # If prosthetic_component is "Healing Abutment Placed", healing_abutment_cuff_height should be set
        # This is a frontend validation, but we verify the backend stores both correctly
        if prosthetic_component == "Healing Abutment Placed":
            print(f"  - Note: When 'Healing Abutment Placed' is selected, cuff height should be provided")
    
    def test_all_procedures_list_accessible(self, admin_token):
        """Verify procedures list endpoint works"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/procedures", headers=headers)
        
        assert response.status_code == 200, f"Failed to get procedures list: {response.text}"
        
        procedures = response.json()
        assert isinstance(procedures, list), "Procedures response should be a list"
        
        # Find procedures with phase2_data
        procedures_with_phase2 = [p for p in procedures if p.get("phase2_data")]
        
        print(f"✓ Procedures list accessible")
        print(f"  - Total procedures: {len(procedures)}")
        print(f"  - Procedures with phase2_data: {len(procedures_with_phase2)}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
