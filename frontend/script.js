const API_URL = "http://localhost:8080/generate_quiz";

// ==== GLOBAL STATE ====
let currentUtterance = null;
let startTimes = [];
let answerTimes = [];
let correctness = [];
level2Btn.hidden = false; // make visible only after quiz
const recognition = new webkitSpeechRecognition();
recognition.onresult = e => { textInput.value = e.results[0][0].transcript; };
recognition.start();

// === MULTILINGUAL SPEECH-TO-TEXT ===
let recognizing = false;


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
      recognition.lang = langSelect.value; // 🔥 dynamic language
      recognition.start();
      recognizing = true;
      micBtn.textContent = "🛑 Stop";
      micStatus.textContent = `🎤 Listening (${langSelect.selectedOptions[0].text})...`;
      micStatus.style.color = "green";
    } else {
      recognition.stop();
      recognizing = false;
      micBtn.textContent = "🎙️ Speak";
      micStatus.textContent = "Stopped.";
      micStatus.style.color = "gray";
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

  document.getElementById("quizContainer").innerHTML = "<p>⚙️ Generating quiz...</p>";
const language = document.getElementById("langSelect").value;
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },  
        body: JSON.stringify({ text, count, language })

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

  let correctCount = 0;
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

    // === Text to Speech Buttons ===
    const ttsRead = qDiv.querySelector(".ttsRead");
    const ttsStop = qDiv.querySelector(".ttsStop");
    ttsRead.addEventListener("click", () => {
      const textToSpeak = [
        `Question ${i + 1}. ${q.question}`,
        ...q.options.map((o, idx) => `Option ${String.fromCharCode(65 + idx)}: ${o}`)
      ].join(". ");
      speak(textToSpeak, 1.05);
    });
    ttsStop.addEventListener("click", stopSpeech);

    // === Option Buttons ===
    const feedback = qDiv.querySelector(".feedback");
    qDiv.querySelectorAll(".optBtn").forEach(btn => {
      btn.addEventListener("click", () => {
        const elapsed = (performance.now() - startTimes[i]) / 1000;
        answerTimes[i] = Math.round(elapsed * 10) / 10;

        const isCorrect = btn.textContent.trim().includes(q.answer.trim());
        correctness[i] = isCorrect;

        if (isCorrect) {
          btn.style.background = "#22c55e";
          feedback.textContent = `✅ Correct (${answerTimes[i]}s) – ${q.explanation || ""}`;
          correctCount++;
        } else {
          btn.style.background = "#ef4444";
          feedback.textContent = `❌ Incorrect (${answerTimes[i]}s). Correct: ${q.answer}`;
        }

        qDiv.querySelectorAll(".optBtn").forEach(b => (b.disabled = true));
      });
    });
  });

  // === Show Analytics Button ===
  const showScore = document.createElement("button");
  showScore.textContent = "Show Analytics";
  showScore.className = "analyticsBtn";
  showScore.onclick = () => showAnalytics(questions);
  container.appendChild(showScore);
}

// ==== ANALYTICS & LEVEL 2 ====
function showAnalytics(questions) {
  const total = questions.length;
  const correct = correctness.filter(Boolean).length;
  const incorrect = total - correct;
  const pct = Math.round((correct / total) * 100);

  // Pie chart for score
  const ctx = document.getElementById("analyticsChart");
  new Chart(ctx, {
    type: "pie",
    data: {
      labels: ["Correct", "Incorrect"],
      datasets: [
        {
          data: [correct, incorrect],
          backgroundColor: ["#22c55e", "#ef4444"]
        }
      ]
    }
  });

  // Optional time per question
  const tctx = document.getElementById("timeChart");
  new Chart(tctx, {
    type: "bar",
    data: {
      labels: questions.map((_, i) => `Q${i + 1}`),
      datasets: [{ data: answerTimes, label: "Time (s)" }]
    }
  });

  if (pct >= 80) {
    const wants = confirm(`Great job! You scored ${pct}%. Try Level 2 (harder)?`);
    if (wants) startLevel2(questions);
  }
  document.getElementById("level2Btn").hidden = false;
document.getElementById("level2Btn").onclick = () => startLevel2(questions);

}

// ==== LEVEL 2 ====
async function startLevel2(prevQuestions) {
  const text = document.getElementById("textInput").value.trim();
  if (!text) return alert("Please enter study material first.");

  const container = document.getElementById("quizContainer");
  container.innerHTML = "<p>⚙️ Generating Level 2 (harder) quiz...</p>";
  stopSpeech();

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, count: prevQuestions.length, difficulty: "hard" })
    });
    const data = await res.json();
    if (data.questions) {
      container.innerHTML = "<h2>Level 2 — Hard</h2>";
      renderQuiz(data.questions);
    } else {
      container.innerHTML = `<p style="color:red">Failed to generate Level 2 quiz.</p>`;
    }
  } catch (e) {
    container.innerHTML = `<p style="color:red">Network error: ${e.message}</p>`;
  }
  function downloadResults(questions) {
  const total = questions.length;
  const correct = correctness.filter(Boolean).length;
  const pct = Math.round((correct / total) * 100);

  // Construct result array
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

  // Convert to JSON
  const blob = new Blob([JSON.stringify(summary, null, 2)], {
    type: "application/json",
  });

  // Trigger download
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "quiz_results.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

  // After drawing charts in showAnalytics():
const downloadBtn = document.createElement("button");
downloadBtn.textContent = "⬇️ Download Results";
downloadBtn.className = "downloadBtn";
downloadBtn.onclick = () => downloadResults(questions);
document.getElementById("quizContainer").appendChild(downloadBtn);
// --- Level 2 button (always visible, optional) ---
const level2Btn = document.createElement("button");
level2Btn.textContent = "🔥 Go to Level 2 (Hard)";
level2Btn.className = "level2Btn";
level2Btn.onclick = () => startLevel2(questions);
document.getElementById("quizContainer").appendChild(level2Btn);
console.log("SpeechRecognition supported:", 'webkitSpeechRecognition' in window);

}
