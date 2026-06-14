# Signup and Registration Flow

## Implanr — Dental College App and Dental Clinic App

---

## What This Document Covers

This document explains how a new user will sign up on Implanr, how the admin adds their team members, and how the entire registration system works from the first screen to a fully active account.

The short version is this. Only the person setting up the workspace signs up publicly. Everyone else on the team gets added by that person through an invite. This is the same way Slack, Notion, and every modern professional tool works. It keeps the platform clean, secure, and manageable.

---

## The First Screen After Opening the App

When someone installs Implanr and opens it for the first time, they see a welcome screen. This screen has two buttons.

- Sign In
- Sign Up

If they already have an account, they tap Sign In. If they are setting up a new workspace for their college or clinic, they tap Sign Up.

The Sign In page also has a link to Sign Up in case someone lands there first.

---

## Sign Up Flow

### Step 1 — Choose Your Workspace Type

After tapping Sign Up, the person sees two large tiles.

Tile 1 is for Dental College. It has an icon representing a university or academic institution. This is for colleges that have PG students, supervisors, and an implant department. Icon: Graduation cap/university

Tile 2 is for Private Dental Clinic. It has an icon representing a clinic with a tooth. This is for standalone dental practices run by one or more dentists. Icon: Clinic building with tooth

The person taps the one that matches their institution. The form for that type opens.

---

### Step 2A — Dental College Signup Form

After tapping the Dental College tile, the person fills in these details.

College Name is the full official name of the dental college.

State is a dropdown with all Indian states. The person picks the state where the college is located.

Implant In-Charge Name is the name of the person who will be the primary admin. There is a prefix dropdown before the name field where they can choose Dr., Mr., or Mrs. There is also an info icon next to this field. When tapped, it explains that the Implant In-Charge is the person who has full admin access and is responsible for adding all other team members.

Email is the official email of the Implant In-Charge. There is an info icon here too explaining that an institutional email is preferred and that this email belongs to the person taking the Implant In-Charge role. The person can also sign up using their Google account.

Number of People Using the App is a number selector. There is an info icon explaining what types of users count toward this number, including Implant In-Charges, supervisors, students, and auxiliary staff.

Create Password and Confirm Password are standard fields.

There is a checkbox to agree to the Terms of Service and Privacy Policy.

The button at the bottom says Create College Workspace.

---

### Step 2B — Private Dental Clinic Signup Form

After tapping the Dental Clinic tile, the person fills in these details.

Dental Clinic Name is the name of the clinic.

Chief Dentist or Owner Name is the name of the person setting up the workspace. There is a prefix dropdown and an info icon explaining their role as the primary admin.

Email is the official email of the Chief Dentist. The info icon explains that this should be the email of the person taking the Chief Dentist role. Google Sign-In is also an option.

Registration Number is the dental registration number of the clinic or the Chief Dentist.

State of Registration is a scrollable dropdown with all Indian states.

State of Practice is a second state dropdown in case the practice state is different from the registration state.

Number of People Using the App is a number selector with an info icon explaining who counts as a user, including Chief Dentists, Dentists or Consultants, and Auxiliary Staff. For Dental Clinic we need to start range from 1-5, 6-10, 11-15 etc.  
If logo is not uploaded then generated pdf must have clinic name and if logo is uploaded then both logo and clinic name.

Create Password, Confirm Password, Terms checkbox, and the button that says Create Dental Clinic Workspace.

---

### What Happens After Signup

The moment the form is submitted, three things happen automatically.

One, a workspace is created for the college or clinic in the system. This is called a tenant. Everything in the app — cases, users, reports — is linked to this workspace.

Two, the person who signed up becomes the primary admin. For colleges, they become the Implant In-Charge. For clinics, they become the Chief Dentist. They have full access to everything in the app from day one.

Three, they land on the main dashboard and can start using the app immediately.

---

## How the Team Gets Added

This is the part most people ask about. The Implant In-Charge or Chief Dentist does not share login credentials with their team. Every team member gets their own account. Here is how it works.

The admin goes to the Users section from the dashboard menu. They tap the Add User button. A form appears where they fill in the team member's details. They enter the name, email, mobile number, select the role, and if needed select the sub-role. Then they tap Send Invite.

The system sends an email to that person. The email has a link that says Activate Account. The link is valid for 7 days. It can only be used once.

The team member opens the email, taps the link, and lands on an activation page inside the app. They see the name of the college or clinic they are joining and the role they have been assigned. They set their password, accept the Terms and Privacy Policy, and tap Create Account.

