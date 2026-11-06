const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const status = document.getElementById('status');
let output = document.getElementById('output');
let aiActive = document.getElementById('aiactive');
let core = document.querySelector('.core');
const rings = document.querySelectorAll('.ring');
let isActive = false;
let isSpeaking = false;
let controller;
let isAwaitingResponse = false;
let finalTranscript = '';
let lastProcessedText = '';

const startSound = new Audio('startsound.mp3');
const endSound = new Audio('endsound.mp3');
const errorSound = new Audio('errorsound.mp3');

let recognition;
let processTimer;
let isRecognizing = false;

function initRecognition() {
    recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    
    recognition.onstart = () => {
        isRecognizing = true;
        finalTranscript = '';
        status.textContent = "Listening...";
    };
    
    recognition.onerror = (event) => {
        if (event.error === 'no-speech') {
            if (isActive && !isSpeaking && !isAwaitingResponse) {
                setTimeout(() => {
                    if (isActive && !isSpeaking && !isAwaitingResponse && !isRecognizing) {
                        recognition.start();
                    }
                }, 300);
            }
        }
        if (event.error === 'network') {
            status.textContent = 'Please check your Internet connection and then try again by using Active button or refresh.';
            isActive = false;
            isSpeaking = false;
            isAwaitingResponse = false;
            aiActive.textContent = "Network Connection Loose!";
            aiActive.style.color = 'rgb(235, 154, 83)';
            rings.forEach(r => r.classList.remove('pulse'));
            rings.forEach(r => r.classList.add('pulse2'));
            core.classList.add('core-wifi');
            core.style.backgroundColor = 'rgb(255, 119, 0)';
            core.style.boxShadow = '0 0 0';
            core.style.top = '79%';
            if (recognition) recognition.stop();
            speechSynthesis.cancel();
            errorSound.play();
            startBtn.disabled = false;
        }
    };
    
    recognition.onend = () => {
        isRecognizing = false;
        if (processTimer) clearTimeout(processTimer);
        
        if (isActive && !isSpeaking && !isAwaitingResponse && finalTranscript && finalTranscript.trim() !== lastProcessedText) {
            processUserInput(finalTranscript);
        } else if (isActive && !isSpeaking && !isAwaitingResponse) {
            setTimeout(() => {
                if (isActive && !isSpeaking && !isAwaitingResponse && !isRecognizing) {
                    recognition.start();
                }
            }, 200);
        }
    };
    
    recognition.onresult = (event) => {
        if (isSpeaking || isAwaitingResponse) return;
        
        if (processTimer) clearTimeout(processTimer);
        
        let currentTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                currentTranscript += transcript + ' ';
            }
        }
        
        if (currentTranscript) {
            finalTranscript = currentTranscript;
            status.textContent = `Heard: "${finalTranscript.trim()}"`;
            
            processTimer = setTimeout(() => {
                if (finalTranscript && finalTranscript.trim() && isActive && !isSpeaking && !isAwaitingResponse && finalTranscript.trim() !== lastProcessedText) {
                    recognition.stop();
                }
            }, 800);
        }
    };
}

const GROQ_API_KEY = 'grok_5fe3f99754d36068321f05bcd81bb7a3_6fec5badcb97138298480c61e7d1870522c2e6bf3c16c6019450ae788b6fede4';

