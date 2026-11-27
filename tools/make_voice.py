"""Make Navigate voice clips in Chu's picked voice (Irish, edge-tts en-IE-EmilyNeural, rate -5%).
Clips go to site/audio/voice/<key>.mp3, trimmed of silence, 24 kHz mono 48 kbps (same as the first 20).
Run: python3 tools/make_voice.py            (makes the arrival-time clips)
"""
import subprocess, pathlib, tempfile, time
TTS = str(pathlib.Path.home() / "Claude/ContentBot/.venv/bin/edge-tts")
OUT = pathlib.Path(__file__).resolve().parent.parent / "site/audio/voice"
WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
         "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
         "twenty one", "twenty two", "twenty three"]
# 🕐 tap the arrival box in Navigate = "You arrive around seventeen … oh five" (Chu 11/28: a hidden voice test)
CLIPS = {f"arr_{h:02d}": f"You arrive around {WORDS[h]}" for h in range(24)}
TENS = {2: "twenty", 3: "thirty", 4: "forty", 5: "fifty"}
def minute(m):  # 0 → "hundred", 5 → "oh five", 22 → "twenty two"
    if m == 0: return "hundred"
    if m < 10: return "oh " + WORDS[m]
    if m < 20: return WORDS[m]
    return TENS[m // 10] + ("" if m % 10 == 0 else " " + WORDS[m % 10])
CLIPS.update({f"m{m:02d}": minute(m) for m in range(60)})
CLIPS.update({f"clk_{h:02d}": f"It's {WORDS[h]}" for h in range(24)})  # tap the arrival box: the time now first (Chu 11/28)

def make(key, text):
    with tempfile.TemporaryDirectory() as d:
        raw = pathlib.Path(d) / "raw.mp3"
        for _ in range(12):  # the free voice service drops a request now and then: try again
            if subprocess.run([TTS, "--voice", "en-IE-EmilyNeural", "--rate=-5%", "--text", text, "--write-media", str(raw)], capture_output=True).returncode == 0: break
            time.sleep(2)
        else: raise SystemExit(f"voice service gave no sound for {key}")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-af",
                        "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse",
                        "-ar", "24000", "-ac", "1", "-b:a", "48k", str(OUT / f"{key}.mp3")], check=True)

if __name__ == "__main__":
    for k, t in CLIPS.items():
        if not (OUT / f"{k}.mp3").exists(): make(k, t); print(k, t)
