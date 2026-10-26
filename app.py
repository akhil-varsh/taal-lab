"""Local-only teaching app. Start: python app.py; open http://127.0.0.1:8000."""
import argparse
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import mimetypes
import secrets
import threading
from urllib.parse import urlparse, parse_qs

from tabla.data import ROOT, TAALS, VOCAB, load_corpus
from tabla.network import load_checkpoint, train, save_checkpoint
from tabla.audio import render_wav, render_midi, render_abc

LOCK = threading.Lock()
CHECKPOINT = ROOT / 'artifacts/bol_rnn.json'
STATE = {'model': None, 'report': None, 'training': False, 'progress': [], 'error': None}
SESSIONS = OrderedDict()


def number(body, key, default, lo, hi, integer=False):
    value = body.get(key, default)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f'{key} must be a finite number.')
    if not lo <= value <= hi or (integer and value != int(value)):
        raise ValueError(f'{key} must be {"an integer " if integer else ""}between {lo} and {hi}.')
    return int(value) if integer else float(value)


def generate(body):
    taal = body.get('taal', 'teentaal')
    if not isinstance(taal, str) or taal not in TAALS:
        raise ValueError('Unknown taal.')
    cycles = number(body, 'cycles', 4, 1, 8, True)
    bpm = number(body, 'bpm', 100, 40, 220, True)
    temperature = number(body, 'temperature', .8, .1, 2)
    seed = number(body, 'seed', 42, 0, 2**31-1, True)
    prefix = body.get('prefix', '')
    if not isinstance(prefix, str):
        raise ValueError('Seed phrase must be text.')
    prefix = prefix.split()
    if len(prefix) > TAALS[taal]['beats'] or any(t not in VOCAB for t in prefix):
        raise ValueError('Seed phrase must be at most one cycle and use listed bols (case-sensitive).')
    engine = body.get('engine', 'rnn')
    anchor = body.get('anchor', True)
    if not isinstance(anchor, bool):
        raise ValueError('anchor must be true or false.')
    if engine == 'rnn':
        with LOCK:
            model = STATE['model']
        if model is None:
            raise ValueError('Train the RNN in Model Lab first, or select Theka reference.')
        tokens, entropy = model.generate(taal, cycles, temperature, seed, anchor, prefix)
    elif engine == 'theka':
        tokens = [VOCAB[t] for t in load_corpus()[taal][0]] * cycles
        entropy = None
    else:
        raise ValueError('Unknown engine.')
    result = {'id': secrets.token_hex(12), 'taal': taal, 'cycles': cycles, 'bpm': bpm,
              'temperature': temperature, 'seed': seed, 'engine': engine, 'anchor': anchor,
              'prefix': prefix, 'tokens': tokens, 'entropy': entropy, 'beats': TAALS[taal]['beats'],
              'duration': len(tokens)*60/bpm, 'unique_bols': len(set(tokens))}
    with LOCK:
        SESSIONS[result['id']] = result
        while len(SESSIONS) > 24:
            SESSIONS.popitem(last=False)
    return result


