# Quiz Challenge — GitHub Pages + Firebase Spark

This version does not use Cloud Functions. GitHub Pages serves the website, Firebase Anonymous Authentication provides a persistent anonymous UID for the browser, and Cloud Firestore stores player profiles and leaderboard entries.

## Requirements

- A Firebase project on the Spark plan
- A registered Firebase Web App
- Cloud Firestore created in Native mode
- Anonymous sign-in enabled in Firebase Authentication
- Node.js and Firebase CLI only if deploying Firestore Rules from the command line

## 1. Configure Firebase

1. Open Firebase Console and select your project.
2. Open Project settings > General > Your apps > Web app.
3. Copy the web app configuration into `firebase-config.js`.
4. In Authentication > Sign-in method, enable **Anonymous**.
5. Create a Cloud Firestore database if one does not already exist.

## 2. Publish Firestore Security Rules

The rules in `firestore.rules` replace the old server-side-only rules. Publish them using either method:

### Firebase Console

1. Open Firestore Database > Rules.
2. Replace the rules with the complete contents of `firestore.rules`.
3. Click **Publish**.

### Firebase CLI

Run these commands from the project root:

```bash
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only firestore:rules
```

The `firebase.json` file in this project configures only Firestore Rules. It does not configure or deploy Functions.

## 3. Publish the website on GitHub Pages

Upload the contents of this folder to the repository root (including `index.html`, `app.js`, `style.css`, `firebase-config.js`, and `firestore.rules`). In GitHub, open Settings > Pages and select the branch and root folder used by the repository.

Add the GitHub Pages host (for example, `your-account.github.io`) to Firebase Authentication > Settings > Authorized domains if it is not already listed. Do not include the repository path.

## 4. How one-play-per-account works

- The app signs players in anonymously and explicitly uses browser-local Auth persistence.
- A player's Firestore document ID is their Firebase Anonymous Auth UID: `players/{uid}`. Firestore Rules accept writes only from the matching anonymous UID.
- Registration creates that document once. Returning with the same browser-stored UID reuses the existing profile.
- The final submission uses one Firestore transaction to change `players/{uid}.played` from `false` to `true` and create `leaderboard/{uid}`.
- Firestore Rules use `getAfter()` to require those two writes to happen together and reject a second submission for that UID.

### Important identity limitation

This is one play per **anonymous Firebase UID**, not one play per verified human. Clearing site data, using another browser profile, another device, or another browser can create a new anonymous UID. Without verified sign-in or a trusted backend, the app cannot reliably identify the same person across devices.

## 5. Data collections

### `players/{uid}` — private

Contains `firstName`, `lastName`, `displayName`, `phone`, `played`, `registeredAt`, and after submission `score`, `correctCount`, `submittedAt`. A signed-in player can read only their own profile. Other clients cannot list or read it.

### `leaderboard/{uid}` — public

Contains `displayName`, `score`, `correctCount`, `totalQuestions`, and `submittedAt`. Anyone can read it to display the public leaderboard. Clients cannot edit or delete an existing entry.

The legacy `phoneIndex` collection and `functions/` folder are not used by this version.

## 6. Security limitations of the Spark-only architecture

Because answer checking and score calculation happen in `app.js` in the player's browser, a player who knows how to use browser developer tools can inspect the correct answers or alter the score before submission. Firestore Rules enforce document ownership, data shape, one-time state transition, and atomic creation of the leaderboard row, but they cannot prove that a submitted score was earned by answering correctly.

Use this architecture for casual, low-stakes activities. Do not use it for high-value prizes or competitions where tamper-proof scoring is required. That requires trusted server-side scoring (for example, Cloud Functions on a compatible billing plan) and stronger identity verification.

Names and scores are publicly visible on the leaderboard. Phone numbers remain in each player's private profile, but the player can inspect their own profile in the browser. Provide an appropriate privacy notice and collect only data needed for the activity.

## 7. Customize questions

Edit the `QUESTIONS` array near the top of `app.js`. Each question has four options and a `correct` value from `0` to `3`. The default quiz has five questions, 20 points per correct answer, and a maximum of 100 points. Update the `TOTAL_QUESTIONS` and Security Rules if you change the number of questions or scoring scheme.

## 8. Testing checklist

1. Open the website in a normal browser profile and register a test player.
2. Complete and submit the quiz; confirm that a document appears in `players/{uid}` and `leaderboard/{uid}`.
3. Refresh the same browser and register again; the app should show that this UID has already played.
4. Try submitting again from the same UID; Firestore Rules should reject it.
5. Open the website in a separate browser profile for a separate test UID.
6. Check that the public leaderboard loads and that one player's phone number is not readable from another UID.

For testing a clean identity, use a separate browser profile rather than clearing data from a real participant's browser.
