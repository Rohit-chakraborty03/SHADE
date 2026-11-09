"""Makes natural-sounding audio for the voice explainer (free Microsoft neural voices, no key needed).
Run ONCE from inside the public folder:
    pip install edge-tts
    python make_audio.py            (add --force to redo everything after editing voice-text.json)
It writes audio/en/N.mp3 and audio/bn/N.mp3. voice.js plays those files and falls back to the browser voice if they are missing."""
import asyncio, json, os, sys
import edge_tts

VOICES = {
    "en": "en-IN-NeerjaNeural",
    "bn": "bn-IN-TanishaaNeural",   # Kolkata accent. Others: bn-IN-BashkarNeural (man), bn-BD-NabanitaNeural (woman, Bangladesh), bn-BD-PradeepNeural (man)
}
RATE = {"en": "-5%", "bn": "-8%"}     # a little slower is easier to follow

async def main():
    here = os.path.dirname(os.path.abspath(__file__))
    data = json.load(open(os.path.join(here, "voice-text.json"), encoding="utf-8"))
    for lang, voice in VOICES.items():
        os.makedirs(os.path.join(here, "audio", lang), exist_ok=True)
        for item in data:
            out = os.path.join(here, "audio", lang, f"{item['id']}.mp3")
            if os.path.exists(out) and "--force" not in sys.argv:
                continue
            print(lang, item["id"], item["titles"][0])
            await edge_tts.Communicate(item[lang], voice, rate=RATE[lang]).save(out)
    print("Done.")

asyncio.run(main())