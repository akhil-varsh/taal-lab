"""Runnable syllabus experiments; optional TensorFlow dependency.

Examples:
  python -m coursework.keras_experiments --task lstm --epochs 30
  python -m coursework.keras_experiments --task generate --model lstm
  python -m coursework.keras_experiments --task mnist --epochs 5
"""
import argparse
import itertools
import json
import math
from pathlib import Path

from tabla.data import ROOT, VOCAB, TAALS, load_corpus, split_corpus
from tabla.audio import render_abc, render_wav, render_midi

# Imported only for the optional experiments; the studio has no dependencies.
try:
    import numpy as np
    import tensorflow as tf
except ImportError as error:
    raise SystemExit('Use Google Colab or install requirements-keras.txt in a compatible Python environment.') from error

K = tf.keras
V, PAD, BOS = len(VOCAB), len(VOCAB), len(VOCAB)+1
OUT = ROOT / 'artifacts/experiments'


def optimizer(name, rate):
    options = dict(learning_rate=rate, global_clipnorm=1.0)
    factories = {
        'sgd': lambda: K.optimizers.SGD(**options),
        'momentum': lambda: K.optimizers.SGD(momentum=.9, **options),
        'nag': lambda: K.optimizers.SGD(momentum=.9, nesterov=True, **options),
        'adagrad': lambda: K.optimizers.Adagrad(**options),
        'adadelta': lambda: K.optimizers.Adadelta(**options),
        'rmsprop': lambda: K.optimizers.RMSprop(**options),
        'adam': lambda: K.optimizers.Adam(**options),
    }
    return factories[name]()


def condition(taal, position):
    phase = 2*math.pi*position/TAALS[taal]['beats']
    return [float(taal == key) for key in TAALS] + [math.sin(phase), math.cos(phase)]


def sequence_data(rows):
    """Previous tokens -> current tokens, padded at the END with zero loss weights."""
    tokens = np.full((len(rows), 16), PAD, dtype='int32')
    cond = np.zeros((len(rows), 16, 5), dtype='float32')
    targets = np.zeros((len(rows), 16), dtype='int32')
    weights = np.zeros((len(rows), 16), dtype='float32')
    for i, (taal, row) in enumerate(rows):
        n = len(row)
        tokens[i, :n] = [BOS] + row[:-1]
        cond[i, :n] = [condition(taal, t) for t in range(n)]
        targets[i, :n], weights[i, :n] = row, 1.
    return [tokens, cond], targets, weights


def context_features(previous, taal, position, context=4):
    ids = ([BOS] * context + previous)[-context:]
    return np.concatenate([np.eye(V+2, dtype='float32')[ids].ravel(), condition(taal, position)]).astype('float32')


def mlp_data(rows):
    x, y = [], []
    for taal, row in rows:
        for position, token in enumerate(row):
            x.append(context_features(row[:position], taal, position))
            y.append(token)
    return np.array(x), np.array(y, dtype='int32')


def build_bol_model(args, kind):
    reg = K.regularizers.l2(args.l2)
    if kind == 'lstm':
        tokens = K.Input(shape=(None,), dtype='int32', name='previous_bol')
        cond = K.Input(shape=(None, 5), name='taal_and_phase')
        embedded = K.layers.Embedding(V+2, 24)(tokens)
        x = K.layers.Concatenate()([embedded, cond])
        x = K.layers.LSTM(args.hidden, return_sequences=True, kernel_regularizer=reg)(x)
        x = K.layers.Dropout(args.dropout)(x)
        logits = K.layers.TimeDistributed(K.layers.Dense(V), name='next_bol_logits')(x)
        model = K.Model([tokens, cond], logits)
    else:
        inputs = K.Input(shape=(4*(V+2)+5,))
        x = inputs
        for width in (args.hidden, args.hidden):
            x = K.layers.Dense(width, kernel_initializer='he_normal' if args.activation=='relu' else 'glorot_uniform', kernel_regularizer=reg)(x)
            if args.batchnorm:
                x = K.layers.BatchNormalization()(x)
            x = K.layers.Activation(args.activation)(x)
            x = K.layers.Dropout(args.dropout)(x)
        model = K.Model(inputs, K.layers.Dense(V)(x))
    model.compile(optimizer=optimizer(args.optimizer, args.rate),
                  loss=K.losses.SparseCategoricalCrossentropy(from_logits=True),
                  weighted_metrics=[K.metrics.SparseCategoricalAccuracy(name='accuracy')])
    return model