async function getGroqResponse(userText) {
    try {
        controller = new AbortController();
        
        const timeoutId = setTimeout(() => {
            if (controller) controller.abort();
        }, 8000);
        
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${GROQ_API_KEY}`
            },
            signal: controller.signal,
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: "You are a helpful assistant. Keep your responses very concise and short for voice output." },
                    { role: "user", content: userText }
                ],
                temperature: 0.7,
                max_tokens: 150
            })
        });
        
        clearTimeout(timeoutId);
        
        const data = await response.json();
        if (data.choices && data.choices.length > 0) {
            return data.choices[0].message.content;
        } else {
            return "I couldn't process that.";
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            return "Request timed out. Please try again.";
        }
        return "Connection error. Please check your internet.";
    }
}

async function processUserInput(userText) {
    if (isAwaitingResponse || isSpeaking) return;
    
    isAwaitingResponse = true;
    const cleanedText = userText.trim();
    lastProcessedText = cleanedText;
    
    status.textContent = `Processing: "${cleanedText}"`;
    
    const startTime = Date.now();
    const answer = await getGroqResponse(cleanedText);
    const elapsedTime = Date.now() - startTime;
    
    if (!answer || !isActive) {
        isAwaitingResponse = false;
        finalTranscript = '';
        if (isActive && !isSpeaking) {
            setTimeout(() => {
                if (isActive && !isSpeaking && !isAwaitingResponse && !isRecognizing) {
                    recognition.start();
                }
            }, 200);
        }
        return;
    }
    
    status.textContent = `Response ready (${elapsedTime}ms)`;
    output.innerHTML = answer;
    isSpeaking = true;
    
    const utterance = new SpeechSynthesisUtterance(answer);
    utterance.lang = 'en-US';
    utterance.rate = 1.0;
    utterance.volume = 1;
    
    utterance.onstart = () => {
        status.textContent = "Speaking response...";
    };
    
    utterance.onend = () => {
        isSpeaking = false;
        isAwaitingResponse = false;
        finalTranscript = '';
        
        setTimeout(() => {
            if (isActive && !isSpeaking && !isAwaitingResponse && !isRecognizing) {
                recognition.start();
            }
        }, 500);
    };
    
    utterance.onerror = () => {
        isSpeaking = false;
        isAwaitingResponse = false;
        if (isActive) {
            setTimeout(() => {
                if (isActive && !isSpeaking && !isAwaitingResponse && !isRecognizing) {
                    recognition.start();
                }
            }, 500);
        }
    };
    
    speechSynthesis.speak(utterance);
}

startBtn.addEventListener('click', () => {
    if (!isActive) {
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
        
        startSound.play();
        rings.forEach(r => r.classList.add('pulse'));
        core.style.top = '40.2%';
        core.style.boxShadow = '0 0 2rem #8fefff, inset 0 0 1.5625rem #8fefff';
        core.style.backgroundColor = '#8fefff';
        aiActive.style.color = '#8fefff';
        aiActive.textContent = "ARIM Assistant Active";
        status.textContent = "Starting...";
        startBtn.disabled = true;
        
        setTimeout(() => {
            let testing = new SpeechSynthesisUtterance('Greetings, I am your Arim AI assistant. How can I assist you today?');
            testing.lang = 'en-US';
            testing.rate = 1.0;
            
            testing.onend = () => {
                setTimeout(() => {
                    if (isActive && !isSpeaking && !isAwaitingResponse && !isRecognizing) {
                        recognition.start();
                    }
                }, 300);
            };
            
            speechSynthesis.speak(testing);
        }, 500);
    }
});

stopBtn.addEventListener('click', () => {
    if (isActive) {
        isActive = false;
        isSpeaking = false;
        isAwaitingResponse = false;
        finalTranscript = '';
        
        aiActive.textContent = "ARIM Assistant Disabled";
        output.innerHTML = '';
        
        if (controller) {
            controller.abort();
            controller = null;
        }
        
        if (processTimer) clearTimeout(processTimer);
        
        if (recognition) {
            try {
                recognition.stop();
            } catch(e) {}
        }
        
        speechSynthesis.cancel();
        endSound.play();
        status.textContent = "Assistant stopped.";
        startBtn.disabled = false;
        rings.forEach(r => r.classList.remove('pulse'));
        rings.forEach(r => r.classList.remove('pulse2'));
        core.classList.remove('core-wifi');
        core.style.backgroundColor = '';
        core.style.boxShadow = '';
        core.style.top = '';
        aiActive.style.color = '';
    }
});

initRecognition();
