"""Small Elman RNN in pure Python. Explicit BPTT, softmax CE and optimizers.

Conditioning = previous bol + taal one-hot + phase sin/cos. Hidden state resets
at phrase boundaries during training, and carries across cycles at generation.
"""
import copy
import json
import math
import random
from pathlib import Path

from .data import VOCAB, TAALS, load_corpus, split_corpus


def softmax(values, temperature=1.0):
    scaled = [v / temperature for v in values]
    peak = max(scaled)
    exp = [math.exp(v - peak) for v in scaled]
    total = sum(exp)
    return [v / total for v in exp]


class BolRNN:
    def __init__(self, hidden=16, seed=42):
        self.hidden = hidden
        self.inputs = len(VOCAB) + len(TAALS) + 2
        rng = random.Random(seed)
        def matrix(rows, cols):
            scale = math.sqrt(6 / (rows + cols))
            return [[rng.uniform(-scale, scale) for _ in range(cols)] for _ in range(rows)]
        self.p = {'wx': matrix(hidden, self.inputs), 'wh': matrix(hidden, hidden),
                  'wy': matrix(len(VOCAB), hidden), 'bh': [[0.] * hidden], 'by': [[0.] * len(VOCAB)]}

    def features(self, previous, taal, position):
        x = [0.] * self.inputs
        if previous is not None:
            x[previous] = 1.
        x[len(VOCAB) + list(TAALS).index(taal)] = 1.
        phase = 2 * math.pi * (position % TAALS[taal]['beats']) / TAALS[taal]['beats']
        x[-2:] = [math.sin(phase), math.cos(phase)]
        return x

    def step(self, x, before):
        p = self.p
        h = [math.tanh(sum(a*b for a, b in zip(p['wx'][j], x)) +
                       sum(a*b for a, b in zip(p['wh'][j], before)) + p['bh'][0][j])
             for j in range(self.hidden)]
        logits = [sum(a*b for a, b in zip(row, h)) + bias
                  for row, bias in zip(p['wy'], p['by'][0])]
        return h, logits

    def loss_gradients(self, taal, tokens, backward=True):
        h, previous, cache, loss, correct = [0.] * self.hidden, None, [], 0., 0
        for position, target in enumerate(tokens):
            x = self.features(previous, taal, position)
            before = h
            h, logits = self.step(x, before)
            probs = softmax(logits)
            loss -= math.log(max(probs[target], 1e-15))
            correct += int(max(range(len(probs)), key=probs.__getitem__) == target)
            cache.append((x, before, h, probs, target))
            previous = target  # Teacher forcing.
        if not backward:
            return loss / len(tokens), correct / len(tokens)
        g = {k: [[0.] * len(row) for row in value] for k, value in self.p.items()}
        future = [0.] * self.hidden
        for x, before, h, probs, target in reversed(cache):
            dy = [v / len(tokens) for v in probs]
            dy[target] -= 1 / len(tokens)
            for k in range(len(VOCAB)):
                g['by'][0][k] += dy[k]
                for j in range(self.hidden):
                    g['wy'][k][j] += dy[k] * h[j]
            dh = [(sum(self.p['wy'][k][j] * dy[k] for k in range(len(VOCAB))) + future[j])
                  * (1 - h[j]**2) for j in range(self.hidden)]
            for j in range(self.hidden):
                g['bh'][0][j] += dh[j]
                for k, value in enumerate(x):
                    g['wx'][j][k] += dh[j] * value
                for k, value in enumerate(before):
                    g['wh'][j][k] += dh[j] * value
            future = [sum(self.p['wh'][j][k] * dh[j] for j in range(self.hidden))
                      for k in range(self.hidden)]
        return loss / len(tokens), g

    def generate(self, taal, cycles=4, temperature=.8, seed=42, anchor=True, prefix=None):
        rng = random.Random(seed)
        h, previous, output, entropy = [0.] * self.hidden, None, [], 0.
        prefix = prefix or []
        beats = TAALS[taal]['beats']
        for position in range(cycles * beats):
            h, logits = self.step(self.features(previous, taal, position), h)
            probs = softmax(logits, temperature)
            entropy += -sum(p * math.log(max(p, 1e-15)) for p in probs)
            if position < len(prefix):
                selected = VOCAB.index(prefix[position])
            elif anchor and position % beats == 0:
                selected = VOCAB.index('Dha')
            else:
                selected = rng.choices(range(len(VOCAB)), weights=probs)[0]
            output.append(VOCAB[selected])
            previous = selected
        return output, entropy / len(output)

    def to_dict(self):
        return {'format': 1, 'hidden': self.hidden, 'vocab': VOCAB, 'weights': self.p}

    @classmethod
    def from_dict(cls, data):
        if data['vocab'] != VOCAB or data['format'] != 1:
            raise ValueError('Unsupported model vocabulary or format.')
        model = cls(data['hidden'])
        model.p = data['weights']
        return model


