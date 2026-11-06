// ==========================================
// ARIM AI - VOICE ASSISTANT (STANDALONE)
// ==========================================
// Expects these elements in your HTML:
// #startBtn, #stopBtn, #status, #output, #aiactive, .core, .ring
// Load this file with <script src="arim-standalone.js" defer></script>

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');
const output = document.getElementById('output');
const aiActive = document.getElementById('aiactive');
const core = document.querySelector('.core');
const rings = document.querySelectorAll('.ring');

if (!startBtn || !stopBtn || !statusEl || !output || !aiActive || !core) {
  throw new Error('ARIM setup error: HTML is missing one or more required IDs/classes.');
}

let isActive = false;
let isSpeaking = false;
let isAwaitingResponse = false;
let isRecognizing = false;
let recognition = null;
let requestController = null;
let processTimer = null;
let restartTimer = null;
let finalTranscript = '';
let lastProcessedText = '';

const GROQ_API_KEY = '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';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// SECURITY: Any API key in browser JavaScript is visible to site visitors.
// Use only a key you are willing to expose, set strict usage limits, and rotate it often.

const startSound = new Audio('startsound.mp3');
const endSound = new Audio('endsound.mp3');
const errorSound = new Audio('errorsound.mp3');

async function getGroqResponse(userText) {
  if (!GROQ_API_KEY || GROQ_API_KEY === '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') {
    return 'Add your Groq API key in the GROQ_API_KEY line in this file.';
  }

  const localController = new AbortController();
  requestController = localController;
  const timeoutId = setTimeout(() => localController.abort(), 20000);

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`
      },
      signal: localController.signal,
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are ARIM, a helpful voice assistant. Answer naturally, clearly, and concisely. Reply in the same language as the user. Keep answers suitable for voice output.'
          },
          { role: 'user', content: userText }
        ],
        temperature: 0.7,
        max_tokens: 250,
        stream: false
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('Groq API error:', response.status, data);
      return data?.error?.message || `Groq request failed (${response.status}). Check your API key, model, and account limits.`;
    }

    return data?.choices?.[0]?.message?.content?.trim() || 'I could not generate a response.';
  } catch (error) {
    console.error('Groq connection error:', error);
    if (error.name === 'AbortError') return 'Request timed out. Please try again.';
    return 'Could not connect to Groq. Check your internet and browser console.';
  } finally {
    clearTimeout(timeoutId);
    if (requestController === localController) requestController = null;
  }
}

function setListeningUI(listening) {
  startBtn.disabled = listening;
  stopBtn.disabled = !listening;
  core.classList.toggle('core-wifi', false);
  if (listening) {
    core.classList.add('active');
    rings.forEach(ring => { ring.classList.remove('pulse2'); ring.classList.add('pulse'); });
    aiActive.textContent = 'ARIM Assistant Active';
  } else {
    core.classList.remove('active');
    rings.forEach(ring => { ring.classList.remove('pulse', 'pulse2'); });
    aiActive.textContent = 'ARIM Assistant Disabled';
  }
}

function restartRecognition() {
  if (!isActive || isSpeaking || isAwaitingResponse || isRecognizing || !recognition) return;
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    if (!isActive || isSpeaking || isAwaitingResponse || isRecognizing) return;
    try { recognition.start(); }
    catch (error) { console.warn('Could not restart speech recognition:', error.message); }
  }, 500);
}

function initRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    statusEl.textContent = 'Speech recognition is not supported in this browser. Try Chrome or Edge, or use typed input if your page has it.';
    return false;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'en-US'; // Change to 'ur-PK' or 'hi-IN' if needed and supported.
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    isRecognizing = true;
    finalTranscript = '';
    statusEl.textContent = 'Listening…';
  };

  recognition.onresult = event => {
    if (isSpeaking || isAwaitingResponse) return;
    let newFinalText = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) newFinalText += `${event.results[i][0].transcript} `;
    }
    if (!newFinalText.trim()) return;

    finalTranscript += newFinalText;
    statusEl.textContent = `Heard: “${finalTranscript.trim()}”`;
    clearTimeout(processTimer);
    processTimer = setTimeout(() => {
      if (isActive && !isSpeaking && !isAwaitingResponse && finalTranscript.trim()) {
        try { recognition.stop(); } catch (error) { console.warn(error); }
      }
    }, 900);
  };

  recognition.onerror = event => {
    isRecognizing = false;
    console.error('Speech recognition error:', event.error);
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      statusEl.textContent = 'Microphone permission denied. Allow microphone access in browser settings.';
      isActive = false;
      setListeningUI(false);
    } else if (event.error === 'network') {
      statusEl.textContent = 'Speech recognition network error. Check your internet connection.';
      errorSound.play().catch(() => {});
    } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
      statusEl.textContent = `Speech recognition error: ${event.error}`;
    }
  };

  recognition.onend = () => {
    isRecognizing = false;
    clearTimeout(processTimer);
    const text = finalTranscript.trim();
    if (isActive && !isSpeaking && !isAwaitingResponse && text && text !== lastProcessedText) {
      lastProcessedText = text;
      processUserInput(text);
    } else {
      restartRecognition();
    }
  };
  return true;
}

async function processUserInput(userText) {
  const cleanedText = userText.trim();
  if (!isActive || !cleanedText || isSpeaking || isAwaitingResponse || cleanedText === lastProcessedText && !finalTranscript.trim()) return;
  isAwaitingResponse = true;
  statusEl.textContent = 'Thinking…';

  const answer = await getGroqResponse(cleanedText);
  if (!isActive) { isAwaitingResponse = false; return; }
  output.textContent = answer;

  if (!('speechSynthesis' in window)) {
    isAwaitingResponse = false;
    finalTranscript = '';
    statusEl.textContent = 'Reply ready. Speech playback is not supported in this browser.';
    restartRecognition();
    return;
  }

  isSpeaking = true;
  const utterance = new SpeechSynthesisUtterance(answer);
  utterance.lang = 'en-US';
  utterance.rate = 1;
  utterance.onstart = () => { statusEl.textContent = 'Speaking reply…'; };
  const finishSpeaking = () => {
    isSpeaking = false;
    isAwaitingResponse = false;
    finalTranscript = '';
    if (isActive) { statusEl.textContent = 'Listening…'; restartRecognition(); }
  };
  utterance.onend = finishSpeaking;
  utterance.onerror = finishSpeaking;
  speechSynthesis.speak(utterance);
}

startBtn.addEventListener('click', () => {
  if (isActive) return;
  if (!recognition && !initRecognition()) return;
  clearTimeout(restartTimer);
  isActive = true;
  isSpeaking = false;
  isAwaitingResponse = false;
  finalTranscript = '';
  lastProcessedText = '';
  setListeningUI(true);
  statusEl.textContent = 'Starting microphone…';
  startSound.play().catch(() => {});
  try { recognition.start(); }
  catch (error) {
    isActive = false;
    setListeningUI(false);
    statusEl.textContent = `Could not start microphone: ${error.message}`;
  }
});

stopBtn.addEventListener('click', () => {
  if (!isActive) return;
  isActive = false;
  isSpeaking = false;
  isAwaitingResponse = false;
  finalTranscript = '';
  lastProcessedText = '';
  clearTimeout(processTimer);
  clearTimeout(restartTimer);
  if (requestController) requestController.abort();
  if (recognition) { try { recognition.stop(); } catch (_) { /* Already stopped. */ } }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  endSound.play().catch(() => {});
  setListeningUI(false);
  statusEl.textContent = 'Assistant stopped.';
});

// Allow an optional typed message form if your HTML includes #messageForm and #messageInput.
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
if (messageForm && messageInput) {
  messageForm.addEventListener('submit', event => {
    event.preventDefault();
    const text = messageInput.value.trim();
    if (!text) return;
    messageInput.value = '';
    if (!isActive) {
      isActive = true;
      setListeningUI(true);
    }
    processUserInput(text);
  });
}

stopBtn.disabled = true;
if (!('SpeechSynthesisUtterance' in window)) {
  console.warn('Speech output is not supported by this browser.');
}
