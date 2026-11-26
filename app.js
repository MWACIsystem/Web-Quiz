import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  doc,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const root = document.querySelector("#app");

// Answers are checked in the browser in the Spark-only version.
// This means a technically capable player can inspect or alter them.
const QUESTIONS = [
  {
    question: "ตัวอักษร R ในแนวคิด QWATER ของ กปน. หมายถึงข้อใด?",
    options: ["Responsibility – รับผิดชอบต่อสังคม","Reputation – สร้างชื่อเสียงความภูมิใจให้ กปน.","Respect to Transparency – ด้วยความโปร่งใส","Reliability – สร้างความน่าเชื่อถือ"],
    correct: 2
  },
  {
    question: "ข้อใดเป็นวิธีประหยัดน้ำที่เหมาะสม?",
    options: ["เปิดน้ำทิ้งไว้", "ซ่อมก๊อกที่รั่ว", "ล้างรถทุกวัน", "ปล่อยน้ำไหลตอนแปรงฟัน"],
    correct: 1
  },
  {
    question: "ควรทำอย่างไรเมื่อพบเห็นท่อประปารั่ว?",
    options: ["ปล่อยไว้", "แจ้งหน่วยงานที่เกี่ยวข้อง", "เอาดินกลบ", "รอให้หยุดเอง"],
    correct: 1
  },
  {
    question: "น้ำมีความสำคัญต่อสิ่งมีชีวิตอย่างไร?",
    options: ["ไม่มีความสำคัญ", "ใช้เฉพาะทำความสะอาด", "จำเป็นต่อการดำรงชีวิต", "ใช้แทนอาหารได้"],
    correct: 2
  },
  {
    question: "การใช้น้ำอย่างรู้คุณค่าคือข้อใด?",
    options: ["ใช้น้ำเกินจำเป็น", "เปิดน้ำทิ้ง", "ใช้เท่าที่จำเป็นและปิดเมื่อไม่ใช้", "ไม่ตรวจอุปกรณ์"],
    correct: 2
  }
];

const TOTAL_QUESTIONS = QUESTIONS.length;
const POINTS_PER_QUESTION = 20;
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[char]));

let player = null;
let answers = [];
let submitted = false;
let authStatePromise = null;
const persistenceReady = setPersistence(auth, browserLocalPersistence);

async function ensureAnonymousUser() {
  await persistenceReady;

  // Wait until Firebase has restored any anonymous account saved in this browser.
  if (!authStatePromise) {
    authStatePromise = new Promise((resolve) => {
      let unsubscribe = () => {};
      unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe();
        resolve(user);
      });
    });
  }

  const restoredUser = await authStatePromise;
  if (auth.currentUser) return auth.currentUser;
  if (restoredUser) return restoredUser;

  const credential = await signInAnonymously(auth);
  return credential.user;
}

function home() {
  player = null;
  answers = [];
  submitted = false;
  root.innerHTML = `
    <section class="hero">
      <div class="art"><div class="circle"></div><div class="trophy">🏆</div><span class="spark">✦</span></div>
      <div>
        <small>READY TO PLAY?</small>
        <h1>ท้าทายความรู้<br><em>ลุ้นคะแนนสูงสุด!</em></h1>
        <p>เล่นได้หลายครั้ง ระบบบันทึกทุกผลการเล่น และจัดอันดับด้วยคะแนนสูงสุด</p>
        <div class="tags"><span>✦ 5 คำถาม</span><span>✦ 4 ตัวเลือก</span><span>✦ เล่นฟรี</span></div>
      </div>
    </section>
    <section class="card register">
      <div class="heading"><span class="icon">👤</span><div><h2>ลงทะเบียนผู้เล่น</h2><p>กรอกข้อมูลก่อนเริ่มกิจกรรม</p></div></div>
      <form id="reg" class="form">
        <label>ชื่อ<input name="firstName" required maxlength="60" placeholder="กรอกชื่อ"></label>
        <label>นามสกุล<input name="lastName" required maxlength="60" placeholder="กรอกนามสกุล"></label>
        <label class="wide">เบอร์โทรศัพท์<input name="phone" required inputmode="tel" pattern="[0-9+\\- ]{8,20}" maxlength="20" placeholder="กรอกเบอร์โทรศัพท์"></label>
        <button class="primary wide">เริ่มเล่นเกม <span>→</span></button>
      </form>
      <p class="note">ระบบจะบันทึกคะแนนทุกครั้งที่เล่น และใช้คะแนนสูงสุดของคุณในการจัดอันดับ</p>
    </section>`;
  document.querySelector("#reg").onsubmit = register;
}

