# Taal Lab: System and Platform Documentation

## 1. Overview

Taal Lab is an interactive browser-based teaching and music-generation platform
for Indian tabla rhythm. It combines:

- A visual web interface for exploring taal cycles.
- A small recurrent neural network (RNN) that generates symbolic tabla strokes.
- A deterministic reference mode based on theka patterns from the corpus.
- Browser playback and rhythm visualization.
- Export to WAV audio, MIDI, ABC notation, and JSON.
- An educational Model Lab explaining neural-network concepts, optimization,
  recurrence, activations, and music generation.
- A local Python training workflow.
- A Vercel-compatible serverless deployment adapter for the pre-trained model.

The project is intentionally lightweight. The main runtime uses Python's
standard library for the model, data processing, audio synthesis, MIDI writing,
and local HTTP server. Flask is used only by the Vercel adapter.

The system is not a general-purpose tabla performance synthesizer. It models
one symbolic bol per matra (beat position) and produces an educational,
repeatable demonstration of conditioned sequence generation.

---

## 2. Product purpose

The platform is designed to demonstrate how a learned sequence model can
generate a rhythmic phrase while preserving recognizable musical structure.
Its primary goals are:

1. Introduce taal as a structured rhythmic cycle.
2. Show how a recurrent model predicts the next symbolic bol.
3. Allow users to control rhythm, tempo, creativity, seed, and starting phrase.
4. Make the generated result audible and exportable.
5. Connect practical music generation to concepts from machine learning.
6. Remain usable without TensorFlow or a large deep-learning installation.

The optional Keras coursework is separate from the main studio. The core
studio uses a small pure-Python RNN so that it can run locally with minimal
dependencies and can be packaged for a lightweight serverless demo.

---

## 3. User-facing capabilities

### 3.1 Landing page

The landing page introduces the product and explains:

- The relationship between tabla, rhythm, and AI.
- The three supported taal cycles.
- The generation workflow.
- The Bol-RNN architecture.
- The distinction between learned patterns and symbolic/audio output.

Users can select a taal preview and open the Studio with that taal already
selected.

### 3.2 Supported taal cycles

The application currently supports:

| Taal | Beats per cycle | Grouping | Khali position | Primary use |
|---|---:|---|---:|---|
| Teentaal | 16 | 4 + 4 + 4 + 4 | 9 | Longer, evenly divided cycle |
| Keherwa | 8 | 4 + 4 | 5 | Short, flowing cycle |
| Dadra | 6 | 3 + 3 | 4 | Compact, lilting cycle |

The internal indexing used by the model is zero-based, while the musical
metadata displayed to users is one-based.

### 3.3 Rhythm Studio

The Studio allows the user to:

- Select a taal.
- Select the number of cycles.
- Set tempo from 40 to 220 BPM.
- Set temperature from 0.1 to 2.0.
- Set a random seed.
- Enter an optional prefix of bols.
- Toggle cycle anchoring.
- Select the RNN generator or theka reference mode.
- Generate a phrase.
- Play, pause, loop, seek, mute, and change volume.
- View the current bol, beat, cycle, and upcoming bol.
- Inspect the taal wheel and generated pattern.
- Enter a performance-focused view.
- Download WAV, MIDI, ABC, or JSON.

The default generation request is:

```json
{
  "taal": "teentaal",
  "cycles": 4,
  "bpm": 100,
  "temperature": 0.8,
  "seed": 42,
  "prefix": "",
  "engine": "rnn",
  "anchor": true
}
```

### 3.4 Model Lab

The Model Lab displays:

- Whether the checkpoint is loaded.
- Whether the model is ready.
- Training and validation history.
- Loss and accuracy curves.
- Best validation epoch.
- Validation perplexity.
- Training/validation phrase counts.
- Number of trainable parameters.
- Training controls for epochs, learning rate, optimizer, and seed.

When running locally, the Model Lab can start training in a background thread.
When running through Vercel, training is deliberately disabled because
serverless functions do not provide durable background workers or persistent
local storage. The Vercel adapter returns HTTP 503 for `POST /api/train`.

