"""Vercel adapter for the Taal Lab application.

The generation, model, and export implementation remains in the existing modules.
This file only adapts the local HTTP API to Vercel's WSGI runtime.
"""
from pathlib import Path

from flask import Flask, Response, jsonify, request, send_from_directory

import app as local_app
from tabla.audio import render_abc, render_midi, render_wav
from tabla.data import TAALS, VOCAB, load_corpus


ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "static"

app = Flask(__name__)

if local_app.CHECKPOINT.exists():
    local_app.STATE["model"], local_app.STATE["report"] = local_app.load_checkpoint(
        local_app.CHECKPOINT
    )


def status_payload():
    with local_app.LOCK:
        status = {key: value for key, value in local_app.STATE.items() if key != "model"}
        status["ready"] = local_app.STATE["model"] is not None
        status["progress"] = list(local_app.STATE["progress"])
    status.update({"taals": TAALS, "vocab": VOCAB})
    return status


@app.get("/")
def home():
    return send_from_directory(STATIC, "index.html")


@app.get("/<path:filename>")
def static_file(filename):
    if filename in {"style.css", "app.js", "lab.js"}:
        return send_from_directory(STATIC, filename)
    return jsonify(error="Not found."), 404


@app.get("/api/status")
def status():
    return jsonify(status_payload())


@app.get("/api/corpus")
def corpus():
    return jsonify(
        corpus={
            taal: [" ".join(VOCAB[index] for index in row) for row in rows]
            for taal, rows in load_corpus().items()
        }
    )


@app.post("/api/generate")
def generate():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify(error="Request body must be an object."), 400
    try:
        return jsonify(local_app.generate(body))
    except (ValueError, TypeError, UnicodeDecodeError) as error:
        return jsonify(error=str(error)), 400


@app.get("/api/export")
def export():
    session_id = request.args.get("id", "")
    with local_app.LOCK:
        session = local_app.SESSIONS.get(session_id)
    if not session:
        return jsonify(error="Rhythm expired. Generate it again."), 404

    fmt = request.args.get("format", "json")
    filename = f"taal-lab-{session['taal']}-{session['seed']}"
    args = session["tokens"], session["bpm"], session["beats"]
    if fmt == "wav":
        return Response(
            render_wav(*args),
            mimetype="audio/wav",
            headers={"Content-Disposition": f'attachment; filename="{filename}.wav"'},
        )
    if fmt == "midi":
        return Response(
            render_midi(*args),
            mimetype="audio/midi",
            headers={"Content-Disposition": f'attachment; filename="{filename}.mid"'},
        )
    if fmt == "abc":
        content = render_abc(
            session["tokens"],
            session["taal"],
            session["bpm"],
            session["beats"],
            TAALS[session["taal"]]["groups"],
        )
        return Response(
            content,
            mimetype="text/plain",
            headers={"Content-Disposition": f'attachment; filename="{filename}.abc"'},
        )
    if fmt == "json":
        response = jsonify(session)
        response.headers["Content-Disposition"] = (
            f'attachment; filename="{filename}.json"'
        )
        return response
    return jsonify(error="Unknown export format."), 400


@app.post("/api/train")
def train():
    return jsonify(error="Training is available locally, not on Vercel."), 503