async function register(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const formData = new FormData(form);
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const phoneInput = String(formData.get("phone") ?? "").trim();
  const phone = phoneInput.replace(/[\s-]/g, "");
  const button = form.querySelector("button");

  if (!firstName || !lastName || firstName.length > 60 || lastName.length > 60) {
    alert("กรุณากรอกชื่อและนามสกุลให้ถูกต้อง");
    return;
  }
  if (!/^\+?[0-9]{8,15}$/.test(phone)) {
    alert("กรุณากรอกเบอร์โทรศัพท์ 8–15 หลัก");
    return;
  }

  button.disabled = true;
  button.textContent = "กำลังลงทะเบียน…";

  try {
    const user = await ensureAnonymousUser();
    const playerRef = doc(db, "players", user.uid);

    // The same anonymous UID reuses its original profile, but can start another attempt.
    const savedPlayer = await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(playerRef);
      if (snapshot.exists()) return snapshot.data();

      const newPlayer = {
        firstName,
        lastName,
        displayName: `${firstName} ${lastName}`,
        phone,
        attemptCount: 0,
        registeredAt: serverTimestamp()
      };
      transaction.set(playerRef, newPlayer);
      return newPlayer;
    });

    player = {
      uid: user.uid,
      name: savedPlayer.displayName || `${savedPlayer.firstName} ${savedPlayer.lastName}`
    };

    startQuiz();
  } catch (error) {
    alert(messageForError(error));
    button.disabled = false;
    button.innerHTML = 'เริ่มเล่นเกม <span>→</span>';
  }
}

function startQuiz() {
  answers = Array(TOTAL_QUESTIONS).fill(null);
  submitted = false;
  renderQuestion(0);
}

function renderQuestion(index) {
  const question = QUESTIONS[index];
  const percent = Math.round((index / TOTAL_QUESTIONS) * 100);
  const previewScore = answers.reduce((sum, answer, questionIndex) => {
    return sum + (answer === QUESTIONS[questionIndex].correct ? POINTS_PER_QUESTION : 0);
  }, 0);

  root.innerHTML = `
    <section class="quiz">
      <div class="quiz-top"><span class="pill">QUIZ TIME</span><span class="score">⭐ ${previewScore} คะแนน*</span></div>
      <div class="progress-label"><span>คำถามที่ ${index + 1} / ${TOTAL_QUESTIONS}</span><span>${percent}%</span></div>
      <div class="progress"><i style="width:${percent}%"></i></div>
      <article class="card question">
        <small>QUESTION ${String(index + 1).padStart(2, "0")}</small>
        <h2>${esc(question.question)}</h2>
        <div class="options">${question.options.map((option, optionIndex) => `
          <button class="option ${answers[index] === optionIndex ? "selected" : ""}" data-i="${optionIndex}">
            <span class="letter">${"ABCD"[optionIndex]}</span>${esc(option)}
          </button>`).join("")}
        </div>
        <div class="quiz-actions">
          <button class="secondary" id="prev" ${index === 0 ? "disabled" : ""}>← ย้อนกลับ</button>
          <button class="primary" id="next" ${answers[index] === null ? "disabled" : ""}>${index === TOTAL_QUESTIONS - 1 ? "ส่งคำตอบ" : "ข้อถัดไป"} →</button>
        </div>
      </article>
      <p class="note center">* คะแนนแสดงโดยประมาณ ระบบจะบันทึกคะแนนเมื่อส่งเกมเสร็จ</p>
    </section>`;

  document.querySelectorAll(".option").forEach((button) => {
    button.onclick = () => {
      answers[index] = Number(button.dataset.i);
      renderQuestion(index);
    };
  });
  document.querySelector("#prev").onclick = () => renderQuestion(index - 1);
  document.querySelector("#next").onclick = () => {
    if (index === TOTAL_QUESTIONS - 1) finish();
    else renderQuestion(index + 1);
  };
}