### 3.5 Inside the AI

The educational area explains:

- Single-neuron learning and XOR.
- Activations and vanishing gradients.
- Bias-variance and validation.
- Optimizers such as SGD, momentum, and Adam.
- Recurrent state and sequence generation.
- Teacher forcing.
- Autoregressive sampling.
- Temperature and random seeds.
- Symbolic bol generation versus ABC character generation.
- Differences between the small teaching model and production-scale models.

Some visual demonstrations run entirely in browser JavaScript and do not call
the Python API.

### 3.6 Dataset view

The Dataset area displays corpus phrases returned by `GET /api/corpus`.
The corpus is project-authored and contains complete cycles for each taal.

---

## 4. Architecture

### 4.1 High-level architecture

```text
Browser
  |
  | HTML, CSS, JavaScript
  | fetch('/api/...')
  v
Python HTTP/API layer
  |
  +-- Model checkpoint loader
  +-- Bol-RNN generation
  +-- Corpus validation/loading
  +-- WAV renderer
  +-- MIDI renderer
  +-- ABC renderer
  |
  +-- Local mode: standard-library ThreadingHTTPServer
  +-- Vercel mode: Flask WSGI function
```

### 4.2 Main source areas

| Path | Responsibility |
|---|---|
| [`app.py`](./app.py) | Original local HTTP server, validation, generation orchestration, local training |
| [`api/index.py`](./api/index.py) | Flask adapter used by Vercel |
| [`tabla/data.py`](./tabla/data.py) | Root path, taal metadata, vocabulary, corpus loading and splitting |
| [`tabla/network.py`](./tabla/network.py) | Bol-RNN, softmax, training, evaluation, optimizers, checkpoint serialization |
| [`tabla/audio.py`](./tabla/audio.py) | Deterministic WAV, MIDI, and ABC export |
| [`static/index.html`](./static/index.html) | Browser markup and page sections |
| [`static/app.js`](./static/app.js) | Studio state, API calls, playback, generation, charts, navigation |
| [`static/lab.js`](./static/lab.js) | Educational visualizations and explanations |
| [`static/style.css`](./static/style.css) | Visual design and responsive layout |
| [`data/corpus.json`](./data/corpus.json) | Complete symbolic training phrases |
| [`artifacts/bol_rnn.json`](./artifacts/bol_rnn.json) | Serialized trained RNN checkpoint and report |
| [`train.py`](./train.py) | Command-line training entry point |
| [`tests/test_api.py`](./tests/test_api.py) | Local API and export behavior tests |
| [`tests/test_core.py`](./tests/test_core.py) | Model, gradient, training, audio, MIDI, and ABC tests |
| [`tests/studio-ui.test.cjs`](./tests/studio-ui.test.cjs) | Dependency-free JavaScript interaction checks |
| [`vercel.json`](./vercel.json) | Vercel Python function routing and file inclusion |
| [`requirements.txt`](./requirements.txt) | Runtime dependency list, currently Flask for Vercel |
| [`requirements-keras.txt`](./requirements-keras.txt) | Optional Keras/TensorFlow coursework dependencies |

### 4.3 Runtime modes

#### Local mode

Local mode is started with:

```powershell
python app.py
```

The server listens on:

```text
http://127.0.0.1:8000
```

The local server:

- Serves the files from `static/`.
- Loads the checkpoint at startup.
- Supports generation and exports.
- Supports local background training.
- Keeps generated sessions in memory.
- Restricts requests to local host names.

#### Vercel mode

Vercel loads the top-level Flask object named `app` from
[`api/index.py`](./api/index.py).

The adapter:

- Loads the committed checkpoint when the function initializes.
- Serves the same frontend assets.
- Reuses `app.generate()` and the existing model/audio modules.
- Exposes the status, corpus, generation, and export routes.
- Disables training with a clear 503 response.
- Does not modify the core model or generation implementation.

The deployment configuration includes:

- `api/index.py`
- `requirements.txt`
- `vercel.json`
- `static/**`
- `data/**`
- `artifacts/**`
- `tabla/**`

---

