"""
Test AI Features - Iteration 88
Tests 4 new AI features integrated into Prosthodontics workflow:
1. POST /api/ai/explain-recommendation - Explain implant selection
2. POST /api/ai/case-summary - Generate case summary for PDF
3. POST /api/ai/surgical-notes - Generate surgical operative notes
4. POST /api/ai/chat - Implanr AI chat assistant
5. GET /api/ai/chat/{procedure_id} - Get chat history

All endpoints use GPT-5.2 via Emergent Universal Key.
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://implant-workflow-hub.preview.emergentagent.com')

# Test procedure with implant plans
TEST_PROCEDURE_ID = "69cfde8b356c7405230a9dcc"
INVALID_PROCEDURE_ID = "000000000000000000000000"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for InCharge user."""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"identifier": "Abhijit.patil@dental.edu", "password": "Admin@123"}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Return headers with auth token."""
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


class TestHealthCheck:
    """Basic health check before AI tests."""
    
    def test_health_endpoint(self):
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"
        print("✓ Health check passed")


class TestAIExplainRecommendation:
    """Tests for POST /api/ai/explain-recommendation endpoint."""
    
    def test_explain_recommendation_success(self, auth_headers):
        """Test successful explanation generation."""
        response = requests.post(
            f"{BASE_URL}/api/ai/explain-recommendation",
            headers=auth_headers,
            json={"procedure_id": TEST_PROCEDURE_ID, "implant_index": 0}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "explanation" in data, "Response should contain 'explanation' field"
        assert isinstance(data["explanation"], str), "Explanation should be a string"
        assert len(data["explanation"]) > 50, "Explanation should be non-trivial (>50 chars)"
        print(f"✓ Explain recommendation returned {len(data['explanation'])} chars")
    
    def test_explain_recommendation_stored_in_db(self, auth_headers):
        """Verify explanation is stored in procedure.ai_explanations.implant_0."""
        # First generate explanation
        requests.post(
            f"{BASE_URL}/api/ai/explain-recommendation",
            headers=auth_headers,
            json={"procedure_id": TEST_PROCEDURE_ID, "implant_index": 0}
        )
        time.sleep(1)  # Allow DB write
        
        # Fetch procedure and verify storage
        response = requests.get(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        proc = response.json()
        assert "ai_explanations" in proc, "Procedure should have ai_explanations field"
        assert "implant_0" in proc["ai_explanations"], "ai_explanations should have implant_0 key"
        assert len(proc["ai_explanations"]["implant_0"]) > 50, "Stored explanation should be non-trivial"
        print("✓ Explanation stored in procedure.ai_explanations.implant_0")
    
    def test_explain_recommendation_requires_auth(self):
        """Test 401/403 without authentication."""
        response = requests.post(
            f"{BASE_URL}/api/ai/explain-recommendation",
            json={"procedure_id": TEST_PROCEDURE_ID, "implant_index": 0}
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ Explain recommendation requires auth ({response.status_code})")
    
    def test_explain_recommendation_invalid_procedure(self, auth_headers):
        """Test 404 for invalid procedure_id."""
        response = requests.post(
            f"{BASE_URL}/api/ai/explain-recommendation",
            headers=auth_headers,
            json={"procedure_id": INVALID_PROCEDURE_ID, "implant_index": 0}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Explain recommendation returns 404 for invalid procedure")


class TestAICaseSummary:
    """Tests for POST /api/ai/case-summary endpoint."""
    
    def test_case_summary_success(self, auth_headers):
        """Test successful case summary generation."""
        response = requests.post(
            f"{BASE_URL}/api/ai/case-summary",
            headers=auth_headers,
            json={"procedure_id": TEST_PROCEDURE_ID}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "summary" in data, "Response should contain 'summary' field"
        assert isinstance(data["summary"], str), "Summary should be a string"
        assert len(data["summary"]) > 100, "Summary should be substantial (>100 chars)"
        print(f"✓ Case summary returned {len(data['summary'])} chars")
    
    def test_case_summary_stored_in_db(self, auth_headers):
        """Verify summary is stored in procedure.ai_case_summary."""
        # First generate summary
        requests.post(
            f"{BASE_URL}/api/ai/case-summary",
            headers=auth_headers,
            json={"procedure_id": TEST_PROCEDURE_ID}
        )
        time.sleep(1)  # Allow DB write
        
        # Fetch procedure and verify storage
        response = requests.get(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        proc = response.json()
        assert "ai_case_summary" in proc, "Procedure should have ai_case_summary field"
        assert len(proc["ai_case_summary"]) > 100, "Stored summary should be substantial"
        print("✓ Summary stored in procedure.ai_case_summary")
    
    def test_case_summary_requires_auth(self):
        """Test 401/403 without authentication."""
        response = requests.post(
            f"{BASE_URL}/api/ai/case-summary",
            json={"procedure_id": TEST_PROCEDURE_ID}
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ Case summary requires auth ({response.status_code})")
    
    def test_case_summary_invalid_procedure(self, auth_headers):
        """Test 404 for invalid procedure_id."""
        response = requests.post(
            f"{BASE_URL}/api/ai/case-summary",
            headers=auth_headers,
            json={"procedure_id": INVALID_PROCEDURE_ID}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Case summary returns 404 for invalid procedure")


class TestAISurgicalNotes:
    """Tests for POST /api/ai/surgical-notes endpoint."""
    
    def test_surgical_notes_success(self, auth_headers):
        """Test successful surgical notes generation."""
        response = requests.post(
            f"{BASE_URL}/api/ai/surgical-notes",
            headers=auth_headers,
            json={"procedure_id": TEST_PROCEDURE_ID}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "notes" in data, "Response should contain 'notes' field"
        assert isinstance(data["notes"], str), "Notes should be a string"
        assert len(data["notes"]) > 50, "Notes should be non-trivial (>50 chars)"
        print(f"✓ Surgical notes returned {len(data['notes'])} chars")
    
    def test_surgical_notes_stored_in_db(self, auth_headers):
        """Verify notes are stored in procedure.ai_surgical_notes."""
        # First generate notes
        requests.post(
            f"{BASE_URL}/api/ai/surgical-notes",
            headers=auth_headers,
            json={"procedure_id": TEST_PROCEDURE_ID}
        )
        time.sleep(1)  # Allow DB write
        
        # Fetch procedure and verify storage
        response = requests.get(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        proc = response.json()
        assert "ai_surgical_notes" in proc, "Procedure should have ai_surgical_notes field"
        assert len(proc["ai_surgical_notes"]) > 50, "Stored notes should be non-trivial"
        print("✓ Notes stored in procedure.ai_surgical_notes")
    
    def test_surgical_notes_requires_auth(self):
        """Test 401/403 without authentication."""
        response = requests.post(
            f"{BASE_URL}/api/ai/surgical-notes",
            json={"procedure_id": TEST_PROCEDURE_ID}
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ Surgical notes requires auth ({response.status_code})")
    
    def test_surgical_notes_invalid_procedure(self, auth_headers):
        """Test 404 for invalid procedure_id."""
        response = requests.post(
            f"{BASE_URL}/api/ai/surgical-notes",
            headers=auth_headers,
            json={"procedure_id": INVALID_PROCEDURE_ID}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Surgical notes returns 404 for invalid procedure")


class TestAIChat:
    """Tests for POST /api/ai/chat and GET /api/ai/chat/{procedure_id} endpoints."""
    
    def test_chat_first_message_success(self, auth_headers):
        """Test first chat message returns response and history."""
        response = requests.post(
            f"{BASE_URL}/api/ai/chat",
            headers=auth_headers,
            json={"procedure_id": TEST_PROCEDURE_ID, "message": "What implant was selected for this case?"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "response" in data, "Response should contain 'response' field"
        assert "history" in data, "Response should contain 'history' field"
        assert isinstance(data["response"], str), "Response should be a string"
        assert len(data["response"]) > 20, "Response should be non-trivial"
        assert isinstance(data["history"], list), "History should be a list"
        assert len(data["history"]) >= 2, "History should have at least user + assistant messages"
        print(f"✓ Chat returned response ({len(data['response'])} chars) and history ({len(data['history'])} messages)")
    
    def test_chat_followup_includes_context(self, auth_headers):
        """Test follow-up message includes previous context."""
        # First message
        requests.post(
            f"{BASE_URL}/api/ai/chat",
            headers=auth_headers,
            json={"procedure_id": TEST_PROCEDURE_ID, "message": "What is the bone type?"}
        )
        time.sleep(2)  # Allow AI response
        
        # Follow-up message
        response = requests.post(
            f"{BASE_URL}/api/ai/chat",
            headers=auth_headers,
            json={"procedure_id": TEST_PROCEDURE_ID, "message": "Is that suitable for immediate loading?"}
        )
        assert response.status_code == 200
        
        data = response.json()
        # History should have accumulated messages
        assert len(data["history"]) >= 4, f"History should have at least 4 messages (2 exchanges), got {len(data['history'])}"
        
        # Verify history structure
        for msg in data["history"]:
            assert "role" in msg, "Each message should have 'role'"
            assert "content" in msg, "Each message should have 'content'"
            assert msg["role"] in ["user", "assistant"], f"Role should be user or assistant, got {msg['role']}"
        print(f"✓ Follow-up chat includes context ({len(data['history'])} messages in history)")
    
    def test_get_chat_history(self, auth_headers):
        """Test GET /api/ai/chat/{procedure_id} returns chat history."""
        response = requests.get(
            f"{BASE_URL}/api/ai/chat/{TEST_PROCEDURE_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "history" in data, "Response should contain 'history' field"
        assert isinstance(data["history"], list), "History should be a list"
        print(f"✓ GET chat history returned {len(data['history'])} messages")
    
    def test_chat_stored_in_db(self, auth_headers):
        """Verify chat history is stored in procedure.ai_chat_history."""
        # Fetch procedure and verify storage
        response = requests.get(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        proc = response.json()
        assert "ai_chat_history" in proc, "Procedure should have ai_chat_history field"
        assert isinstance(proc["ai_chat_history"], list), "ai_chat_history should be a list"
        print(f"✓ Chat history stored in procedure.ai_chat_history ({len(proc['ai_chat_history'])} messages)")
    
    def test_chat_requires_auth(self):
        """Test 401/403 without authentication for POST."""
        response = requests.post(
            f"{BASE_URL}/api/ai/chat",
            json={"procedure_id": TEST_PROCEDURE_ID, "message": "Hello"}
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ Chat POST requires auth ({response.status_code})")
    
    def test_get_chat_history_requires_auth(self):
        """Test 401/403 without authentication for GET."""
        response = requests.get(f"{BASE_URL}/api/ai/chat/{TEST_PROCEDURE_ID}")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ Chat GET requires auth ({response.status_code})")
    
    def test_chat_invalid_procedure(self, auth_headers):
        """Test 404 for invalid procedure_id on POST."""
        response = requests.post(
            f"{BASE_URL}/api/ai/chat",
            headers=auth_headers,
            json={"procedure_id": INVALID_PROCEDURE_ID, "message": "Hello"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Chat POST returns 404 for invalid procedure")
    
    def test_get_chat_history_invalid_procedure(self, auth_headers):
        """Test 404 for invalid procedure_id on GET."""
        response = requests.get(
            f"{BASE_URL}/api/ai/chat/{INVALID_PROCEDURE_ID}",
            headers=auth_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Chat GET returns 404 for invalid procedure")


class TestProcedureAIFields:
    """Test that GET /api/procedures/{id} returns all AI fields."""
    
    def test_procedure_returns_ai_fields(self, auth_headers):
        """Verify procedure response includes all AI-related fields."""
        response = requests.get(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        proc = response.json()
        
        # Check all AI fields exist (may be null/empty if not generated yet)
        ai_fields = ["ai_case_summary", "ai_surgical_notes", "ai_chat_history", "ai_explanations"]
        for field in ai_fields:
            assert field in proc, f"Procedure should have '{field}' field"
        
        print(f"✓ Procedure returns all AI fields: {ai_fields}")
        print(f"  - ai_case_summary: {len(proc.get('ai_case_summary', '') or '')} chars")
        print(f"  - ai_surgical_notes: {len(proc.get('ai_surgical_notes', '') or '')} chars")
        print(f"  - ai_chat_history: {len(proc.get('ai_chat_history', []) or [])} messages")
        print(f"  - ai_explanations: {list(proc.get('ai_explanations', {}).keys()) if proc.get('ai_explanations') else 'empty'}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