async function finish() {
  if (submitted || !player) return;
  if (answers.length !== TOTAL_QUESTIONS || answers.some((answer) => !Number.isInteger(answer))) {
    alert("กรุณาตอบคำถามให้ครบทุกข้อ");
    return;
  }

  submitted = true;
  root.innerHTML = `
    <section class="card result"><div class="trophy">⏳</div><h1>กำลังบันทึกคะแนน</h1><p>กรุณาอย่าปิดหน้านี้</p></section>`;

  const correctCount = answers.reduce((sum, answer, index) => {
    return sum + (answer === QUESTIONS[index].correct ? 1 : 0);
  }, 0);
  const score = correctCount * POINTS_PER_QUESTION;

  let attemptRef = null;
  try {
    const user = auth.currentUser;
    if (!user || user.uid !== player.uid) throw new Error("ไม่พบ session ผู้เล่น กรุณากลับไปลงทะเบียนอีกครั้ง");

    const playerRef = doc(db, "players", user.uid);
    const leaderboardRef = doc(db, "leaderboard", user.uid);
    // A separate document is created for every completed attempt.
    attemptRef = doc(collection(db, "players", user.uid, "attempts"));

    const savedResult = await runTransaction(db, async (transaction) => {
      const playerSnapshot = await transaction.get(playerRef);
      const leaderboardSnapshot = await transaction.get(leaderboardRef);

      if (!playerSnapshot.exists()) throw new Error("ไม่พบข้อมูลผู้เล่น กรุณาลงทะเบียนใหม่");

      const playerData = playerSnapshot.data();
      // Legacy accounts from the one-play version may not have attemptCount yet.
      const previousAttempts = Number(playerData.attemptCount ?? (playerData.played ? 1 : 0));
      const attemptNumber = previousAttempts + 1;
      const submittedAt = serverTimestamp();

      transaction.update(playerRef, {
        attemptCount: attemptNumber,
        lastPlayedAt: submittedAt,
        lastAttemptId: attemptRef.id
      });

      transaction.set(attemptRef, {
        displayName: playerData.displayName,
        attemptNumber,
        score,
        correctCount,
        totalQuestions: TOTAL_QUESTIONS,
        submittedAt
      });

      // Keep one public leaderboard row per UID, containing that player's best score.
      // Older Spark builds used `score`; read it as a legacy best score during transition.
      const oldBoard = leaderboardSnapshot.exists() ? leaderboardSnapshot.data() : null;
      const previousBest = oldBoard
        ? Number(oldBoard.bestScore ?? oldBoard.score ?? -1)
        : -1;
      const isNewBest = score > previousBest;
      const bestScore = isNewBest ? score : previousBest;
      const bestCorrectCount = isNewBest
        ? correctCount
        : Number(oldBoard?.bestCorrectCount ?? oldBoard?.correctCount ?? 0);

      if (isNewBest) {
        transaction.set(leaderboardRef, {
          displayName: playerData.displayName,
          bestScore: score,
          bestCorrectCount: correctCount,
          totalQuestions: TOTAL_QUESTIONS,
          bestSubmittedAt: submittedAt,
          latestAttemptId: attemptRef.id
        });
      }

      return { attemptNumber, bestScore, isNewBest };
    });

    showResult({
      score,
      correctCount,
      totalQuestions: TOTAL_QUESTIONS,
      attemptNumber: savedResult.attemptNumber,
      bestScore: savedResult.bestScore,
      isNewBest: savedResult.isNewBest
    });
  } catch (error) {
    // Recover gracefully if the transaction committed but the response was interrupted.
    try {
      const user = auth.currentUser;
      if (user && user.uid === player.uid && attemptRef) {
        const [attemptSnapshot, leaderboardSnapshot] = await Promise.all([
          getDoc(attemptRef),
          getDoc(doc(db, "leaderboard", user.uid))
        ]);
        if (attemptSnapshot.exists()) {
          const attempt = attemptSnapshot.data();
          const board = leaderboardSnapshot.exists() ? leaderboardSnapshot.data() : {};
          showResult({
            score: Number(attempt.score ?? 0),
            correctCount: Number(attempt.correctCount ?? 0),
            totalQuestions: Number(attempt.totalQuestions ?? TOTAL_QUESTIONS),
            attemptNumber: Number(attempt.attemptNumber ?? 1),
            bestScore: Number(board.bestScore ?? board.score ?? attempt.score ?? 0),
            isNewBest: board.latestAttemptId === attemptRef.id
          });
          return;
        }
      }
    } catch (readError) {
      console.error("Could not retrieve saved attempt:", readError);
    }

    submitted = false;
    root.innerHTML = `
      <section class="card result">
        <h1>ส่งคำตอบไม่สำเร็จ</h1>
        <p>${esc(messageForError(error))}</p>
        <button class="primary" id="retry">ลองอีกครั้ง</button>
        <button class="secondary" id="backHome" style="margin-top:10px">กลับหน้าแรก</button>
      </section>`;
    document.querySelector("#retry").onclick = finish;
    document.querySelector("#backHome").onclick = home;
  }
}