## 5. Data and musical representation

### 5.1 Vocabulary

The model vocabulary contains ten tokens:

```text
Dha, Dhin, Tin, Ta, Na, Ge, Ka, Ti, Te, Rest
```

Each token represents one symbolic bol at one matra position. `Rest` is a
valid silent token.

### 5.2 Corpus format

The corpus is JSON keyed by taal:

```json
{
  "dadra": [
    "Dha Dhin Na Dha Tin Na"
  ]
}
```

Every phrase must:

- Be a string.
- Contain exactly the number of beats for its taal.
- Contain only known vocabulary tokens.
- Have at least four distinct complete phrases per taal.

Duplicate phrases are removed while loading.

### 5.3 Train/validation split

The corpus is split by complete phrase before sequence construction. For each
taal, approximately one quarter of the unique phrases are held out for
validation, with at least one validation phrase.

This prevents overlapping windows from leaking the same complete phrase between
training and validation.

The current test corpus produces:

- 27 training phrases.
- 9 validation phrases.

---

## 6. Bol-RNN model

### 6.1 Architecture

The default model is a small Elman-style recurrent neural network:

```text
15 input features
        |
        v
16 tanh hidden neurons
        |
        v
10 output bol scores
        |
        v
stable softmax distribution
```

The model has 682 trainable parameters in the default configuration.

### 6.2 Input features

At each position, the input contains:

- A one-hot representation of the previous bol: 10 features.
- A one-hot representation of the taal: 3 features.
- Sine of the position phase: 1 feature.
- Cosine of the position phase: 1 feature.

Total: 15 input features.

The phase is calculated relative to the selected taal's cycle length, allowing
the model to distinguish positions within Teentaal, Keherwa, and Dadra.

### 6.3 Recurrent state

The hidden state is updated using:

```text
h_t = tanh(W_x x_t + W_h h_(t-1) + b_h)
```

Output logits are calculated from the hidden state:

```text
logits_t = W_y h_t + b_y
```

The output logits are converted to probabilities with a numerically stable
softmax.

### 6.4 Training

Training uses:

- Cross-entropy loss.
- Backpropagation through time.
- Teacher forcing.
- Global gradient-norm clipping.
- Adam, SGD, momentum, or RMSprop.
- Fixed random seeds for reproducibility.
- Best-checkpoint retention based on validation loss.

Teacher forcing means the true preceding token is used while calculating the
training loss. During generation, the model's own selected token becomes the
next previous token.

### 6.5 Generation

Generation is autoregressive:

1. Reset hidden state.
2. Encode the current previous token, taal, and phase.
3. Compute the next-token distribution.
4. Apply temperature.
5. Select a token using the seeded random generator.
6. Feed the selected token into the next step.
7. Repeat for the requested number of cycles.

When anchoring is enabled, the first position of every cycle is forced to
`Dha`. A supplied prefix is forced into the beginning of the generated
sequence.

The output includes average token entropy as a rough measure of distribution
uncertainty.

### 6.6 Temperature

Temperature changes the sharpness of the probability distribution:

- Lower values favor high-probability, familiar tokens.
- Higher values allow more variation.
- It does not retrain the model.

The accepted range is `0.1` through `2.0`.

### 6.7 Seed

The seed controls the pseudo-random sampling sequence. With the same:

- Checkpoint.
- Taal.
- Number of cycles.
- Temperature.
- Prefix.
- Anchor setting.
- Seed.

generation is deterministic.

---

## 7. Theka reference mode

The `theka` engine does not sample from the RNN. It loads the first corpus
phrase for the selected taal and repeats it for the requested cycle count.

This provides:

- A recognizable reference pattern.
- A baseline for comparing learned generation.
- A fallback mode that does not require the model checkpoint.

The `rnn` engine requires a loaded model. The Vercel deployment includes the
checkpoint so the default RNN mode is ready at startup.

---

## 8. API specification

All API responses are JSON except binary or text export responses.

### 8.1 `GET /api/status`

Returns model and application status:

