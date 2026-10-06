#!/usr/bin/env python3
"""WriteAssist promo voice-over — one WAV per line through OpenRouter (Gemini TTS).

    python3 promo/openrouter_vo.py                 # all missing lines → promo/vo/01.wav …
    python3 promo/openrouter_vo.py --redo 03,07    # regenerate some lines
    python3 promo/openrouter_vo.py --voice Charon  # another Gemini voice (default Mako)

Standard library only. Key: OPENROUTER_API_KEY, or ~/.config/lura/keys.json → "openrouter" (never printed).
Lines + tones: promo/vo_lines.json. 5 attempts per line; failures go to promo/vo/_failed.json.
"""
import argparse, json, os, re, struct, sys, time, urllib.error, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / 'vo'
MODEL = 'google/gemini-3.8-flash-lite-tts'
URL = 'https://openrouter.ai/api/v1/audio/speech'
PROFILE = ('A young Egyptian man presenting a tech product in a promo video: warm, energetic, confident and friendly, '
           'like a popular Egyptian tech YouTuber. Speak natural Egyptian colloquial Arabic (عامية مصرية) with a Cairo accent; '
           'say the English product and app names naturally. Read only the line, nothing else.')


def api_key():
    k = os.environ.get('OPENROUTER_API_KEY')
    p = Path.home() / '.config/lura/keys.json'
    if not k and p.exists():
        k = json.loads(p.read_text()).get('openrouter')
    if not k:
        sys.exit('No OpenRouter key: set OPENROUTER_API_KEY or put it in ~/.config/lura/keys.json under "openrouter".')
    return k


def wav(pcm, rate=24000):
    return struct.pack('<4sI4s4sIHHIIHH4sI', b'RIFF', 36 + len(pcm), b'WAVE', b'fmt ', 16, 1, 1, rate, rate * 2, 2, 16,
                       b'data', len(pcm)) + pcm


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--voice', default='Mako')
    ap.add_argument('--redo', default='')
    a = ap.parse_args()
    key, lines = api_key(), json.loads((HERE / 'vo_lines.json').read_text())
    OUT.mkdir(exist_ok=True)
    redo = {x.strip() for x in a.redo.split(',') if x.strip()}
    failed, use_instr = {}, True
    for L in lines:
        f = OUT / f"{L['id']}.wav"
        if f.exists() and L['id'] not in redo:
            continue
        err = ''
        for attempt in range(5):
            body = {'model': MODEL, 'voice': a.voice, 'response_format': 'pcm', 'input': f"[{L['tone']}] {L['text']}"}
            if use_instr:
                body['instructions'] = PROFILE + f" Tone for this line: {L['tone']}."
            req = urllib.request.Request(URL, data=json.dumps(body).encode(), headers={
                'Authorization': f'Bearer {key}', 'Content-Type': 'application/json',
                'HTTP-Referer': 'https://github.com/local/write-assist', 'X-Title': 'writeassist-promo'})
            try:
                with urllib.request.urlopen(req, timeout=120) as r:
                    audio, ctype = r.read(), r.headers.get('Content-Type', '')
                if len(audio) < 1000 or 'json' in ctype:
                    raise RuntimeError(f'no audio ({ctype}): {audio[:160]!r}')
                rate = int(m.group(1)) if (m := re.search(r'rate=(\d+)', ctype)) else 24000
                f.write_bytes(audio if audio[:4] == b'RIFF' else wav(audio, rate))
                print(f"✓ {L['id']}  {L['text'][:50]}", flush=True)
                err = ''
                break
            except urllib.error.HTTPError as e:
                text = e.read().decode('utf-8', 'replace')
                err = f'HTTP {e.code}: {text[:300]}'
                if e.code == 400 and use_instr and 'instruction' in text.lower():
                    use_instr = False; continue
                if e.code in (400, 401, 402):
                    sys.exit(f'\nOpenRouter refused the request — {err}')
                m = re.search(r'retry (?:in|after) (\d+(?:\.\d+)?)', text, re.I)
                d = float(m.group(1)) + 2 if m else min(10 * 2 ** attempt, 120)
            except Exception as e:
                err, d = str(e)[:300], min(10 * 2 ** attempt, 120)
            print(f"  {L['id']}: attempt {attempt + 1}/5 failed ({err[:120]}); waiting {d:.0f}s", flush=True)
            time.sleep(d)
        if err:
            failed[L['id']] = err
        time.sleep(4)
    (OUT / '_failed.json').write_text(json.dumps(failed, ensure_ascii=False, indent=1))
    done = len(list(OUT.glob('[0-9]*.wav')))
    print(f'\n{done}/{len(lines)} lines in {OUT}' + (f' — {len(failed)} failed, run again' if failed else ' — all done'))


if __name__ == '__main__':
    main()