function showResult(result) {
  root.innerHTML = `
    <section class="card result">
      <div class="trophy">${result.isNewBest ? "🏆" : "🎉"}</div>
      <small>QUIZ COMPLETED · ATTEMPT ${Number(result.attemptNumber ?? 1)}</small>
      <h1>${result.isNewBest ? "ทำคะแนนสูงสุดใหม่!" : "บันทึกผลเรียบร้อย!"}</h1>
      <p>ระบบบันทึกผลการเล่นครั้งนี้แล้ว</p>
      <div class="score-ring"><strong>${Number(result.score ?? 0)}</strong><span>คะแนนครั้งนี้</span></div>
      <h3>${esc(player?.name ?? "ผู้เล่น")}</h3>
      <p>ตอบถูก ${Number(result.correctCount ?? 0)} จาก ${Number(result.totalQuestions ?? TOTAL_QUESTIONS)} ข้อ</p>
      <p><strong>คะแนนสูงสุดของคุณ: ${Number(result.bestScore ?? result.score ?? 0)} คะแนน</strong></p>
      <div class="result-actions">
        <button class="primary" id="again">เล่นอีกครั้ง</button>
        <button class="secondary" id="board">ดูตารางคะแนน</button>
        <button class="secondary" id="backHome">กลับหน้าแรก</button>
      </div>
    </section>`;
  document.querySelector("#again").onclick = startQuiz;
  document.querySelector("#board").onclick = leaderboard;
  document.querySelector("#backHome").onclick = home;
}

