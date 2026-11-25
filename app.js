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
  query,
  orderBy,
  limit,
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
    question: "น้ำประปาที่ผ่านกระบวนการผลิตมีการเติมสารใดเพื่อช่วยฆ่าเชื้อโรค?",
    options: ["คลอรีน", "น้ำตาล", "น้ำมัน", "แป้ง"],
    correct: 0
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
        <p>ตอบคำถามให้ถูกต้อง สะสมคะแนน และขึ้นสู่ Leaderboard</p>
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
      <p class="note">ข้อมูลใช้เพื่อเข้าร่วมกิจกรรมและติดต่อผู้ได้รับรางวัลเท่านั้น</p>
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

    // A document is created once per Firebase anonymous UID.
    // Returning on the same browser reuses that same account/document.
    const savedPlayer = await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(playerRef);
      if (snapshot.exists()) return snapshot.data();

      const newPlayer = {
        firstName,
        lastName,
        displayName: `${firstName} ${lastName}`,
        phone,
        played: false,
        registeredAt: serverTimestamp()
      };
      transaction.set(playerRef, newPlayer);
      return newPlayer;
    });

    player = {
      uid: user.uid,
      name: savedPlayer.displayName || `${savedPlayer.firstName} ${savedPlayer.lastName}`
    };

    if (savedPlayer.played) {
      showResult({
        score: Number(savedPlayer.score ?? 0),
        correctCount: Number(savedPlayer.correctCount ?? 0),
        totalQuestions: TOTAL_QUESTIONS,
        already: true
      });
      return;
    }

    answers = Array(TOTAL_QUESTIONS).fill(null);
    submitted = false;
    renderQuestion(0);
  } catch (error) {
    alert(messageForError(error));
    button.disabled = false;
    button.innerHTML = 'เริ่มเล่นเกม <span>→</span>';
  }
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

  try {
    const user = auth.currentUser;
    if (!user || user.uid !== player.uid) throw new Error("ไม่พบ session ผู้เล่น กรุณากลับไปลงทะเบียนอีกครั้ง");

    const playerRef = doc(db, "players", user.uid);
    const leaderboardRef = doc(db, "leaderboard", user.uid);

    // The player lock and leaderboard entry must be committed atomically.
    // Firestore Rules use getAfter() to require both writes in one transaction.
    await runTransaction(db, async (transaction) => {
      const playerSnapshot = await transaction.get(playerRef);
      const leaderboardSnapshot = await transaction.get(leaderboardRef);

      if (!playerSnapshot.exists()) throw new Error("ไม่พบข้อมูลผู้เล่น กรุณาลงทะเบียนใหม่");
      if (playerSnapshot.data().played || leaderboardSnapshot.exists()) {
        throw new Error("บัญชีนี้ส่งคำตอบไปแล้ว ไม่สามารถเล่นซ้ำได้");
      }

      const displayName = playerSnapshot.data().displayName;
      const submittedAt = serverTimestamp();

      transaction.update(playerRef, {
        played: true,
        score,
        correctCount,
        submittedAt
      });
      transaction.set(leaderboardRef, {
        displayName,
        score,
        correctCount,
        totalQuestions: TOTAL_QUESTIONS,
        submittedAt
      });
    });

    showResult({ score, correctCount, totalQuestions: TOTAL_QUESTIONS });
  } catch (error) {
    // If a previous request completed but its response was lost, show the saved result.
    try {
      const user = auth.currentUser;
      if (user && user.uid === player.uid) {
        const saved = await getDoc(doc(db, "players", user.uid));
        if (saved.exists() && saved.data().played) {
          const data = saved.data();
          showResult({
            score: Number(data.score ?? 0),
            correctCount: Number(data.correctCount ?? 0),
            totalQuestions: TOTAL_QUESTIONS,
            already: true
          });
          return;
        }
      }
    } catch (readError) {
      console.error("Could not retrieve saved player result:", readError);
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
  const alreadyPlayed = Boolean(result.already);
  root.innerHTML = `
    <section class="card result">
      <div class="trophy">${alreadyPlayed ? "✅" : "🎉"}</div>
      <small>QUIZ ${alreadyPlayed ? "ALREADY COMPLETED" : "COMPLETED"}</small>
      <h1>${alreadyPlayed ? "บัญชีนี้เล่นไปแล้ว" : "เก่งมาก!"}</h1>
      <p>${alreadyPlayed ? "บัญชีนี้ส่งคำตอบแล้ว ไม่สามารถเล่นซ้ำได้" : "คุณทำแบบทดสอบครบแล้ว"}</p>
      <div class="score-ring"><strong>${Number(result.score ?? 0)}</strong><span>คะแนน</span></div>
      <h3>${esc(player?.name ?? "ผู้เล่น")}</h3>
      <p>ตอบถูก ${Number(result.correctCount ?? 0)} จาก ${TOTAL_QUESTIONS} ข้อ</p>
      <div class="result-actions">
        <button class="primary" id="board">ดูตารางคะแนน</button>
        <button class="secondary" id="again">กลับหน้าแรก</button>
      </div>
    </section>`;
  document.querySelector("#board").onclick = leaderboard;
  document.querySelector("#again").onclick = home;
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
        <div><small>LIVE SCOREBOARD</small><h1>Leaderboard</h1><p>อันดับผู้เข้าร่วมกิจกรรม</p></div>
        <button class="secondary" id="refresh">↻ รีเฟรช</button>
      </div>
      <div class="stats">
        <div class="card stat"><span>👥</span><strong id="total">—</strong><small>ผู้เล่นในตาราง</small></div>
        <div class="card stat"><span>🏆</span><strong id="best">—</strong><small>คะแนนสูงสุด</small></div>
        <div class="card stat"><span>🎯</span><strong>${TOTAL_QUESTIONS}</strong><small>จำนวนคำถาม</small></div>
      </div>
      <section class="card board"><h2>🏆 ตารางคะแนน</h2><div id="table"><div class="loading">กำลังโหลด…</div></div></section>
      <button class="secondary back" id="back">← กลับหน้าแรก</button>
    </section>`;

  document.querySelector("#refresh").onclick = leaderboard;
  document.querySelector("#back").onclick = home;

  try {
    // A single-field query avoids requiring a composite Firestore index.
    const snapshot = await getDocs(query(
      collection(db, "leaderboard"),
      orderBy("score", "desc"),
      limit(200)
    ));

    const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    rows.sort((a, b) => {
      const scoreDifference = Number(b.score ?? 0) - Number(a.score ?? 0);
      if (scoreDifference !== 0) return scoreDifference;
      const aTime = a.submittedAt?.toMillis?.() ?? 0;
      const bTime = b.submittedAt?.toMillis?.() ?? 0;
      return aTime - bTime;
    });

    document.querySelector("#total").textContent = rows.length;
    document.querySelector("#best").textContent = rows[0]?.score ?? 0;
    document.querySelector("#table").innerHTML = rows.length
      ? `<div class="scroll"><table><thead><tr><th>อันดับ</th><th>ชื่อผู้เล่น</th><th>คะแนน</th><th>เวลาเล่น</th></tr></thead><tbody>
          ${rows.map((row, index) => `
            <tr>
              <td><span class="rank ${index < 3 ? "top" : ""}">${index < 3 ? ["🥇", "🥈", "🥉"][index] : index + 1}</span></td>
              <td class="name">${esc(row.displayName)}</td>
              <td><b class="points">${Number(row.score ?? 0)}</b></td>
              <td class="time">${row.submittedAt?.toDate ? row.submittedAt.toDate().toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
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
