# Test Credentials

## Login Credentials (use `identifier` field for login)

### Admin / Implant In-Charge
- **Identifier**: `Abhijit.patil` (or `Abhijit.patil@dental.edu`)
- **Password**: `Admin@123`
- **Role**: `implant_incharge`

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
