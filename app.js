
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const status = document.getElementById('status');
let output = document.getElementById('output');
let aiActive = document.getElementById('aiactive');
let core = document.querySelector('.core');
const rings = document.querySelectorAll('.ring');

let isActive = false;
let isSpeaking = false;
let controller = null;
let isAwaitingResponse = false;
let finalTranscript = '';
let lastProcessedText = '';

const startSound = new Audio('startsound.mp3');
const endSound = new Audio('endsound.mp3');
const errorSound = new Audio('errorsound.mp3');

let recognition;
let processTimer;
let isRecognizing = false;

// Groq API Configuration
const GROQ_API_KEY = 'PASTE_YOUR_NEW_GROQ_API_KEY_HERE';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

function initRecognition() {
    const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        status.textContent = 'Speech recognition is not supported in this browser.';
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

    recognition.onerror = (event) => {
        isRecognizing = false;

        if (event.error === 'no-speech') {
            return;
        }

        if (event.error === 'network') {
            status.textContent = 'Please check your Internet connection.';
            isActive = false;
            isSpeaking = false;
            isAwaitingResponse = false;

            aiActive.textContent = 'Network Connection Lost!';
            aiActive.style.color = 'rgb(235, 154, 83)';

            rings.forEach(r => r.classList.remove('pulse'));
            rings.forEach(r => r.classList.add('pulse2'));

            core.classList.add('core-wifi');
            core.style.backgroundColor = 'rgb(255, 119, 0)';
            core.style.boxShadow = '0 0 0';
            core.style.top = '79%';

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

        if (
            isActive &&
            !isSpeaking &&
            !isAwaitingResponse &&
            finalTranscript.trim() &&
            finalTranscript.trim() !== lastProcessedText
        ) {
            processUserInput(finalTranscript);
        } else {
            restartRecognition();
        }
    };

    recognition.onresult = (event) => {
        if (isSpeaking || isAwaitingResponse) return;

        if (processTimer) clearTimeout(processTimer);

        let currentTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
                currentTranscript += event.results[i][0].transcript + ' ';
            }
        }

        if (currentTranscript.trim()) {
            finalTranscript += currentTranscript;

            status.textContent = `Heard: "${finalTranscript.trim()}"`;

            processTimer = setTimeout(() => {
                if (
                    finalTranscript.trim() &&
                    isActive &&
                    !isSpeaking &&
                    !isAwaitingResponse
                ) {
                    recognition.stop();
                }
            }, 800);
        }
    };
}

function restartRecognition() {
    if (
        !isActive ||
        isSpeaking ||
        isAwaitingResponse ||
        isRecognizing ||
        !recognition
    ) return;

    setTimeout(() => {
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
    }, 400);
}

async function getGroqResponse(userText) {
    let timeoutId;

    try {
        if (!GROQ_API_KEY || GROQ_API_KEY === 'grok_d575af788f9c879fe096d9b5ddb04587_c3560bd1a8c44aff384bf0621ef9f43eae68c08ae624bbf97c10582cc3ea0aae') {
            console.error('Groq API key is missing.');
            return 'API key is not configured.';
        }

        controller = new AbortController();

        timeoutId = setTimeout(() => {
            if (controller) controller.abort();
        }, 15000);

        const response = await fetch(GROQ_API_URL, {
            method: 'POST',

            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY}`
            },

            signal: controller.signal,

            body: JSON.stringify({
                model: GROQ_MODEL,

                messages: [
                    {
                        role: 'system',
                        content: 'You are ARIM, a helpful AI voice assistant. Answer questions clearly and naturally. Keep responses very concise and short for voice output. Avoid unnecessary explanations.'
                    },
                    {
                        role: 'user',
                        content: userText
                    }
                ],

                temperature: 0.7,
                max_tokens: 150
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Groq API Error:', response.status, data);

            if (response.status === 401) {
                return 'Invalid API key. Please check your Groq API key.';
            }

            if (response.status === 429) {
                return 'Too many requests. Please try again shortly.';
            }

            return 'Sorry, I could not process your request.';
        }

        if (
            data.choices &&
            data.choices.length > 0 &&
            data.choices[0].message
        ) {
            return data.choices[0].message.content.trim();
        }

        return 'I could not process that.';

    } catch (error) {
        console.error('Groq Connection Error:', error);

        if (error.name === 'AbortError') {
            return 'Request timed out. Please try again.';
        }

        return 'Connection error. Please check your internet.';

    } finally {
        clearTimeout(timeoutId);
        controller = null;
    }
}

async function processUserInput(userText) {
    if (isAwaitingResponse || isSpeaking || !isActive) return;

    const cleanedText = userText.trim();

    if (!cleanedText || cleanedText === lastProcessedText) return;

    isAwaitingResponse = true;
    lastProcessedText = cleanedText;

    status.textContent = `Processing: "${cleanedText}"`;

    const startTime = Date.now();

    const answer = await getGroqResponse(cleanedText);

    const elapsedTime = Date.now() - startTime;

    if (!answer || !isActive) {
        isAwaitingResponse = false;
        finalTranscript = '';
        restartRecognition();
        return;
    }

    status.textContent = `Response ready (${elapsedTime}ms)`;

    // Display plain text safely
    output.textContent = answer;

    isSpeaking = true;

    const utterance = new SpeechSynthesisUtterance(answer);

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

// START ASSISTANT

startBtn.addEventListener('click', () => {
    if (isActive) return;

    if (recognition && isSpeaking) {
        speechSynthesis.cancel();
    }

    if (processTimer) clearTimeout(processTimer);

    isActive = true;
    isSpeaking = false;
    isAwaitingResponse = false;

    finalTranscript = '';
    lastProcessedText = '';

    core.classList.remove('core-wifi');

    rings.forEach(r => r.classList.remove('pulse2'));

    if (!recognition) {
        initRecognition();
    }

    if (!recognition) return;

    startSound.play().catch(() => {});

    rings.forEach(r => r.classList.add('pulse'));

    core.style.top = '40.2%';
    core.style.boxShadow = '0 0 2rem #8fefff, inset 0 0 1.5625rem #8fefff';
    core.style.backgroundColor = '#8fefff';

    aiActive.style.color = '#8fefff';
    aiActive.textContent = 'ARIM Assistant Active';

    status.textContent = 'Starting...';
    startBtn.disabled = true;

    setTimeout(() => {
        if (!isActive) return;

        const testing = new SpeechSynthesisUtterance(
            'Greetings, I am your Arim AI assistant. How can I assist you today?'
        );

        testing.lang = 'en-US';
        testing.rate = 1.0;

        testing.onend = () => {
            restartRecognition();
        };

        testing.onerror = () => {
            restartRecognition();
        };

        speechSynthesis.speak(testing);

    }, 500);
});

// STOP ASSISTANT

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

    if (recognition) {
        try {
            recognition.stop();
        } catch (error) {}
    }

    speechSynthesis.cancel();

    endSound.play().catch(() => {});

    status.textContent = 'Assistant stopped.';

    startBtn.disabled = false;

    rings.forEach(r => r.classList.remove('pulse'));
    rings.forEach(r => r.classList.remove('pulse2'));

    core.classList.remove('core-wifi');

    core.style.backgroundColor = '';
    core.style.boxShadow = '';
    core.style.top = '';

    aiActive.style.color = '';
});

// INITIALIZE
initRecognition();

