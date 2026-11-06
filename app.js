
// ==========================================
// ARIM AI - VOICE ASSISTANT
// ==========================================

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const status = document.getElementById('status');
const output = document.getElementById('output');
const aiActive = document.getElementById('aiactive');
const core = document.querySelector('.core');
const rings = document.querySelectorAll('.ring');

let isActive = false;
let isSpeaking = false;
let isAwaitingResponse = false;
let isRecognizing = false;

let recognition = null;
let controller = null;
let processTimer = null;
let restartTimer = null;

let finalTranscript = '';
let lastProcessedText = '';

// Sounds
const startSound = new Audio('startsound.mp3');
const endSound = new Audio('endsound.mp3');
const errorSound = new Audio('errorsound.mp3');

// ==========================================
// GROQ CONFIGURATION
// ==========================================

const GROQ_API_KEY = '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';

const GROQ_API_URL =
    'https://api.groq.com/openai/v1/chat/completions';

const GROQ_MODEL = 'llama-3.3-70b-versatile';

// ==========================================
// GROQ AI RESPONSE
// ==========================================

async function getGroqResponse(userText) {

    if (
        !GROQ_API_KEY ||
        GROQ_API_KEY === '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'
    ) {
        console.error('Groq API key is missing.');
        return 'Please configure your Groq API key.';
    }

    const requestController = new AbortController();
    controller = requestController;

    const timeoutId = setTimeout(() => {
        requestController.abort();
    }, 20000);

    try {

        const response = await fetch(GROQ_API_URL, {

            method: 'POST',

            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY}`
            },

            signal: requestController.signal,

            body: JSON.stringify({

                model: GROQ_MODEL,

                messages: [
                    {
                        role: 'system',
                        content:
                            'You are ARIM, a helpful AI voice assistant. Answer naturally, clearly and concisely. Use short responses suitable for voice output.'
                    },
                    {
                        role: 'user',
                        content: userText
                    }
                ],

                temperature: 0.7,
                max_tokens: 200,
                stream: false
            })
        });

        const data = await response.json();

        if (!response.ok) {

            console.error('Groq API Status:', response.status);
            console.error('Groq API Details:', data);

            if (response.status === 401) {
                return 'Your Groq API key is invalid or expired.';
            }

            if (response.status === 403) {
                return 'Groq API access is forbidden.';
            }

            if (response.status === 429) {
                return 'Too many requests. Please try again later.';
            }

            return data.error?.message ||
                'Sorry, I could not process your request.';
        }

        const answer = data.choices?.[0]?.message?.content;

        if (!answer) {
            return 'I could not generate a response.';
        }

        return answer.trim();

    } catch (error) {

        console.error('Groq Connection Error:', error);

        if (error.name === 'AbortError') {
            return 'Request timed out. Please try again.';
        }

        return 'Connection error. Please check your internet.';

    } finally {

        clearTimeout(timeoutId);

        if (controller === requestController) {
            controller = null;
        }
    }
}

// ==========================================
// SPEECH RECOGNITION INITIALIZATION
// ==========================================

function initRecognition() {

    const SpeechRecognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;

    if (!SpeechRecognition) {

        status.textContent =
            'Speech recognition is not supported in this browser.';

        startBtn.disabled = true;
        return;
    }

    recognition = new SpeechRecognition();

    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {

        isRecognizing = true;

        finalTranscript = '';

        status.textContent = 'Listening...';
    };

    recognition.onresult = (event) => {

        if (isSpeaking || isAwaitingResponse) return;

        if (processTimer) {
            clearTimeout(processTimer);
        }

        let currentTranscript = '';

        for (
            let i = event.resultIndex;
            i < event.results.length;
            i++
        ) {

            if (event.results[i].isFinal) {

                currentTranscript +=
                    event.results[i][0].transcript + ' ';
            }
        }

        if (currentTranscript.trim()) {

            finalTranscript += currentTranscript;

            status.textContent =
                `Heard: "${finalTranscript.trim()}"`;

            processTimer = setTimeout(() => {

                if (
                    isActive &&
                    !isSpeaking &&
                    !isAwaitingResponse &&
                    finalTranscript.trim()
                ) {

                    try {
                        recognition.stop();
                    } catch (error) {
                        console.warn(error);
                    }
                }

            }, 1000);
        }
    };

    recognition.onerror = (event) => {

        isRecognizing = false;

        console.error('Speech Recognition Error:', event.error);

        if (event.error === 'no-speech') {
            return;
        }

        if (event.error === 'network') {

            status.textContent = 'Speech network error.';

            isActive = false;

            isSpeaking = false;
            isAwaitingResponse = false;

            aiActive.textContent = 'Network Connection Lost!';
            aiActive.style.color = 'rgb(235, 154, 83)';

            rings.forEach(r => {
                r.classList.remove('pulse');
                r.classList.add('pulse2');
            });

            core.classList.add('core-wifi');
            core.style.backgroundColor = 'rgb(255, 119, 0)';

            speechSynthesis.cancel();

            errorSound.play().catch(() => {});

            startBtn.disabled = false;
        }
    };

    recognition.onend = () => {

        isRecognizing = false;

        if (processTimer) {
            clearTimeout(processTimer);
            processTimer = null;
        }

        const text = finalTranscript.trim();

        if (
            isActive &&
            !isSpeaking &&
            !isAwaitingResponse &&
            text &&
            text !== lastProcessedText
        ) {

            processUserInput(text);

        } else {

            restartRecognition();
        }
    };
}

// ==========================================
// RESTART RECOGNITION
// ==========================================

function restartRecognition() {

    if (
        !isActive ||
        isSpeaking ||
        isAwaitingResponse ||
        isRecognizing ||
        !recognition
    ) {
        return;
    }

    if (restartTimer) {
        clearTimeout(restartTimer);
    }

    restartTimer = setTimeout(() => {

        restartTimer = null;

        if (
            isActive &&
            !isSpeaking &&
            !isAwaitingResponse &&
            !isRecognizing
        ) {

            try {
                recognition.start();
            } catch (error) {
                console.warn('Recognition restart:', error.message);
            }
        }

    }, 500);
}

// ==========================================
// PROCESS USER INPUT
// ==========================================

async function processUserInput(userText) {

    if (
        !isActive ||
        isSpeaking ||
        isAwaitingResponse
    ) {
        return;
    }

    const cleanedText = userText.trim();

    if (
        !cleanedText ||
        cleanedText === lastProcessedText
    ) {
        return;
    }

    isAwaitingResponse = true;

    lastProcessedText = cleanedText;

    status.textContent =
        `Processing: "${cleanedText}"`;

    const startTime = Date.now();

    const answer = await getGroqResponse(cleanedText);

    const elapsedTime = Date.now() - startTime;

    if (!isActive) {
        isAwaitingResponse = false;
        return;
    }

    if (!answer) {

        isAwaitingResponse = false;

        finalTranscript = '';

        restartRecognition();

        return;
    }

    status.textContent =
        `Response ready (${elapsedTime}ms)`;

    output.textContent = answer;

    isSpeaking = true;

    const utterance =
        new SpeechSynthesisUtterance(answer);

    utterance.lang = 'en-US';
    utterance.rate = 1.0;
    utterance.volume = 1;

    utterance.onstart = () => {
        status.textContent = 'Speaking response...';
    };

    utterance.onend = () => {

        isSpeaking = false;
        isAwaitingResponse = false;

        finalTranscript = '';

        restartRecognition();
    };

    utterance.onerror = () => {

        isSpeaking = false;
        isAwaitingResponse = false;

        finalTranscript = '';

        restartRecognition();
    };

    speechSynthesis.speak(utterance);
}

// ==========================================
// START ASSISTANT
// ==========================================

startBtn.addEventListener('click', () => {

    if (isActive) return;

    if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
    }

    if (processTimer) {
        clearTimeout(processTimer);
        processTimer = null;
    }

    isActive = true;

    isSpeaking = false;
    isAwaitingResponse = false;

    finalTranscript = '';
    lastProcessedText = '';

    core.classList.remove('core-wifi');

    rings.forEach(r => {
        r.classList.remove('pulse2');
        r.classList.add('pulse');
    });

    if (!recognition) {
        initRecognition();
    }

    if (!recognition) {
        isActive = false;
        return;
    }

    startSound.play().catch(() => {});

    core.style.top = '40.2%';

    core.style.boxShadow =
        '0 0 2rem #8fefff, inset 0 0 1.5625rem #8fefff';

    core.style.backgroundColor = '#8fefff';

    aiActive.style.color = '#8fefff';

    aiActive.textContent = 'ARIM Assistant Active';

    status.textContent = 'Starting...';

    startBtn.disabled = true;

    setTimeout(() => {

        if (!isActive) return;

        const greeting = new SpeechSynthesisUtterance(
            'Greetings, I am your Arim AI assistant. How can I assist you today?'
        );

        greeting.lang = 'en-US';
        greeting.rate = 1.0;

        greeting.onend = () => {
            restartRecognition();
        };

        greeting.onerror = () => {
            restartRecognition();
        };

        speechSynthesis.speak(greeting);

    }, 500);
});

// ==========================================
// STOP ASSISTANT
// ==========================================

stopBtn.addEventListener('click', () => {

    if (!isActive) return;

    isActive = false;

    isSpeaking = false;
    isAwaitingResponse = false;

    finalTranscript = '';
    lastProcessedText = '';

    aiActive.textContent = 'ARIM Assistant Disabled';

    output.textContent = '';

    if (controller) {
        controller.abort();
        controller = null;
    }

    if (processTimer) {
        clearTimeout(processTimer);
        processTimer = null;
    }

    if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
    }

    if (recognition) {

        try {
            recognition.stop();
        } catch (error) {
            console.warn(error);
        }
    }

    speechSynthesis.cancel();

    endSound.play().catch(() => {});

    status.textContent = 'Assistant stopped.';

    startBtn.disabled = false;

    rings.forEach(r => {
        r.classList.remove('pulse');
        r.classList.remove('pulse2');
    });

    core.classList.remove('core-wifi');

    core.style.backgroundColor = '';
    core.style.boxShadow = '';
    core.style.top = '';

    aiActive.style.color = '';
});

// ==========================================
// INITIALIZE
// ==========================================

initRecognition();
```