def callbacks():
    return [K.callbacks.EarlyStopping(monitor='val_loss', patience=6, restore_best_weights=True)]


def record(name, model, history, extra=None):
    OUT.mkdir(parents=True, exist_ok=True)
    model.save(OUT / f'{name}.keras')
    report = {'history': history.history, 'tensorflow': tf.__version__, 'extra': extra or {}}
    (OUT / f'{name}.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    return report


def train_bol(args, kind, save=True):
    training, validation = split_corpus(load_corpus(args.corpus))
    model = build_bol_model(args, kind)
    if kind == 'lstm':
        x, y, weights = sequence_data(training)
        vx, vy, vw = sequence_data(validation)
        history = model.fit(x, y, sample_weight=weights, validation_data=(vx, vy, vw),
                            epochs=args.epochs, batch_size=8, callbacks=callbacks(), verbose=2)
        # Keras sequence loss is reduced over padded length. Report true per-token CE separately.
        per_token = K.losses.sparse_categorical_crossentropy(vy, model(vx, training=False), from_logits=True).numpy()
        token_loss = float((per_token*vw).sum()/vw.sum())
    else:
        x, y = mlp_data(training)
        vx, vy = mlp_data(validation)
        history = model.fit(x, y, validation_data=(vx, vy), epochs=args.epochs,
                            batch_size=32, callbacks=callbacks(), verbose=2)
        token_loss = float(np.mean(K.losses.sparse_categorical_crossentropy(vy, model(vx, training=False), from_logits=True)))
    extra = {'held_out_token_crossentropy': token_loss, 'perplexity': math.exp(token_loss),
             'seed': args.seed, 'settings': vars(args), 'train_phrases': len(training),
             'validation_phrases': len(validation)}
    if save:
        record(kind, model, history, extra)
    print(f'Held-out token cross-entropy: {token_loss:.4f}; perplexity: {math.exp(token_loss):.3f}')
    return token_loss


def sample(logits, temperature, rng):
    logits = np.asarray(logits, dtype='float64') / temperature
    weights = np.exp(logits-logits.max())
    return int(rng.choice(len(weights), p=weights/weights.sum()))


def generate_bols(args):
    model = K.models.load_model(OUT / f'{args.model}.keras')
    rng = np.random.default_rng(args.seed)
    output = []
    for position in range(TAALS[args.taal]['beats']*args.cycles):
        if args.model == 'lstm':
            tokens = np.array([[BOS]+output], dtype='int32')
            cond = np.array([[condition(args.taal, t) for t in range(position+1)]], dtype='float32')
            logits = model([tokens, cond], training=False).numpy()[0, -1]
        else:
            x = context_features(output, args.taal, position)[None, :]
            logits = model(x, training=False).numpy()[0]
        output.append(sample(logits, args.temperature, rng))
    bols = [VOCAB[i] for i in output]
    beats = TAALS[args.taal]['beats']
    (OUT/'generated.wav').write_bytes(render_wav(bols, args.bpm, beats))
    (OUT/'generated.mid').write_bytes(render_midi(bols, args.bpm, beats))
    (OUT/'generated.json').write_text(json.dumps({'tokens': bols, 'settings': vars(args)}, indent=2), encoding='utf-8')
    print(' '.join(bols))
    print(f'Audio, MIDI, and metadata saved in {OUT}')


def abc_phrases(rows):
    return ['\n'.join(line for line in render_abc(
                [VOCAB[t] for t in row], taal, 100, TAALS[taal]['beats'], TAALS[taal]['groups']
            ).splitlines() if not line.startswith('%')) + '\n' for taal, row in rows]


def char_data(texts, chars, length=48):
    # Split was already performed at phrase level; overlapping windows cannot cross splits.
    index = {c:i+1 for i,c in enumerate(chars)}
    examples = []
    for text in texts:
        ids = [index[c] for c in text]
        for start in range(0, len(ids)-1, 24):
            seq = ids[start:start+length+1]
            if len(seq) > 1:
                examples.append(seq)
    x = np.zeros((len(examples),length),dtype='int32')
    y = x.copy()
    w = np.zeros_like(x,dtype='float32')
    for i,seq in enumerate(examples):
        n=len(seq)-1
        x[i,:n], y[i,:n], w[i,:n] = seq[:-1], seq[1:], 1.
    return x,y,w


def train_char(args):
    training, validation = split_corpus(load_corpus(args.corpus))
    train_texts, val_texts = abc_phrases(training), abc_phrases(validation)
    chars = sorted(set(''.join(train_texts)))
    if set(''.join(val_texts))-set(chars):
        raise ValueError('Validation contains unseen ABC characters. Expand the training vocabulary explicitly.')
    x,y,w = char_data(train_texts,chars)
    vx,vy,vw = char_data(val_texts,chars)
    model=K.Sequential([K.Input(shape=(None,),dtype='int32'),K.layers.Embedding(len(chars)+1,24),
                        K.layers.LSTM(args.hidden,return_sequences=True),K.layers.Dropout(args.dropout),
                        K.layers.TimeDistributed(K.layers.Dense(len(chars)+1))])
    model.compile(optimizer=optimizer(args.optimizer,args.rate),loss=K.losses.SparseCategoricalCrossentropy(from_logits=True))
    history=model.fit(x,y,sample_weight=w,validation_data=(vx,vy,vw),epochs=args.epochs,batch_size=16,callbacks=callbacks(),verbose=2)
    record('char',model,history,{'characters':chars,'seed':args.seed,'warning':'Sampled characters may not be valid ABC.'})


def generate_char(args):
    chars=json.loads((OUT/'char.json').read_text())['extra']['characters']
    model=K.models.load_model(OUT/'char.keras')
    rng=np.random.default_rng(args.seed)
    ids=[chars.index('X')+1]
    for _ in range(350):
        logits=model(np.array([ids[-100:]]),training=False).numpy()[0,-1]
        logits[0]=-1e9  # Never generate padding.
        ids.append(sample(logits,args.temperature,rng))
    text=''.join(chars[i-1] for i in ids)
    (OUT/'sampled_abc_characters.txt').write_text(text,encoding='utf-8')
    print(text)
    print('Raw sampled characters; inspect ABC syntax before rendering.')


def stateful_demo(args):
    # Batch slot 0 always belongs to the current phrase. No shuffled cross-phrase state.
    inp=K.Input(batch_shape=(1,None),dtype='int32')
    recurrent=K.layers.LSTM(args.hidden,stateful=True,return_sequences=True)
    output=K.layers.TimeDistributed(K.layers.Dense(V))(recurrent(K.layers.Embedding(V+2,24)(inp)))
    model=K.Model(inp,output)
    model.compile(optimizer=optimizer(args.optimizer,args.rate),loss=K.losses.SparseCategoricalCrossentropy(from_logits=True))
    rows,_=split_corpus(load_corpus(args.corpus))
    for epoch in range(args.epochs):
        losses=[]
        for _,row in rows:
            recurrent.reset_states()
            previous=[BOS]+row[:-1]
            for start in range(0,len(row),4):
                # train_on_batch carries state values; the graph is truncated at chunk boundaries.
                model.reset_metrics()
                losses.append(float(model.train_on_batch(np.array([previous[start:start+4]]),np.array([row[start:start+4]]))))
        recurrent.reset_states()
        print(f'Epoch {epoch+1}: chunk training loss {np.mean(losses):.4f}')
    OUT.mkdir(parents=True,exist_ok=True)
    model.save(OUT/'stateful_demo.keras')


def autoencoder(args):
    training,validation=split_corpus(load_corpus(args.corpus))
    def encode(rows):
        _,y,w=sequence_data(rows)
        values=np.eye(V,dtype='float32')[y]*w[...,None]
        return values,y,w
    x,y,w=encode(training);vx,vy,vw=encode(validation)
    inputs=K.Input((16,V))
    xlayer=K.layers.Flatten()(inputs)
    code=K.layers.Dense(16,activation='relu',name='latent_code')(xlayer)
    decoded=K.layers.Reshape((16,V))(K.layers.Dense(16*V)(code))
    model=K.Model(inputs,decoded)
    model.compile(optimizer=optimizer(args.optimizer,args.rate),loss=K.losses.SparseCategoricalCrossentropy(from_logits=True))
    history=model.fit(x,y,sample_weight=w,validation_data=(vx,vy,vw),epochs=args.epochs,batch_size=8,callbacks=callbacks(),verbose=2)
    record('autoencoder',model,history,{'latent_dimensions':16,'padding':'excluded from reconstruction loss'})


def word2vec(args,kind):
    training,validation=split_corpus(load_corpus(args.corpus))
    def pairs(rows):
        x,y=[],[]
        for _,row in rows:
            for i in range(1,len(row)-1):
                neighbors=[row[i-1],row[i+1]]
                if kind=='cbow':
                    x.append(neighbors);y.append(row[i])
                else:
                    for neighbor in neighbors:
                        x.append([row[i]]);y.append(neighbor)
        return np.array(x,dtype='int32'),np.array(y,dtype='int32')
    x,y=pairs(training);vx,vy=pairs(validation)
    inp=K.Input(shape=(2 if kind=='cbow' else 1,),dtype='int32')
    embedding=K.layers.Embedding(V,16,name='bol_embedding')
    hidden=K.layers.GlobalAveragePooling1D()(embedding(inp))
    model=K.Model(inp,K.layers.Dense(V)(hidden))
    model.compile(optimizer=optimizer(args.optimizer,args.rate),loss=K.losses.SparseCategoricalCrossentropy(from_logits=True),metrics=['accuracy'])
    history=model.fit(x,y,validation_data=(vx,vy),epochs=args.epochs,batch_size=16,callbacks=callbacks(),verbose=2)
    record(kind,model,history,{'vocabulary':VOCAB,'objective':'full softmax; only 10 classes'})
    vectors=embedding.get_weights()[0]
    vectors=vectors/np.maximum(np.linalg.norm(vectors,axis=1,keepdims=True),1e-9)
    np.save(OUT/f'{kind}_cosine_similarity.npy',vectors@vectors.T)


def mnist(args):
    (x,y),(tx,ty)=K.datasets.mnist.load_data()
    x=x.astype('float32')/255;tx=tx.astype('float32')/255
    training=(x[:54000],y[:54000]);validation=(x[54000:],y[54000:])
    comparison=[]
    for variant in ['softmax','sigmoid','relu','batchnorm','dropout']:
        K.backend.clear_session();K.utils.set_random_seed(args.seed)
        model=K.Sequential([K.Input((28,28)),K.layers.Flatten()])
        if variant!='softmax':
            activation='sigmoid' if variant=='sigmoid' else 'relu'
            model.add(K.layers.Dense(128,kernel_initializer='glorot_uniform' if activation=='sigmoid' else 'he_normal'))
            if variant=='batchnorm':model.add(K.layers.BatchNormalization())
            model.add(K.layers.Activation(activation))
            if variant=='dropout':model.add(K.layers.Dropout(.3))
        model.add(K.layers.Dense(10,activation='softmax'))
        model.compile(optimizer=optimizer(args.optimizer,args.rate),loss='sparse_categorical_crossentropy',metrics=['accuracy'])
        history=model.fit(*training,validation_data=validation,epochs=args.epochs,batch_size=128,callbacks=callbacks(),verbose=2)
        test_loss,test_accuracy=model.evaluate(tx,ty,verbose=0)
        metrics={'variant':variant,'test_loss':test_loss,'test_accuracy':test_accuracy}
        comparison.append(metrics);record('mnist_'+variant,model,history,metrics)
    (OUT/'mnist_comparison.json').write_text(json.dumps(comparison,indent=2))
    print(json.dumps(comparison,indent=2))


def tune(args):
    trials=[]
    for rate,dropout,hidden in itertools.product([.001,.01],[0.,.2],[32,64]):
        K.backend.clear_session();K.utils.set_random_seed(args.seed)
        args.rate,args.dropout,args.hidden=rate,dropout,hidden
        loss=train_bol(args,'mlp',save=False)
        trials.append({'rate':rate,'dropout':dropout,'hidden':hidden,'validation_loss':loss})
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/'tuning.json').write_text(json.dumps(sorted(trials,key=lambda r:r['validation_loss']),indent=2))
    print('Best validation configuration:',min(trials,key=lambda r:r['validation_loss']))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--task',choices=['lstm','mlp','generate','char','char-generate','stateful-demo','autoencoder','cbow','skipgram','mnist','tune'],default='lstm')
    parser.add_argument('--epochs',type=int,default=30)
    parser.add_argument('--hidden',type=int,default=64)
    parser.add_argument('--optimizer',choices=['sgd','momentum','nag','adagrad','adadelta','rmsprop','adam'],default='adam')
    parser.add_argument('--rate',type=float,default=.001)
    parser.add_argument('--dropout',type=float,default=.2)
    parser.add_argument('--l2',type=float,default=.0001)
    parser.add_argument('--activation',choices=['sigmoid','relu','tanh'],default='relu')
    parser.add_argument('--batchnorm',action='store_true')
    parser.add_argument('--seed',type=int,default=42)
    parser.add_argument('--corpus',default=str(ROOT/'data/corpus.json'))
    parser.add_argument('--model',choices=['lstm','mlp'],default='lstm')
    parser.add_argument('--taal',choices=list(TAALS),default='teentaal')
    parser.add_argument('--cycles',type=int,default=4)
    parser.add_argument('--bpm',type=int,default=100)
    parser.add_argument('--temperature',type=float,default=.8)
    args=parser.parse_args()
    if not (1<=args.epochs<=1000 and 2<=args.hidden<=512 and 0<args.rate<=1 and 0<=args.dropout<1 and 0<=args.l2<=1 and 1<=args.cycles<=8 and 40<=args.bpm<=220 and .1<=args.temperature<=2 and 0<=args.seed<2**31):
        parser.error('Invalid hyperparameter range.')
    K.utils.set_random_seed(args.seed)
    tf.config.experimental.enable_op_determinism()
    print('TensorFlow',tf.__version__,'devices:',tf.config.list_physical_devices())
    if args.task in ['lstm','mlp']:train_bol(args,args.task)
    elif args.task=='generate':generate_bols(args)
    elif args.task=='char':train_char(args)
    elif args.task=='char-generate':generate_char(args)
    elif args.task=='stateful-demo':stateful_demo(args)
    elif args.task=='autoencoder':autoencoder(args)
    elif args.task in ['cbow','skipgram']:word2vec(args,args.task)
    elif args.task=='mnist':mnist(args)
    elif args.task=='tune':tune(args)


if __name__=='__main__':main()