Their account is now active. They can sign in with their email and password.

That is the entire flow. The admin controls who joins. No one can sign up on their own and join a workspace they were not invited to.

4 column one column for mobile number which will be optional, invited user can add mobile number at the time of sign up or if already added in excel then should be able to change the mobile number onlt and not the email.
In case user has not downloaded the app then when clicked on the link will prompt or direct user to app store/play store to download the app, how this can be done? When Implanr app is already downloded then clicking on the email invite will open the app?

---

## Why Only the Admin Signs Up Publicly

There are a few important reasons for this.

If students or dentists could register on their own, they could pick the wrong workspace, claim the wrong role, or sign up without belonging to any institution. That creates messy data and security problems.

By keeping public signup only for the workspace owner, we ensure every user in the system was approved by someone with admin authority before they ever log in.

---

## Roles and Sub-Roles

### Dental College

Implant In-Charge has full admin access. The system allows a maximum of two Implant In-Charges per college. The first one creates the workspace. The second one gets invited by the first.

Supervisor can be added in unlimited numbers. They review and approve student cases.

Student has three sub-roles that appear as a dropdown when the admin selects Student. The options are Postgraduate Student, Undergraduate Student, and Fellow. All three have the same permissions inside the app.

Auxiliary Staff has a dropdown with Dental Hygienist and Nurse as options.

### Dental Clinic

Chief Dentist or Owner has full admin access. Maximum two per clinic, same as Implant In-Charge for colleges.

Dentist or Consultant can be added in unlimited numbers.

Auxiliary Staff has a dropdown with Nurse and Receptionist as options. The Receptionist option will have slightly different access than the Nurse in a future update. For now, both have the same access level.

---

## What the Add User Form Looks Like

When the admin taps Add User, a modal opens with these fields.

Full Name is a text input.

Email is where the invite goes.

Mobile Number is for contact and for future OTP-based verification.

Role is a dropdown. The options in the dropdown change based on whether the workspace is a college or a clinic. If it is a college, the dropdown shows Implant In-Charge, Supervisor, Student, and Auxiliary Staff. If it is a clinic, it shows Chief Dentist, Dentist, and Auxiliary Staff.

Sub-role is a second dropdown that appears only when certain roles are selected. For example, if Student is selected, a second dropdown appears with Postgraduate Student, Undergraduate Student, and Fellow. If Auxiliary Staff is selected, a second dropdown appears with the relevant options.

The Send Invite button at the bottom submits the form and triggers the email.

---

## Managing Invites

The Users page will show three sections.

Active Users are people who have already accepted their invite and set up their account.

Pending Invites are people who received an invite email but have not activated yet.

Disabled Users are people whose accounts have been deactivated by the admin.

From the Pending Invites section, the admin can do two things. They can revoke an invite if they made a mistake with the email or the role. They can also resend an invite if the person says they never received it or if the 7-day window expired.

---

## Invite Email and Activation Page

The invite email will contain the name of the institution, the name of the person being invited, and the role they are being given. There will be a single button that says Activate Account.

The activation page inside the app will show the name of the workspace, the assigned role, and ask the person to set a password and accept the terms. The email field will be locked so it cannot be changed. The name field may be editable if the person wants to adjust the formatting.

---

## Security Details

Every invite token is unique and randomly generated. It expires after 7 days. Once used, it cannot be used again. There is no way to guess or brute-force an invite link because the token is long and random.

The invited person cannot change the email they were invited with. This is intentional. The email is tied to the institutional record and the role the admin assigned.

---

## What Gets Built on the Backend

To support all of this, the backend will have two new collections in the database.

The organizations collection stores details about each workspace. This includes the org type which is either college or clinic, the name, the state, the number of seat slots, and when it was created.

The invites collection stores pending invitations. Each invite has a unique token, the email it was sent to, the assigned role and sub-role, who sent it, when it expires, and whether it was accepted or revoked.

Every user in the system is linked to their organization through an org ID field on their user record.

---

## Summary

To put it simply, here is the entire journey for a new institution joining Implanr.

Day one, the Implant In-Charge or Chief Dentist installs the app, taps Sign Up, picks their workspace type, fills in the details, and creates the workspace in about two minutes.

Same day, they go to Users and start adding their team. Each person gets an email invite.

Within a week, the full team is active and the institution is running on Implanr.

No one from the team ever has to call support or wait for account approval. It is self-serve from day one, controlled entirely by the institution's own admin.
