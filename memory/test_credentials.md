# Test Credentials

## Login Credentials (use `identifier` field for login)

### Admin / Administrator
- **Identifier**: `Abhijit.patil` (or `Abhijit.patil@dental.edu`)
- **Password**: `Admin@123`
- **Role**: `administrator`
- **Name**: Dr. Abhijit Patil (the only administrator — per user decision 2026-02)

### Student
- **Identifier**: `Gaurav.pandey` (or `Gaurav.pandey@student.dental.edu`)
- **Password**: `Student@123`
- **Role**: `student`

### Supervisor
- **Identifier**: `Paresh.gandhi` (or `Paresh.gandhi@dental.edu`)
- **Password**: `Supervisor@123`
- **Role**: `supervisor`

## API Endpoints
- Login: `POST /api/auth/login` with `{"identifier": "...", "password": "..."}`
- Backend URL: Same as EXPO_PUBLIC_BACKEND_URL with `/api` prefix
