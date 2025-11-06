const API_URL = "/api/generate_quiz"; // use "/api" if deployed on vercel

// ==== GLOBAL STATE ====
let currentUtterance = null;
let recognition = null;
let recognizing = false;
let startTimes = [];
let answerTimes = [];
let correctness = [];

// ==== TEXT TO SPEECH ====
function speak(text, rate = 1.0) {
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    currentUtterance = u;
    window.speechSynthesis.speak(u);
  } catch (e) {
    console.warn("TTS unavailable:", e);
  }
}

function stopSpeech() {
  try { window.speechSynthesis.cancel(); } catch (e) {}
}

// ==== SPEECH RECOGNITION ====
console.log("SpeechRecognition supported:", 'webkitSpeechRecognition' in window);

if ('webkitSpeechRecognition' in window) {
  recognition = new webkitSpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;

  const micBtn = document.getElementById("micBtn");
  const micStatus = document.getElementById("micStatus");
  const textInput = document.getElementById("textInput");
  const langSelect = document.getElementById("langSelect");

  micBtn.addEventListener("click", () => {
    if (!recognizing) {
      recognition.lang = langSelect.value;
      recognition.start();
      recognizing = true;
      micBtn.textContent = "🛑 Stop";
      micStatus.textContent = `🎤 Listening (${langSelect.selectedOptions[0].text})...`;
      micStatus.style.color = "green";
    } else {
      recognition.stop();
    }
  });

  recognition.onresult = (event) => {
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    textInput.value = transcript.trim();
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
    micStatus.textContent = "Error: " + event.error;
    micStatus.style.color = "red";
  };

  recognition.onend = () => {
    recognizing = false;
    micBtn.textContent = "🎙️ Speak";
    micStatus.textContent = "Stopped.";
    micStatus.style.color = "gray";
  };
} else {
  console.warn("Speech recognition not supported in this browser.");
  const micBtn = document.getElementById("micBtn");
  micBtn.disabled = true;
  micBtn.textContent = "🎙️ Not supported";
}

// ==== QUIZ GENERATION ====
document.getElementById("generateBtn").addEventListener("click", async () => {
  const text = document.getElementById("textInput").value.trim();
  if (!text) return alert("Please enter study material first!");
  const count = parseInt(prompt("How many questions do you want? (1–15)", "5"), 10) || 5;
  const language = document.getElementById("langSelect").value;

  const container = document.getElementById("quizContainer");
  container.innerHTML = "<p>⚙️ Generating quiz...</p>";

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, count, language }),
    });

    const data = await res.json();
    if (!data.questions) throw new Error("No questions returned.");

    renderQuiz(data.questions);
  } catch (err) {
    console.error("❌ Fetch failed:", err);
    alert("Failed to generate quiz. Check console.");
  }
});