```json
{
  "ready": true,
  "training": false,
  "progress": [],
  "error": null,
  "report": {},
  "taals": {},
  "vocab": [
    "Dha",
    "Dhin",
    "Tin",
    "Ta",
    "Na",
    "Ge",
    "Ka",
    "Ti",
    "Te",
    "Rest"
  ]
}
```

Important fields:

- `ready`: whether a model is loaded.
- `training`: whether local training is running.
- `progress`: epoch progress rows.
- `error`: most recent local training error.
- `report`: checkpoint metrics.
- `taals`: cycle metadata.
- `vocab`: valid bol list.

### 8.2 `GET /api/corpus`

Returns the corpus converted back into readable bol strings:

```json
{
  "corpus": {
    "dadra": [
      "Dha Dhin Na Dha Tin Na"
    ]
  }
}
```

### 8.3 `POST /api/generate`

Request body:

| Field | Type | Default | Range or allowed values |
|---|---|---:|---|
| `taal` | string | `teentaal` | `teentaal`, `keherwa`, `dadra` |
| `cycles` | integer | 4 | 1 through 8 |
| `bpm` | integer | 100 | 40 through 220 |
| `temperature` | number | 0.8 | 0.1 through 2.0 |
| `seed` | integer | 42 | 0 through 2,147,483,647 |
| `prefix` | string | empty | At most one cycle of valid bols |
| `engine` | string | `rnn` | `rnn` or `theka` |
| `anchor` | boolean | true | true or false |

Successful response:

```json
{
  "id": "generated-session-id",
  "taal": "dadra",
  "cycles": 1,
  "bpm": 120,
  "temperature": 0.8,
  "seed": 42,
  "engine": "rnn",
  "anchor": true,
  "prefix": [],
  "tokens": ["Dha", "Dhin", "Na", "Dha", "Tin", "Na"],
  "entropy": 1.2,
  "beats": 6,
  "duration": 3.0,
  "unique_bols": 5
}
```

Validation errors return HTTP 400 with:

```json
{
  "error": "Explanation of the invalid field or request"
}
```

### 8.4 `GET /api/export`

Required query parameter:

```text
id=<generation-session-id>
```

Optional query parameter:

```text
format=wav|midi|abc|json
```

The response includes an attachment filename based on taal and seed:

```text
taal-lab-dadra-42.wav
```

Export formats:

| Format | Content type | Description |
|---|---|---|
| WAV | `audio/wav` | Mono, 16-bit, 22,050 Hz synthesized percussion |
| MIDI | `audio/midi` | General MIDI approximation with timed note events |
| ABC | `text/plain` | Symbolic pitch mapping for notation tools |
| JSON | `application/json` | Full generated session data |

Export sessions are stored in memory and limited to the newest 24 sessions.
On Vercel, a session may disappear when a serverless instance is replaced.
Users should export immediately after generation.

### 8.5 `POST /api/train`

#### Local mode

Starts background training with:

```json
{
  "epochs": 35,
  "rate": 0.01,
  "optimizer": "adam",
  "seed": 42
}
```

Training validation:

- `epochs`: 1 through 100.
- `rate`: 0.0001 through 0.1.
- `optimizer`: `adam`, `sgd`, `momentum`, or `rmsprop`.
- `seed`: non-negative integer.

#### Vercel mode

Returns HTTP 503:

```json
{
  "error": "Training is available locally, not on Vercel."
}
```

This is intentional. Vercel is used for serving the pre-trained checkpoint,
not for persistent model training.

---

## 9. Audio and export implementation

### 9.1 WAV

The WAV renderer:

- Produces mono audio.
- Uses 16-bit PCM.
- Uses a 22,050 Hz sample rate.
- Generates a deterministic synthesized stroke for each bol.
- Adds a stronger accent at the beginning of each taal cycle.
- Treats `Rest` as silence.
- Normalizes the final signal to avoid clipping.
- Includes the final stroke tail.

The timbre is a simple mathematical percussion approximation, not a recording
of a tabla.

### 9.2 MIDI

The MIDI renderer:

