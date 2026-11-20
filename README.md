# Quiz Challenge — GitHub Pages + Firebase (server-side scoring)

## Requirements
Firebase project, Node.js 20, Firebase CLI (`npm install -g firebase-tools`). Cloud Functions deployment may require the Blaze billing plan; review current Firebase requirements.

## Setup
1. Create Firebase project and register a Web app. Copy config into `firebase-config.js`.
2. Authentication > Sign-in method: enable **Anonymous**.
3. Create Firestore Database.
4. Install Firebase CLI and run `firebase login`.
5. In this folder run `firebase use --add` and select your project.
6. Deploy rules/functions: `firebase deploy --only firestore:rules,functions`.
7. Upload root files to GitHub. Settings > Pages > Deploy from branch > `main` > `/ (root)`.

## Customize questions
Edit `QUESTIONS` in `functions/index.js`. `correct` is index 0–3. Score is 20 per correct answer; adjust scoring if desired.

## Data collections
- `players/{uid}`: private registration/phone/submission state. Client denied.
- `phoneIndex/{sha256(phone)}`: duplicate phone index. Client denied.
- `leaderboard/{uid}`: public display name, score and server timestamp. Read-only from client; Cloud Functions Admin writes.

## Security/limitations
Server computes score and disallows second submission per anonymous auth UID. Phone is not SMS-verified; users may clear browser/session or use another device to obtain another anonymous identity. Public leaderboard exposes names. For prize competitions, add phone verification, rate limiting, moderation and a privacy notice/consent flow.
