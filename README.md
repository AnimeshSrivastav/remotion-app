# Remotion Auto-Captioner

A full-stack video-captioning application built using **Next.js**, **Remotion**, and **OpenAI Whisper**.  
Users can upload a `.mp4` video, auto-generate Hinglish captions, preview them in real-time, and export a final captioned video using Remotion’s rendering engine.

---

## Links

**Deployed App:** https://remotion-app-liart.vercel.app/  
**GitHub Repo:** https://github.com/AnimeshSrivastav/remotion-app  
**DockerHub Image:** https://hub.docker.com/r/maav3rick/remotion-app

---

# Local Installation

## Running via Docker (Recommended):

DockerHub automated image publishing using **GITHUB ACTIONS**

**Pull the image:**

```bash
docker pull maav3rick/remotion-app:latest
```

**Run in container:**

```bash
docker run -p 3000:3000 \ -e OPENAI_API_KEY=your_key_here \maav3rick/remotion-app:latest
```

### Clone the repository

```bash
git clone https://github.com/AnimeshSrivastav/remotion-app
cd remotion-app
npm run dev
```

---

## Tech Stack

| Layer      | Technology                                |
| ---------- | ----------------------------------------- |
| Frontend   | React, TypeScript, Next.js App Router     |
| Video      | Remotion Player + Remotion Renderer       |
| STT        | OpenAI Whisper (`whisper-1`)              |
| Deployment | Docker, Vercel, DockerHub, GitHub Actions |

---

## Features

### **1. Auto-Captioning**

- Uses **OpenAI Whisper (`whisper-1`)**
- Converts Hindi + English (Devanagari + Latin script

### **2. Live Video Preview**

Implemented using **`@remotion/player`** — real-time caption overlay before exporting.

### **3. MP4 Export Using Remotion**

- Uses `@remotion/bundler` + `@remotion/renderer`
- A tiny internal HTTP server streams uploaded videos to Remotion

### **4. Dockerized for Production**

- Full Docker build
- DockerHub automated image publishing using **GITHUB ACTIONS**

### **5. CI/CD with GitHub Actions**

Every push triggers:

- Docker build
- DockerHub publish (`maav3rick/remotion-app:latest`)
- Deployment-ready artifacts

---
