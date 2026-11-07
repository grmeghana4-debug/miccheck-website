
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const recordBtn = document.getElementById("recordBtn");
const playBtn = document.getElementById("playBtn");
const microphone = document.getElementById("microphone");
const statusText = document.getElementById("status");
const levelBar = document.getElementById("levelBar");
const levelText = document.getElementById("levelText");
const meterMessage = document.getElementById("meterMessage");
const recordMessage = document.getElementById("recordMessage");
const playback = document.getElementById("playback");

let stream = null;
let audioContext = null;
let analyser = null;
let animationId = null;
let recorder = null;
let recordedChunks = [];
let recordingUrl = null;

document.getElementById("year").textContent = new Date().getFullYear();

function stopAudioMeter() {
  if (animationId) cancelAnimationFrame(animationId);
  animationId = null;

  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }

  analyser = null;
  levelBar.style.width = "0%";
  levelText.textContent = "0%";
}

function stopMicrophone() {
  stopAudioMeter();

  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }

  statusText.textContent = "Not started";
  meterMessage.textContent = "Your audio activity will appear here.";
  startBtn.disabled = false;
  stopBtn.disabled = true;
  recordBtn.disabled = true;
}

async function startMicrophone() {
  try {
    stopMicrophone();

    const selectedDevice = microphone.value;
    const audioOptions = selectedDevice
      ? { deviceId: { exact: selectedDevice } }
      : true;

    stream = await navigator.mediaDevices.getUserMedia({
      audio: audioOptions
    });

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);

    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);

    function updateMeter() {
      if (!analyser) return;

      analyser.getByteTimeDomainData(data);

      let sum = 0;
      for (const value of data) {
        const sample = (value - 128) / 128;
        sum += sample * sample;
      }

      const rms = Math.sqrt(sum / data.length);
      const percent = Math.min(100, Math.round(rms * 300));

      levelBar.style.width = percent + "%";
      levelText.textContent = percent + "%";

      meterMessage.textContent = percent > 3
        ? "Microphone is picking up sound!"
        : "Microphone is ready. Try speaking.";

      animationId = requestAnimationFrame(updateMeter);
    }

    updateMeter();

    statusText.textContent = "Microphone active";
    meterMessage.textContent = "Speak into your microphone.";
    startBtn.disabled = true;
    stopBtn.disabled = false;
    recordBtn.disabled = false;

    await loadDevices();

  } catch (error) {
    console.error(error);

    let message = "Could not access your microphone.";

    if (error.name === "NotAllowedError") {
      message = "Permission denied. Allow microphone access in your browser.";
    } else if (error.name === "NotFoundError") {
      message = "No microphone was found on this device.";
    } else if (error.name === "NotReadableError") {
      message = "Your microphone may be in use by another application.";
    }

    statusText.textContent = "Microphone unavailable";
    meterMessage.textContent = message;
  }
}

async function loadDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter(device => device.kind === "audioinput");
    const previous = microphone.value;

    microphone.innerHTML = "";

    inputs.forEach((device, index) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label || `Microphone ${index + 1}`;
      microphone.appendChild(option);
    });

    if (inputs.some(device => device.deviceId === previous)) {
      microphone.value = previous;
    }
  } catch (error) {
    console.error("Could not list microphones:", error);
  }
}

startBtn.addEventListener("click", startMicrophone);
stopBtn.addEventListener("click", stopMicrophone);

microphone.addEventListener("change", () => {
  if (stream) startMicrophone();
});

recordBtn.addEventListener("click", () => {
  if (!stream) return;

  if (!recorder || recorder.state === "inactive") {
    recordedChunks = [];

    const mimeType = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4"
    ].find(type => MediaRecorder.isTypeSupported(type));

    recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    recorder.ondataavailable = event => {
      if (event.data.size > 0) recordedChunks.push(event.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(recordedChunks, {
        type: recorder.mimeType || "audio/webm"
      });

      if (recordingUrl) URL.revokeObjectURL(recordingUrl);

      recordingUrl = URL.createObjectURL(blob);
      playback.src = recordingUrl;
      playback.hidden = false;
      playBtn.disabled = false;
      recordMessage.textContent = "Recording ready. Press play to listen.";
    };

    recorder.start();
    recordBtn.textContent = "Stop recording";
    recordMessage.textContent = "Recording... Speak now.";
  } else {
    recorder.stop();
    recordBtn.textContent = "Start recording";
  }
});

playBtn.addEventListener("click", () => {
  playback.play();
});

window.addEventListener("beforeunload", () => {
  stopMicrophone();
  if (recordingUrl) URL.revokeObjectURL(recordingUrl);
});

if (!navigator.mediaDevices?.getUserMedia) {
  startBtn.disabled = true;
  statusText.textContent = "Unsupported browser";
  meterMessage.textContent =
    "Use a modern browser and open this site over HTTPS to test your microphone.";
}
