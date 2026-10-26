"""One bol per matra; original teaching variations, not a performance corpus."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOCAB = ['Dha', 'Dhin', 'Tin', 'Ta', 'Na', 'Ge', 'Ka', 'Ti', 'Te', 'Rest']
TAALS = {
    'teentaal': {'name': 'Teentaal', 'beats': 16, 'groups': [4, 4, 4, 4], 'khali': 9, 'claps': [1, 5, 13]},
    'keherwa': {'name': 'Keherwa', 'beats': 8, 'groups': [4, 4], 'khali': 5, 'claps': [1]},
    'dadra': {'name': 'Dadra', 'beats': 6, 'groups': [3, 3], 'khali': 4, 'claps': [1]},
}


def load_corpus(path=None):
    raw = json.loads(Path(path or ROOT / 'data/corpus.json').read_text(encoding='utf-8'))
    if set(raw) != set(TAALS):
        raise ValueError('Corpus must contain teentaal, keherwa and dadra.')
    corpus = {}
    for taal, phrases in raw.items():
        if not isinstance(phrases, list) or len(phrases) < 4:
            raise ValueError(f'{taal}: provide at least four unique complete cycles.')
        rows = []
        for phrase in phrases:
            if not isinstance(phrase, str):
                raise ValueError('Each phrase must be a space-separated string.')
            tokens = phrase.split()
            if len(tokens) != TAALS[taal]['beats'] or any(t not in VOCAB for t in tokens):
                raise ValueError(f'{taal}: invalid cycle length or unknown bol in {phrase!r}')
            rows.append([VOCAB.index(t) for t in tokens])
        unique = list(dict.fromkeys(tuple(row) for row in rows))
        if len(unique) < 4:
            raise ValueError(f'{taal}: at least four distinct phrases required.')
        corpus[taal] = [list(row) for row in unique]
    return corpus


def split_corpus(corpus):
    """Hold out complete unique phrases BEFORE constructing training sequences."""
    train, validation = [], []
    for taal, rows in corpus.items():
        count = max(1, len(rows) // 4)
        train.extend((taal, row) for row in rows[:-count])
        validation.extend((taal, row) for row in rows[-count:])
    return train, validation