- Produces a standard single-track MIDI file.
- Uses 480 ticks per quarter note.
- Writes tempo metadata from BPM.
- Emits General MIDI note approximations for each bol.
- Uses shorter note durations within each beat.
- Leaves `Rest` without note events.
- Accents the first beat of each cycle.

MIDI playback depends on the destination application's instrument mapping.

### 9.3 ABC notation

The ABC renderer:

- Writes a complete ABC text document.
- Selects `4/4` for Teentaal and Keherwa.
- Selects `3/4` for Dadra.
- Maps bols to symbolic ABC pitches.
- Represents `Rest` as `z`.
- Writes one quarter note per matra.

ABC output is a symbolic demonstration and does not preserve the synthesized
tabla timbre. WAV is the preferred export for listening.

---

## 10. Persistence and state

### 10.1 Checkpoint

The model checkpoint is:

```text
artifacts/bol_rnn.json
```

It contains:

- Model format version.
- Hidden-layer size.
- Vocabulary.
- Weight matrices and biases.
- Training report.

The checkpoint is read at application startup.

### 10.2 Process memory

The following objects are process-local:

- Current model.
- Current training status.
- Training progress.
- Last training error.
- Generated sessions.

This is sufficient for local development and a simple demo, but it is not
durable multi-user storage.

### 10.3 Vercel implications

Vercel functions can start in separate instances and can be recycled. As a
result:

- A new instance reloads the committed checkpoint.
- Generated sessions are not guaranteed to be available across instances.
- Training state is not shared across requests.
- Writing a new checkpoint to the deployment filesystem is not a persistence
  strategy.

For production-scale persistence, use external storage such as a database,
object storage, or a managed key-value service.

---

## 11. Deployment

### 11.1 Vercel files

The minimal deployment uses:

```text
api/index.py
vercel.json
requirements.txt
static/
data/
artifacts/bol_rnn.json
tabla/
```

The Vercel configuration builds the Python function from
`api/index.py` and explicitly includes the static files, corpus, checkpoint,
and model modules.

### 11.2 Local preparation

From PowerShell:

```powershell
cd C:\Users\Akhil\Projects\Python_Projects\DLA
python -m unittest discover -s tests -v
python app.py
```

Open:

```text
http://127.0.0.1:8000
```

### 11.3 Vercel deployment

Install the CLI:

```powershell
npm install -g vercel
```

Log in and deploy:

```powershell
vercel login
vercel
```

Deploy to production:

```powershell
vercel --prod
```

The generated Vercel URL serves the browser interface and the Python API from
the same origin. The frontend's relative requests such as
`fetch('/api/generate')` therefore do not require cross-origin configuration.

### 11.4 Deployment requirements

The following files must be included in the repository:

- `api/index.py`
- `vercel.json`
- `requirements.txt`
- `tabla/*.py`
- `data/corpus.json`
- `artifacts/bol_rnn.json`
- `static/index.html`
- `static/app.js`
- `static/lab.js`
- `static/style.css`

The local virtual environment must not be deployed.

---

## 12. Security and validation behavior

The API validates:

- Taal names.
- Numeric types.
- Boolean types.
- Finite numeric values.
- Numeric ranges.
- Prefix token membership.
- Prefix length.
- Engine names.
- Optimizer names.
- Request body shape.

The local server also:

- Restricts host names to localhost addresses.
- Restricts cross-origin POST requests.
- Limits request bodies to 16,384 bytes.
- Uses content-type and no-sniff headers.
- Uses no-store caching for API responses.

The Vercel adapter relies on same-origin routing and Flask request handling.
The deployment should still be protected by HTTPS and, if training or
administrative operations are ever re-enabled, authentication and rate
limiting should be added.

The current public Vercel demo should be treated as an interactive teaching
application, not as a hardened public multi-tenant service.

---

## 13. Testing

### 13.1 Python tests

Run:

```powershell
python -m unittest discover -s tests -v
```

The tests cover:

- Local static page delivery.
- Model status.
- RNN generation.
- All export formats.
- Invalid request rejection.
- Training parameter validation.
- Training state handling.
- Gradient finite-difference checks.
- Validation split leakage prevention.
- Training improvement.
- Checkpoint round trips.
- Deterministic generation.
- WAV validity and silence behavior.
- MIDI timing and tempo.
- ABC meter and notation.

