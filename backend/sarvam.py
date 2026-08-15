"""Thin wrappers around Sarvam AI's REST/WebSocket APIs.

All network specifics (auth headers, exact model ids, request/response shapes)
live here so the rest of the backend never has to think about Sarvam's wire
format. Signatures re-confirmed against https://docs.sarvam.ai on 2026-08-15.

IMPORTANT — model id correction: `sarvam-30b` does NOT exist. It is listed in
Sarvam's docs under "Legacy Models" as deprecated with "no longer available
through the API." It does not appear anywhere in the full docs dump either.
Using it as the loop model would make every /respond call fail. The loop LLM
below defaults to `sarvam-105b-conversations` instead — Sarvam's own docs
describe it as built "for real-time dialogue and voice agents," making it the
closest current equivalent to what sarvam-30b was for (confirmed with the
user in a prior session; see CLAUDE.md §3).

Model ids in use:
  - STT:          saaras:v3
  - Loop LLM:     sarvam-105b-conversations   (NOT sarvam-30b — deprecated)
  - Report LLM:   sarvam-105b
  - TTS:          bulbul:v3
"""

import asyncio
import base64
import json
import os

import httpx
import websockets
from dotenv import load_dotenv

load_dotenv()

SARVAM_API_KEY = os.environ["SARVAM_API_KEY"]
BASE_URL = "https://api.sarvam.ai"

STT_MODEL = "saaras:v3"
LOOP_LLM_MODEL = "sarvam-105b-conversations"
REPORT_LLM_MODEL = "sarvam-105b"
TTS_MODEL = "bulbul:v3"
DEFAULT_TTS_VOICE = "priya"

_AUTH_HEADERS = {"api-subscription-key": SARVAM_API_KEY}


def asr(audio_bytes: bytes, language: str, filename: str = "audio.wav") -> str:
    """Speech-to-text via Saaras v3, transcription mode (same-language out).

    POST /speech-to-text, multipart/form-data.
    """
    response = httpx.post(
        f"{BASE_URL}/speech-to-text",
        headers=_AUTH_HEADERS,
        files={"file": (filename, audio_bytes)},
        data={
            "model": STT_MODEL,
            "mode": "transcribe",
            "language_code": language,
        },
        timeout=30,
    )
    response.raise_for_status()
    return response.json()["transcript"]


def llm(messages: list[dict], model: str = LOOP_LLM_MODEL, temperature: float = 0.5) -> str:
    """OpenAI-compatible chat completion. POST /v1/chat/completions."""
    response = httpx.post(
        f"{BASE_URL}/v1/chat/completions",
        headers={**_AUTH_HEADERS, "Content-Type": "application/json"},
        json={
            "model": model,
            "messages": messages,
            "temperature": temperature,
        },
        timeout=30,
    )
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]


async def llm_stream(messages: list[dict], model: str = LOOP_LLM_MODEL, temperature: float = 0.5):
    """Async-generator streaming variant of llm(). Yields text deltas."""
    async with httpx.AsyncClient(timeout=30) as client:
        async with client.stream(
            "POST",
            f"{BASE_URL}/v1/chat/completions",
            headers={**_AUTH_HEADERS, "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "stream": True,
            },
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line or not line.startswith("data: "):
                    continue
                payload = line[len("data: "):]
                if payload == "[DONE]":
                    return
                choices = json.loads(payload).get("choices") or []
                if not choices:
                    continue  # e.g. a trailing usage-only chunk with no choices
                delta = choices[0].get("delta", {}).get("content")
                if delta:
                    yield delta


def tts(text: str, language: str, voice: str = DEFAULT_TTS_VOICE) -> bytes:
    """Text-to-speech via Bulbul v3, plain REST. POST /text-to-speech.

    Returns decoded WAV audio bytes.
    """
    response = httpx.post(
        f"{BASE_URL}/text-to-speech",
        headers={**_AUTH_HEADERS, "Content-Type": "application/json"},
        json={
            "text": text,
            "language_code": language,
            "model": TTS_MODEL,
            "speaker": voice,
        },
        timeout=30,
    )
    response.raise_for_status()
    audios = response.json()["audios"]
    return base64.b64decode("".join(audios))


async def tts_stream(text: str, language: str, voice: str = DEFAULT_TTS_VOICE):
    """Streaming TTS over WebSocket — optimizes time-to-first-audio-byte
    (CLAUDE.md §8 item 2). Yields decoded audio chunk bytes as they arrive.
    """
    url = f"wss://{BASE_URL.removeprefix('https://')}/text-to-speech/ws?model={TTS_MODEL}"
    async with websockets.connect(
        url, additional_headers={"Api-Subscription-Key": SARVAM_API_KEY}
    ) as ws:
        await ws.send(json.dumps({
            "type": "config",
            "data": {
                "model": TTS_MODEL,
                "language_code": language,
                "speaker": voice,
                "pace": 1.0,
                "speech_sample_rate": "24000",
                "output_audio_codec": "mp3",
            },
        }))
        await ws.send(json.dumps({"type": "text", "data": {"text": text}}))
        await ws.send(json.dumps({"type": "flush"}))

        async for raw in ws:
            message = json.loads(raw)
            if message.get("type") == "audio":
                yield base64.b64decode(message["data"]["audio"])
            elif message.get("type") == "completion":
                break


if __name__ == "__main__":
    # Tiny manual smoke test for each wrapper. Run with:
    #   cd backend && python sarvam.py
    # Requires SARVAM_API_KEY in backend/.env. Not part of an automated suite —
    # it hits the live API and prints/writes output for a human to eyeball.
    import sys

    LANGUAGE = "hi-IN"

    async def main():
        print(f"Loop model: {LOOP_LLM_MODEL} (sarvam-30b is deprecated, not used)")

        print("\n[llm] ...")
        reply = llm([{"role": "user", "content": "Say hi to a Grade 6 student in one short Hindi sentence."}])
        print("  ->", reply)

        print("\n[llm_stream] ...")
        chunks = []
        async for delta in llm_stream([{"role": "user", "content": "Count to 3 in Hindi, one word per line."}]):
            chunks.append(delta)
            print("  chunk:", repr(delta))
        print("  full:", "".join(chunks))

        print("\n[tts] ...")
        audio = tts("Namaste! Chaliye prayog shuru karte hain.", LANGUAGE)
        out_path = "/tmp/sarvam_tts_smoke.wav"
        with open(out_path, "wb") as f:
            f.write(audio)
        print(f"  wrote {len(audio)} bytes -> {out_path}")

        print("\n[tts_stream] ...")
        stream_chunks = []
        async for chunk in tts_stream("Yeh ek streaming test hai.", LANGUAGE):
            stream_chunks.append(chunk)
            print(f"  chunk: {len(chunk)} bytes")
        stream_path = "/tmp/sarvam_tts_stream_smoke.mp3"
        with open(stream_path, "wb") as f:
            f.write(b"".join(stream_chunks))
        print(f"  wrote {sum(len(c) for c in stream_chunks)} bytes -> {stream_path}")

        print("\n[asr] ...")
        sample_path = sys.argv[1] if len(sys.argv) > 1 else "sample.wav"
        try:
            with open(sample_path, "rb") as f:
                audio_bytes = f.read()
        except FileNotFoundError:
            print(f"  skipped — no sample audio at '{sample_path}' "
                  f"(pass a path as: python sarvam.py path/to/sample.wav)")
        else:
            transcript = asr(audio_bytes, LANGUAGE, filename=sample_path)
            print("  ->", transcript)

    asyncio.run(main())
