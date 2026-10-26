"""Train a reproducible small RNN without third-party dependencies."""
import argparse
from tabla.data import ROOT, load_corpus
from tabla.network import train, save_checkpoint

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--epochs', type=int, default=35)
    parser.add_argument('--hidden', type=int, default=16)
    parser.add_argument('--rate', type=float, default=.01)
    parser.add_argument('--optimizer', choices=['adam', 'sgd', 'momentum', 'rmsprop'], default='adam')
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--corpus', default=str(ROOT / 'data/corpus.json'))
    parser.add_argument('--output', default=str(ROOT / 'artifacts/bol_rnn.json'))
    args = parser.parse_args()
    if not 1 <= args.epochs <= 300 or not 2 <= args.hidden <= 64 or not 0 < args.rate <= .2:
        parser.error('Use epochs 1..300, hidden 2..64, rate (0, .2].')
    model, report = train(args.epochs, args.rate, args.optimizer, args.seed, args.hidden,
                          lambda row: print(f"Epoch {row['epoch']:3}: loss={row['loss']:.4f} val={row['val_loss']:.4f}", flush=True),
                          load_corpus(args.corpus))
    save_checkpoint(model, report, args.output)
    print(f"Saved {args.output}; best epoch={report['best_epoch']}; validation perplexity={report['perplexity']:.3f}")