def train_background(epochs, rate, optimizer, seed):
    def progress(row):
        with LOCK:
            STATE['progress'].append(row)
    try:
        model, report = train(epochs, rate, optimizer, seed, callback=progress)
        save_checkpoint(model, report, CHECKPOINT)
        with LOCK:
            STATE['model'], STATE['report'] = model, report
    except Exception as error:
        with LOCK:
            STATE['error'] = str(error)
    finally:
        with LOCK:
            STATE['training'] = False


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def reply(self, status, data, content_type='application/json', filename=None):
        if content_type == 'application/json':
            data = json.dumps(data, allow_nan=False).encode()
        elif isinstance(data, str):
            data = data.encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Cache-Control', 'no-store')
        if filename:
            self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
        self.end_headers()
        self.wfile.write(data)

    def allowed_host(self):
        return self.headers.get('Host', '') in (f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}')

    def do_GET(self):
        if not self.allowed_host():
            return self.reply(403, {'error': 'Use the local app address.'})
        url = urlparse(self.path)
        if url.path == '/api/status':
            with LOCK:
                status = {k: v for k, v in STATE.items() if k != 'model'}
                status['ready'] = STATE['model'] is not None
                status['progress'] = list(STATE['progress'])
            status.update({'taals': TAALS, 'vocab': VOCAB})
            return self.reply(200, status)
        if url.path == '/api/corpus':
            return self.reply(200, {'corpus': {k: [' '.join(VOCAB[i] for i in row) for row in rows]
                                             for k, rows in load_corpus().items()}})
        if url.path == '/api/export':
            query = parse_qs(url.query)
            with LOCK:
                session = SESSIONS.get(query.get('id', [''])[0])
            if not session:
                return self.reply(404, {'error': 'Rhythm expired. Generate it again.'})
            fmt = query.get('format', ['json'])[0]
            args = session['tokens'], session['bpm'], session['beats']
            filename = f"taal-lab-{session['taal']}-{session['seed']}"
            if fmt == 'wav':
                return self.reply(200, render_wav(*args), 'audio/wav', filename + '.wav')
            if fmt == 'midi':
                return self.reply(200, render_midi(*args), 'audio/midi', filename + '.mid')
            if fmt == 'abc':
                abc = render_abc(session['tokens'], session['taal'], session['bpm'], session['beats'], TAALS[session['taal']]['groups'])
                return self.reply(200, abc, 'text/plain; charset=utf-8', filename + '.abc')
            if fmt == 'json':
                return self.reply(200, session, filename=filename + '.json')
            return self.reply(400, {'error': 'Unknown export format.'})
        files = {'/': 'index.html', '/style.css': 'style.css', '/app.js': 'app.js', '/lab.js': 'lab.js'}
        if url.path in files:
            path = ROOT / 'static' / files[url.path]
            return self.reply(200, path.read_bytes(), mimetypes.guess_type(path)[0] or 'text/plain')
        return self.reply(404, {'error': 'Not found.'})

    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            if not 0 < length <= 16384:
                raise ValueError('Request body must be 1..16384 bytes.')
            body = json.loads(self.rfile.read(length))
            # Consume the bounded body before replying, avoiding a TCP reset on Windows.
            if not self.allowed_host():
                return self.reply(403, {'error': 'Use the local app address.'})
            origin = self.headers.get('Origin')
            if origin and origin not in (f'http://127.0.0.1:{self.server.server_port}', f'http://localhost:{self.server.server_port}'):
                return self.reply(403, {'error': 'Cross-origin requests are disabled.'})
            if not isinstance(body, dict):
                raise ValueError('Request body must be an object.')
            if self.path == '/api/generate':
                return self.reply(200, generate(body))
            if self.path == '/api/train':
                epochs = number(body, 'epochs', 35, 1, 100, True)
                rate = number(body, 'rate', .01, .0001, .1)
                seed = number(body, 'seed', 42, 0, 2**31-1, True)
                optimizer = body.get('optimizer', 'adam')
                if optimizer not in ('adam', 'sgd', 'momentum', 'rmsprop'):
                    raise ValueError('Unknown optimizer.')
                with LOCK:
                    if STATE['training']:
                        return self.reply(409, {'error': 'Training is already running.'})
                    STATE.update(training=True, progress=[], error=None)
                threading.Thread(target=train_background, args=(epochs, rate, optimizer, seed), daemon=True).start()
                return self.reply(202, {'message': 'Training started.'})
            return self.reply(404, {'error': 'Not found.'})
        except (ValueError, TypeError, UnicodeDecodeError) as error:
            return self.reply(400, {'error': str(error)})


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    if CHECKPOINT.exists():
        STATE['model'], STATE['report'] = load_checkpoint(CHECKPOINT)
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print(f'Taal Lab is ready at http://127.0.0.1:{args.port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
