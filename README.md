# Quiz Challenge — GitHub Pages + Firebase Spark

This version does not use Cloud Functions. GitHub Pages serves the website, Firebase Anonymous Authentication provides a persistent anonymous UID for the browser, and Cloud Firestore stores player profiles, every quiz attempt, and each player's best leaderboard score.

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

The rules in `firestore.rules` replace the previous one-play-only rules. Publish them using either method:

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

The `firebase.json` file configures only Firestore Rules. It does not configure or deploy Functions.

## 3. Publish the website on GitHub Pages

Upload the contents of this folder to the repository root (including `index.html`, `app.js`, `style.css`, `firebase-config.js`, and `firestore.rules`). In GitHub, open Settings > Pages and select the branch and root folder used by the repository.

Add the GitHub Pages host (for example, `your-account.github.io`) to Firebase Authentication > Settings > Authorized domains if it is not already listed. Do not include the repository path.

## 4. Repeat-play and scoring behavior

- The app signs players in anonymously and uses browser-local Auth persistence.
- The same anonymous UID can play repeatedly in the same browser profile.
- Every completed play creates a new document at `players/{uid}/attempts/{attemptId}`. Attempt documents are private to the owning UID.
- The parent `players/{uid}` document tracks the attempt count and most recent attempt ID/time.
- The public `leaderboard/{uid}` document stores one row per player and is updated only when the new score is strictly higher than that player's previous best score.
- Therefore, every attempt is retained, but the leaderboard ranks each UID by its best score. If scores are tied, the existing best result is retained (the earliest result that established that score).
- The result screen shows the score from the current attempt, the attempt number, and the player's best score so far.

### Existing test data from the previous build

The app and Rules can read legacy leaderboard rows that use the old `score` field. If a returning player earns a higher score, their row is converted to the new `bestScore` format. If their new score is lower, their previous leaderboard score remains displayed as their best. Existing one-time submissions from the old build are not automatically copied into the new `attempts` subcollection; only attempts made with this build are stored there individually.

### Identity limitation

Repeat-play is unlimited per **anonymous Firebase UID**. The same browser profile normally reuses that UID. Clearing site data, using another browser profile, or changing devices can create a new UID and a separate leaderboard entry. Without verified sign-in or a trusted backend, the app cannot reliably identify the same person across devices.

## 5. Data collections

### `players/{uid}` — private profile

Contains `firstName`, `lastName`, `displayName`, `phone`, `attemptCount`, `registeredAt`, and the most recent `lastPlayedAt` / `lastAttemptId`. A player can read only their own profile. Other clients cannot list or read it.

### `players/{uid}/attempts/{attemptId}` — private play history

Each completed attempt stores `displayName`, `attemptNumber`, `score`, `correctCount`, `totalQuestions`, and `submittedAt`. Only the owning UID can read its attempt history. Attempts cannot be edited or deleted by clients.

### `leaderboard/{uid}` — public best score

Contains `displayName`, `bestScore`, `bestCorrectCount`, `totalQuestions`, `bestSubmittedAt`, and `latestAttemptId`. Anyone can read it to display the leaderboard. Clients can create a row and update it only when the new score is strictly higher than the stored best. Clients cannot delete it.

## 6. Security limitations of the Spark-only architecture

Because answer checking and score calculation happen in `app.js` in the player's browser, a technically capable player can inspect the correct answers or alter the score before submission. Firestore Rules enforce UID ownership, data shape, one new attempt per transaction, append-only attempt history, and best-score-only leaderboard updates, but they cannot prove that a submitted score was earned by answering correctly.

Use this architecture for casual, low-stakes activities. Do not use it for high-value prizes or competitions where tamper-proof scoring is required. That requires trusted server-side scoring and stronger identity verification.

Names and scores are publicly visible on the leaderboard. Phone numbers remain in each player's private profile. Provide an appropriate privacy notice and collect only data needed for the activity.

## 7. Customize questions

Edit the `QUESTIONS` array near the top of `app.js`. Each question has four options and a `correct` value from `0` to `3`. The default quiz has five questions, 20 points per correct answer, and a maximum of 100 points. Update `TOTAL_QUESTIONS`, the score validation in `firestore.rules`, and the result text if you change the number of questions or scoring scheme.

## 8. Testing checklist

1. Open the website in a normal browser profile and register a test player.
2. Complete and submit the quiz; confirm a new document appears in `players/{uid}/attempts`.
3. Confirm `players/{uid}.attemptCount` increases by one.
4. Confirm `leaderboard/{uid}` contains the player's best score.
5. Play again with the same browser profile; confirm a second attempt document is created.
6. Submit a lower score and confirm the leaderboard best score does not decrease.
7. Submit a higher score and confirm the leaderboard best score increases.
8. Open the leaderboard and confirm each UID appears only once.
9. Check that another UID cannot read the player's profile or attempt history.

For testing a clean identity, use a separate browser profile rather than clearing data from a real participant's browser.