### 13.2 Browser JavaScript checks

Run:

```powershell
node --test tests/studio-ui.test.cjs
```

The dependency-free interaction harness checks:

- Landing and Studio navigation.
- Taal selection.
- Sidebar persistence.
- Playback clock behavior.
- Seeking and looping.
- Volume and mute state.
- Performance focus.
- Architecture tabs.
- Loaded checkpoint metrics.

These are state and interaction checks, not a replacement for visual browser
testing.

### 13.3 Deployment smoke checks

After deployment, manually verify:

1. The root page loads.
2. The browser console has no failed asset requests.
3. `/api/status` reports `"ready": true`.
4. The Studio can generate a phrase.
5. WAV playback works.
6. WAV, MIDI, ABC, and JSON links download.
7. Theka mode works.
8. Invalid generation requests show an error.
9. The Model Lab clearly indicates that training is unavailable on Vercel.

---

## 14. Operational limitations

### 14.1 Model limitations

The model is deliberately small and trained on a small authored corpus. It
should be interpreted as:

- A teaching model.
- A pattern exploration tool.
- A demonstration of recurrent sequence generation.

It is not a benchmarked or production-grade musical model.

### 14.2 Musical limitations

The current representation does not model:

- Subdivision timing.
- Swing or expressive microtiming.
- Velocity dynamics beyond simple cycle accents.
- Multiple simultaneous tabla strokes as a rich performance event.
- Human phrasing.
- Recorded instrument timbre.
- Pitch variation.
- Full improvisational grammar.
- Long-form composition structure.

The audio renderer is synthetic and educational.

### 14.3 Hosting limitations

The Vercel deployment does not provide:

- Durable training jobs.
- Durable generated-session storage.
- Shared in-memory state between instances.
- Persistent filesystem writes.
- User accounts.
- Authentication.
- Database-backed history.

These features require additional infrastructure.

### 14.4 Browser limitations

Audio playback is subject to browser autoplay rules. A user interaction such
as pressing Play may be required before sound can start.

The application uses modern browser APIs including:

- `fetch`.
- `Audio`.
- `CanvasRenderingContext2D`.
- `requestAnimationFrame`.
- `matchMedia`.
- DOM history and hash navigation.

Current evergreen desktop and mobile browsers should support the main
interface.

---

## 15. Recommended future improvements

The following improvements are outside the current minimal deployment scope:

1. Add durable storage for generated sessions.
2. Add authentication for training and administrative actions.
3. Move training to a job worker or scheduled offline process.
4. Store checkpoints in object storage or a model registry.
5. Add request rate limiting.
6. Add structured server logging and monitoring.
7. Add automated Vercel preview smoke tests.
8. Add browser-based visual and accessibility testing.
9. Expand the corpus with expert-reviewed rhythmic variations.
10. Add richer event representations for subdivisions, dynamics, and timing.
11. Add a dedicated production audio engine or recorded sample library.
12. Add versioning for corpus, checkpoint, and generation configuration.
13. Add a stable API contract document and OpenAPI definition.
14. Add content security policy and additional security headers.

---

## 16. Quick reference

### Run locally

```powershell
cd C:\Users\Akhil\Projects\Python_Projects\DLA
python app.py
```

Open `http://127.0.0.1:8000`.

### Run tests

```powershell
python -m unittest discover -s tests -v
node --test tests/studio-ui.test.cjs
```

### Train locally

```powershell
python train.py --epochs 35 --optimizer adam --rate 0.01 --seed 42
```

### Deploy to Vercel

```powershell
npm install -g vercel
vercel login
vercel --prod
```

### Core generated artifact

```text
artifacts/bol_rnn.json
```

### Main API routes

```text
GET  /
GET  /api/status
GET  /api/corpus
POST /api/generate
GET  /api/export
POST /api/train
```

### Deployment training rule

```text
Local: training enabled
Vercel: training disabled; use the committed checkpoint
```

