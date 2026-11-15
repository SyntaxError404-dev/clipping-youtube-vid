"""Transcribe a wav with faster-whisper (local, no key) — stdlib wave reader, no scipy."""
import json, sys, time, wave
import numpy as np
from faster_whisper import WhisperModel

wav = sys.argv[1]
out_json = sys.argv[2]
with wave.open(wav, "rb") as w:
    n = w.getnframes()
    sr = w.getframerate()
    width = w.getsampwidth()
    ch = w.getnchannels()
    raw = w.readframes(n)
if width == 2:
    data = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
elif width == 4:
    data = np.frombuffer(raw, dtype=np.float32)
else:
    raise SystemExit(f"unsupported sample width {width}")
if ch == 2:
    data = data.reshape(-1, 2).mean(axis=1)
if sr != 16000:
    raise SystemExit(f"expected 16kHz mono wav, got {sr}Hz {ch}ch")
audio = np.ascontiguousarray(data, dtype=np.float32)
t0 = time.time()
model = WhisperModel("small.en", device="cpu", compute_type="int8")
segments, info = model.transcribe(audio, word_timestamps=True, vad_filter=True)
segs = []
for s in segments:
    segs.append({
        "start": round(s.start, 2), "end": round(s.end, 2),
        "text": s.text.strip(),
        "words": [{"w": w.word, "start": round(w.start, 2), "end": round(w.end, 2)}
                  for w in (s.words or [])],
    })
with open(out_json, "w") as f:
    json.dump({"language": info.language, "duration": round(info.duration, 1),
               "segments": segs}, f, indent=1)
nwords = sum(len(s["words"]) for s in segs)
print(f"transcribed {len(segs)} segments, {nwords} words in {time.time()-t0:.0f}s")
for s in segs[:20]:
    print(f"[{s['start']:6.1f}-{s['end']:6.1f}] {s['text']}")
