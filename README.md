# VoxInterview AI – Real-Time Interview Assistant

A real-time AI interview co-pilot that transcribes interviewer speech using native browser `SpeechRecognition`, detects completed questions using configurable voice activity detection (VAD) and silence analysis, and streams authentic spoken responses tailored to the candidate's actual profile using Google's Gemini models.

Developed by [@kavisri005](https://github.com/kavisri005).

---

## Key Features

- **Microphone ON/OFF Controls**: Full deterministic audio pipeline with instant start/stop and clean teardown of MediaStreams, AudioContexts, and recognition sessions.
- **Live SpeechRecognition Transcription**: Progressive 3-layer transcript tracking (interim hypotheses, finalized turns, and accumulated utterances).
- **Silence & Pause Detection**: Natural question termination detection with real-time visual countdown timer and configurable silence threshold (500ms - 3000ms).
- **Gemini Answer Pipeline**: Low-latency Server-Sent Events (SSE) streaming answers powered by the `@google/genai` SDK using a fast model cascade (`gemini-3.1-flash-lite`, `gemini-flash-latest`, `gemini-3.8-flash`).
- **Candidate Dossier Grounding**: Answers adhere strictly to the candidate's real education, technical skills, projects, and work history—preventing hallucinated qualifications.
- **Audio Waveform Radar**: Real-time canvas-based audio visualizer reflecting mic input levels and frequency activity.
- **Microphone Diagnostics Panel**: Live telemetry tracking permission state, audio stream health, SpeechRecognition status, and event timestamps.

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons, Web Audio API
- **Backend / API**: Node.js, Express, `@google/genai`, Server-Sent Events (SSE)
- **AI Models**: Google Gemini 3.1 Flash-Lite, Gemini Flash

---

## Getting Started

### Prerequisites

- Node.js (v18+ recommended)
- A Google Gemini API key from [Google AI Studio](https://aistudio.google.com/)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/kavisri005/voxinterview-ai.git
   cd voxinterview-ai
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
   Add your Gemini API key:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   PORT=3000
   ```

### Running Locally

- **Development Server**:
  ```bash
  npm run dev
  ```
  Open `http://localhost:3000` in Google Chrome or Microsoft Edge (recommended for SpeechRecognition support).

- **Production Build**:
  ```bash
  npm run build
  ```

- **Run Production Server**:
  ```bash
  npm start
  ```

---

## License

MIT License. Designed and maintained by [kavisri005](https://github.com/kavisri005).