// ==== RENDER QUIZ ====
function renderQuiz(questions) {
  const container = document.getElementById("quizContainer");
  container.innerHTML = "";
  startTimes = [];
  answerTimes = [];
  correctness = [];

  questions.forEach((q, i) => {
    const qDiv = document.createElement("div");
    qDiv.className = "question";
    startTimes[i] = performance.now();

    qDiv.innerHTML = `
      <h3>${i + 1}. ${q.question}</h3>
      ${q.options.map(opt => `<button class="optBtn">${opt}</button>`).join("")}
      <div class="ttsControls">
        <button class="ttsRead">🔊 Read</button>
        <button class="ttsStop">⏹ Stop</button>
      </div>
      <p class="feedback"></p>
    `;

    container.appendChild(qDiv);

    // TTS
    qDiv.querySelector(".ttsRead").addEventListener("click", () => {
      const textToSpeak = [
        `Question ${i + 1}. ${q.question}`,
        ...q.options.map((o, idx) => `Option ${String.fromCharCode(65 + idx)}: ${o}`)
      ].join(". ");
      speak(textToSpeak, 1.05);
    });
    qDiv.querySelector(".ttsStop").addEventListener("click", stopSpeech);

    // Options
    const feedback = qDiv.querySelector(".feedback");
    qDiv.querySelectorAll(".optBtn").forEach(btn => {
      btn.addEventListener("click", () => {
        const elapsed = (performance.now() - startTimes[i]) / 1000;
        answerTimes[i] = Math.round(elapsed * 10) / 10;
        const isCorrect = btn.textContent.trim().includes(q.answer.trim());
        correctness[i] = isCorrect;

        btn.classList.add(isCorrect ? "correctBtn" : "wrongBtn");
        feedback.textContent = isCorrect
          ? `✅ Correct (${answerTimes[i]}s) – ${q.explanation || ""}`
          : `❌ Incorrect (${answerTimes[i]}s). Correct: ${q.answer}`;

        feedback.className = "feedback " + (isCorrect ? "correct" : "incorrect");
        qDiv.querySelectorAll(".optBtn").forEach(b => (b.disabled = true));
      });
    });
  });

  const showScore = document.createElement("button");
  showScore.textContent = "📊 Show Analytics";
  showScore.className = "analyticsBtn";
  showScore.onclick = () => showAnalytics(questions);
  container.appendChild(showScore);
}

// ==== ANALYTICS ====
function showAnalytics(questions) {
  const total = questions.length;
  const correct = correctness.filter(Boolean).length;
  const incorrect = total - correct;
  const pct = Math.round((correct / total) * 100);

  const ctx = document.getElementById("analyticsChart");
  new Chart(ctx, {
    type: "pie",
    data: {
      labels: ["Correct", "Incorrect"],
      datasets: [{ data: [correct, incorrect], backgroundColor: ["#22c55e", "#ef4444"] }],
    },
  });

  const tctx = document.getElementById("timeChart");
  new Chart(tctx, {
    type: "bar",
    data: {
      labels: questions.map((_, i) => `Q${i + 1}`),
      datasets: [{ data: answerTimes, label: "Time (s)" }],
    },
  });

  const downloadBtn = document.createElement("button");
  downloadBtn.textContent = "⬇️ Download Results";
  downloadBtn.className = "downloadBtn";
  downloadBtn.onclick = () => downloadResults(questions);
  document.getElementById("quizContainer").appendChild(downloadBtn);

  if (pct >= 80) {
    const wants = confirm(`🎯 You scored ${pct}%. Want to try Level 2 (harder)?`);
    if (wants) startLevel2(questions);
  }
}

// ==== DOWNLOAD RESULTS ====
function downloadResults(questions) {
  const total = questions.length;
  const correct = correctness.filter(Boolean).length;
  const pct = Math.round((correct / total) * 100);

  const results = questions.map((q, i) => ({
    number: i + 1,
    question: q.question,
    correctAnswer: q.answer,
    userCorrect: correctness[i] ? "Yes" : "No",
    timeSeconds: answerTimes[i] || 0,
  }));

  const summary = {
    totalQuestions: total,
    correctAnswers: correct,
    scorePercent: pct,
    timestamp: new Date().toLocaleString(),
    results,
  };

  const blob = new Blob([JSON.stringify(summary, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "quiz_results.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ==== LEVEL 2 ====
async function startLevel2(prevQuestions) {
  const text = document.getElementById("textInput").value.trim();
  const container = document.getElementById("quizContainer");
  container.innerHTML = "<p>⚙️ Generating Level 2 (harder) quiz...</p>";
  stopSpeech();

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, count: prevQuestions.length, difficulty: "hard" }),
    });
    const data = await res.json();
    if (data.questions) {
      container.innerHTML = "<h2>🔥 Level 2 — Hard</h2>";
      renderQuiz(data.questions);
    } else {
      container.innerHTML = `<p style="color:red">Failed to generate Level 2 quiz.</p>`;
    }
  } catch (e) {
    container.innerHTML = `<p style="color:red">Network error: ${e.message}</p>`;
  }
}