function messageForError(error) {
  const code = error?.code ?? "";
  if (code === "auth/operation-not-allowed") return "ยังไม่ได้เปิดใช้งาน Anonymous ใน Firebase Authentication";
  if (code === "permission-denied" || code === "firestore/permission-denied") {
    return "Firestore ปฏิเสธการบันทึกข้อมูล กรุณาตรวจสอบว่าได้เผยแพร่ Firestore Rules เวอร์ชันใหม่แล้ว";
  }
  if (code === "unavailable" || code === "firestore/unavailable") return "เชื่อมต่อ Firebase ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง";
  return error?.message?.replace(/^Firebase: /, "") || "เกิดข้อผิดพลาด กรุณาลองใหม่";
}

async function leaderboard() {
  root.innerHTML = `
    <section class="dashboard">
      <div class="dashhead">
        <div><small>LIVE SCOREBOARD</small><h1>Leaderboard</h1><p>จัดอันดับด้วยคะแนนสูงสุดของผู้เล่นแต่ละคน</p></div>
        <button class="secondary" id="refresh">↻ รีเฟรช</button>
      </div>
      <div class="stats">
        <div class="card stat"><span>👥</span><strong id="total">—</strong><small>ผู้เล่นในตาราง</small></div>
        <div class="card stat"><span>🏆</span><strong id="best">—</strong><small>คะแนนสูงสุด</small></div>
        <div class="card stat"><span>🎯</span><strong>${TOTAL_QUESTIONS}</strong><small>จำนวนคำถาม</small></div>
      </div>
      <section class="card board"><h2>🏆 ตารางคะแนน (นับคะแนนดีที่สุด)</h2><div id="table"><div class="loading">กำลังโหลด…</div></div></section>
      <button class="secondary back" id="back">← กลับหน้าแรก</button>
    </section>`;

  document.querySelector("#refresh").onclick = leaderboard;
  document.querySelector("#back").onclick = home;

  try {
    // Read one public best-score document per UID. Read all rows to include legacy entries
    // that used the old `score` field, then normalize the field in the browser.
    const snapshot = await getDocs(collection(db, "leaderboard"));
    const rows = snapshot.docs.map((item) => {
      const data = item.data();
      return {
        id: item.id,
        ...data,
        displayScore: Number(data.bestScore ?? data.score ?? 0),
        displayDate: data.bestSubmittedAt ?? data.submittedAt ?? null
      };
    });

    rows.sort((a, b) => {
      const scoreDifference = b.displayScore - a.displayScore;
      if (scoreDifference !== 0) return scoreDifference;
      const aTime = a.displayDate?.toMillis?.() ?? 0;
      const bTime = b.displayDate?.toMillis?.() ?? 0;
      return aTime - bTime;
    });
    const visibleRows = rows.slice(0, 200);

    document.querySelector("#total").textContent = rows.length;
    document.querySelector("#best").textContent = visibleRows[0]?.displayScore ?? 0;
    document.querySelector("#table").innerHTML = visibleRows.length
      ? `<div class="scroll"><table><thead><tr><th>อันดับ</th><th>ชื่อผู้เล่น</th><th>คะแนนสูงสุด</th><th>วันที่ทำคะแนนสูงสุด</th></tr></thead><tbody>
          ${visibleRows.map((row, index) => `
            <tr>
              <td><span class="rank ${index < 3 ? "top" : ""}">${index < 3 ? ["🥇", "🥈", "🥉"][index] : index + 1}</span></td>
              <td class="name">${esc(row.displayName)}</td>
              <td><b class="points">${row.displayScore}</b></td>
              <td class="time">${row.displayDate?.toDate ? row.displayDate.toDate().toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
            </tr>`).join("")}
        </tbody></table></div>`
      : `<div class="empty">ยังไม่มีผู้เล่น ลองเป็นคนแรก! 🎮</div>`;
  } catch (error) {
    document.querySelector("#table").innerHTML = `<div class="empty error">โหลดคะแนนไม่สำเร็จ<br>${esc(messageForError(error))}</div>`;
  }
}

document.querySelector("#leaderboardNav").onclick = leaderboard;
document.querySelector("#home").onclick = (event) => {
  event.preventDefault();
  home();
};
home();