class Optimizer:
    def __init__(self, params, name='adam', rate=.01):
        self.name, self.rate, self.t = name, rate, 0
        self.m = {k: [[0.] * len(r) for r in v] for k, v in params.items()}
        self.v = copy.deepcopy(self.m)

    def update(self, params, grads, clip=1.0):
        norm = math.sqrt(sum(x*x for rows in grads.values() for row in rows for x in row))
        scale = min(1., clip / (norm + 1e-12))
        self.t += 1
        for key, rows in params.items():
            for i, row in enumerate(rows):
                for j in range(len(row)):
                    g = grads[key][i][j] * scale
                    m, v = self.m[key][i][j], self.v[key][i][j]
                    if self.name == 'adam':
                        m, v = .9*m + .1*g, .999*v + .001*g*g
                        delta = (m / (1-.9**self.t)) / (math.sqrt(v / (1-.999**self.t)) + 1e-8)
                    elif self.name == 'rmsprop':
                        v = .9*v + .1*g*g
                        delta = g / (math.sqrt(v) + 1e-8)
                    elif self.name == 'momentum':
                        m = .9*m + g
                        delta = m
                    elif self.name == 'sgd':
                        delta = g
                    else:
                        raise ValueError('Unknown optimizer')
                    row[j] -= self.rate * delta
                    self.m[key][i][j], self.v[key][i][j] = m, v
        return norm


def evaluate(model, rows):
    total, correct, count = 0., 0., 0
    for taal, tokens in rows:
        loss, accuracy = model.loss_gradients(taal, tokens, backward=False)
        total += loss * len(tokens)
        correct += accuracy * len(tokens)
        count += len(tokens)
    return total / count, correct / count


def train(epochs=35, rate=.01, optimizer='adam', seed=42, hidden=16, callback=None, corpus=None):
    corpus = corpus or load_corpus()
    training, validation = split_corpus(corpus)
    model = BolRNN(hidden, seed)
    opt = Optimizer(model.p, optimizer, rate)
    rng = random.Random(seed)
    history, best, best_loss, best_epoch = [], None, float('inf'), 0
    for epoch in range(1, epochs + 1):
        rng.shuffle(training)
        norms = []
        for taal, tokens in training:
            _, grads = model.loss_gradients(taal, tokens)
            norms.append(opt.update(model.p, grads))
        loss, accuracy = evaluate(model, training)
        val_loss, val_accuracy = evaluate(model, validation)
        row = {'epoch': epoch, 'loss': loss, 'accuracy': accuracy, 'val_loss': val_loss,
               'val_accuracy': val_accuracy, 'gradient_norm': sum(norms)/len(norms)}
        history.append(row)
        if val_loss < best_loss:
            best_loss, best, best_epoch = val_loss, copy.deepcopy(model.p), epoch
        if callback:
            callback(row)
    model.p = best
    report = {'history': history, 'best_epoch': best_epoch, 'best_val_loss': best_loss,
              'perplexity': math.exp(best_loss), 'seed': seed, 'optimizer': optimizer,
              'learning_rate': rate, 'train_phrases': len(training), 'validation_phrases': len(validation),
              'parameters': sum(len(r) for v in model.p.values() for r in v),
              'dataset': 'Small original teaching corpus; held-out phrases share rhythmic motifs.'}
    return model, report


def save_checkpoint(model, report, path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps({'model': model.to_dict(), 'report': report}), encoding='utf-8')
    temp.replace(path)


def load_checkpoint(path):
    data = json.loads(Path(path).read_text(encoding='utf-8'))
    return BolRNN.from_dict(data['model']), data['report']
