# Test Credentials

## Auth System (Production-Grade Upgrade)
- **Login field**: `identifier` (accepts email OR username, case-insensitive)
- **Response format**: `{ access_token, refresh_token, token_type: "bearer", user }`
- **Access token expiry**: 15 minutes
- **Refresh token expiry**: 7 days (stored in MongoDB `refresh_tokens` collection)

## User Accounts (from Login Details.docx)

### Implant In-Charge
| Name | Login ID | Password |
|------|----------|----------|
| Dr. Abhijit Patil | Abhijit.patil@dental.edu | Admin@123 |
| Dr. Ajay Sabane | Ajay.sabane@dental.edu | Admin@123 |

### Supervisors
| Name | Login ID | Password |
|------|----------|----------|
| Dr. Paresh Gandhi | Paresh.gandhi@dental.edu | Supervisor@123 |
| Dr. Rajshree Jadhav | Rajshree.jadhav@dental.edu | Supervisor@123 |
| Dr. Vasantha N | Vasantha.n@dental.edu | Supervisor@123 |
| Dr. Rupali Patil | Rupali.patil@dental.edu | Supervisor@123 |
| Dr. Pankaj Kadam | Pankaj.kadam@dental.edu | Supervisor@123 |

### Students
| Name | Login ID | Password |
|------|----------|----------|
| Dr. Gaurav Pandey | Gaurav.pandey@student.dental.edu | Student@123 |
| Dr. Atharva Mahadik | Atharva.mahadik@student.dental.edu | Student@123 |
| Dr. Anand Kurum | Anand.kurum@student.dental.edu | Student@123 |
| Dr. Yashica Jain | Yashica.jain@student.dental.edu | Student@123 |
| Dr. Vaibhav Deshpande | Vaibhav.deshpande@student.dental.edu | Student@123 |
| Dr. Manasi Dhiren | Manasi.dhiren@student.dental.edu | Student@123 |
| Dr. Renuka Bodakhe | Renuka.bodakhe@student.dental.edu | Student@123 |
| Dr. Shritej Shevakari | Shritej.shevakari@student.dental.edu | Student@123 |
| Dr. Aaditya Patil | Aaditya.patil@student.dental.edu | Student@123 |
| Dr. Kunal Parikh | Kunal.parikh@student.dental.edu | Student@123 |
| Dr. Krishna Mehta | Krishna.mehta@student.dental.edu | Student@123 |
| Dr. Sakshi Lohade | Sakshi.lohade@student.dental.edu | Student@123 |

### Nurses
| Name | Login ID | Password |
|------|----------|----------|
| Nurse 1 | Nurse.1@dental.edu | Nurse@123 |
| Nurse 2 | Nurse.2@dental.edu | Nurse@123 |

## Key API Endpoints
- `POST /api/auth/login` — `{"identifier": "...", "password": "..."}`
- `GET /api/auth/me` — Returns current user (requires Bearer token)
- `POST /api/auth/refresh` — `{"refresh_token": "..."}`
- `POST /api/auth/logout` — Invalidates refresh token (requires Bearer token)
- `GET /api/health` — Health check
- `GET /api/health/db-status` — DB diagnostics

## Notes
- Login is case-insensitive (both `Abhijit.patil@dental.edu` and `abhijit.patil@dental.edu` work)
- Username-only login also works (e.g., `Abhijit.patil`)
- Rate limit: 5 login attempts per minute per IP
- Backend URL: `https://implant-workflow-hub.preview.emergentagent.com`
