# COZY LAN ENGLISH - Speaking Practice

An online voice recorder that checks and helps you improve your English pronunciation, fluency, and gives IELTS speaking band scores.

## Features

- **Voice Recording with Speech Recognition**: Record your voice and get instant transcription using Vosk speech recognition
- **Pronunciation Scoring**: Get word-level pronunciation analysis with confidence scores
- **Fluency Analysis**: Comprehensive analysis including:
  - Speech rate (words per minute)
  - Pause detection and analysis
  - Rhythm and speaking pattern evaluation
- **IELTS Speaking Band Estimation**: Get an estimated IELTS speaking band score based on your pronunciation and fluency
- **IPA Pronunciation Guide**: Learn the correct International Phonetic Alphabet (IPA) pronunciation for words you need to improve
- **Teacher Questions**: Practice with timed recording sessions answering teacher questions
- **Recording History**: Review all your past recordings with playback functionality
- **Shareable Recording Links**: Share your recordings with others via unique URLs
- **Top Scores Leaderboard**: See how you rank among other learners
- **Dark Mode Support**: Comfortable viewing experience in any lighting condition
- **Mobile-Friendly Responsive Design**: Practice on any device, anywhere
- **Text-to-Speech**: Listen to example sentences with proper pronunciation

## Tech Stack

- **Backend**: Rust with Axum web framework
- **Frontend**: React with Vite and Tailwind CSS
- **Database**: SQLite for data persistence
- **Speech Recognition**: Vosk speech recognition toolkit
- **Deployment**: Docker and Docker Compose
- **CI/CD**: GitHub Actions for automated builds and deployment

## Quick Start with Docker

The easiest way to run the application is using Docker Compose:

```bash
docker-compose up -d
```

The application will be available at `http://localhost:3000`.

### Environment Variables

You can configure the application using environment variables in `docker-compose.yml`:

- `RUST_LOG`: Log level (default: `info`)
- `LEADERBOARD_LIMIT`: Number of top scores to display (default: `10`)
- `PORT`: Server port (default: `3000`)

## Development Setup

If you want to run the application locally for development:

### Prerequisites

- Rust (latest stable version)
- Node.js (v18 or higher)
- Vosk model and library

### Setup Steps

1. **Download Vosk Model**: Download a Vosk model from https://alphacephei.com/vosk/models and extract it to the `model` folder:
   ```bash
   curl -L "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip" -o vosk-model.zip
   unzip vosk-model.zip
   mv vosk-model-small-en-us-0.15 model
   ```

2. **Download Vosk Library**: Download `libvosk.so` (Linux) or `libvosk.dylib` (macOS) from the [vosk-api releases](https://github.com/alphacep/vosk-api/releases) and place it in your system library path or the `deps` folder.

3. **Install Dependencies**: The frontend dependencies will be installed automatically during build, but you can also install them manually:
   ```bash
   cd frontend
   npm install
   ```

4. **Run the Application**:
   ```bash
   cargo run
   ```

The server will start at `http://localhost:3000` and the frontend will be built automatically using Parcel.

### Building for Production

For local builds, use the build-specific Docker Compose file:

```bash
docker-compose -f docker-compose.build.yml up --build
```

## How It Works

**COZY LAN ENGLISH** uses [Vosk](https://alphacephei.com/vosk/) – an offline speech recognition toolkit – to analyze your voice recordings and provide detailed feedback on pronunciation and fluency.

The audio recording is done using the [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API), and encoded into WAV format using the [WebAudioRecorder.js](https://github.com/higuma/web-audio-recorder-js) library.

## Acknowledgments

- The speech score is based on the confidence score of each word provided by Vosk's model
- Pronunciation data is provided by [The CMU Pronouncing Dictionary](http://www.speech.cs.cmu.edu/cgi-bin/cmudict)
- Speech examples are collected from the [Random Sentence Generator](https://randomwordgenerator.com/sentence.php) website

## License

This project is licensed under the BSD 3-Clause License - see the [LICENSE](LICENSE) file for details.