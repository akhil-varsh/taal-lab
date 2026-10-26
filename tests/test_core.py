import io
import json
import math
from pathlib import Path
import struct
import tempfile
import unittest
import wave

from tabla.data import VOCAB, TAALS, load_corpus, split_corpus
from tabla.network import BolRNN, Optimizer, train, evaluate, save_checkpoint, load_checkpoint, softmax
from tabla.audio import render_wav, render_midi, render_abc, SAMPLE_RATE


class LearningTests(unittest.TestCase):
    def test_bptt_against_finite_differences(self):
        model=BolRNN(hidden=4,seed=7)
        tokens=load_corpus()['dadra'][0]
        _,grads=model.loss_gradients('dadra',tokens)
        epsilon=1e-5
        # Every entry, including recurrent weights, phase inputs and both biases.
        for key,matrix in model.p.items():
            for i,row in enumerate(matrix):
                for j,value in enumerate(row):
                    row[j]=value+epsilon
                    high=model.loss_gradients('dadra',tokens,False)[0]
                    row[j]=value-epsilon
                    low=model.loss_gradients('dadra',tokens,False)[0]
                    row[j]=value
                    numerical=(high-low)/(2*epsilon)
                    self.assertAlmostEqual(grads[key][i][j],numerical,places=7,msg=f'{key}[{i}][{j}]')

    def test_training_improves_held_out_loss_and_roundtrip(self):
        _,validation=split_corpus(load_corpus())
        initial=evaluate(BolRNN(),validation)[0]
        model,report=train(epochs=8)
        self.assertLess(report['best_val_loss'],initial-.5)
        self.assertAlmostEqual(evaluate(model,validation)[0],report['best_val_loss'])
        with tempfile.TemporaryDirectory() as folder:
            file=Path(folder)/'model.json'
            save_checkpoint(model,report,file)
            restored,meta=load_checkpoint(file)
            self.assertEqual(model.generate('teentaal'),restored.generate('teentaal'))
            self.assertEqual(report,meta)

    def test_split_has_no_duplicate_phrase_leakage(self):
        training,validation=split_corpus(load_corpus())
        self.assertEqual((len(training),len(validation)),(27,9))
        self.assertFalse({(t,tuple(r)) for t,r in training}&{(t,tuple(r)) for t,r in validation})

    def test_softmax_is_stable_and_temperature_changes_distribution(self):
        probs=softmax([10000,10001,9999])
        self.assertAlmostEqual(sum(probs),1)
        self.assertGreater(softmax([0,1],.1)[1],softmax([0,1],2)[1])

    def test_gradient_clipping_bounds_sgd_update(self):
        params={'x':[[0.,0.]]}
        opt=Optimizer(params,'sgd',.1)
        norm=opt.update(params,{'x':[[30.,40.]]},1.)
        self.assertEqual(norm,50)
        self.assertAlmostEqual(math.hypot(*params['x'][0]),.1)

    def test_generation_constraints_seed_and_prefix(self):
        model=BolRNN()
        for taal,meta in TAALS.items():
            bols,_=model.generate(taal,cycles=2,seed=9)
            self.assertEqual(len(bols),2*meta['beats'])
            self.assertTrue(set(bols)<=set(VOCAB))
            self.assertEqual(bols[::meta['beats']],['Dha','Dha'])
            self.assertEqual(bols,model.generate(taal,cycles=2,seed=9)[0])
        self.assertEqual(model.generate('dadra',prefix=['Na','Ge'])[0][:2],['Na','Ge'])


class ExportTests(unittest.TestCase):
    def test_wav_is_audible_valid_pcm_and_silent_for_rests(self):
        wav=render_wav(['Dha','Tin'],120,2)
        with wave.open(io.BytesIO(wav)) as audio:
            self.assertEqual(audio.getnchannels(),1)
            self.assertEqual(audio.getsampwidth(),2)
            self.assertEqual(audio.getframerate(),SAMPLE_RATE)
            self.assertAlmostEqual(audio.getnframes()/SAMPLE_RATE,1.65,places=3)
            samples=struct.unpack('<'+'h'*audio.getnframes(),audio.readframes(audio.getnframes()))
            self.assertGreater(max(samples),1000)
            self.assertLessEqual(max(abs(v) for v in samples),30000)
        with wave.open(io.BytesIO(render_wav(['Rest'],100,1))) as audio:
            self.assertFalse(any(audio.readframes(audio.getnframes())))
        self.assertEqual(wav,render_wav(['Dha','Tin'],120,2))

    def test_midi_note_events_tempo_and_total_duration(self):
        data=render_midi(['Dha','Rest','Tin'],120,3)
        self.assertEqual(data[:4],b'MThd')
        self.assertEqual(struct.unpack('>IHHH',data[4:14]),(6,0,1,480))
        self.assertEqual(data[14:18],b'MTrk')
        self.assertEqual(int.from_bytes(data[18:22],'big'),len(data)-22)
        pos,tick,ons,offs,tempo=22,0,[],[],None
        while pos<len(data):
            delta=0
            while True:
                value=data[pos];pos+=1;delta=(delta<<7)|(value&127)
                if not value&128:break
            tick+=delta
            status=data[pos];pos+=1
            if status==255:
                kind,length=data[pos:pos+2];pos+=2
                payload=data[pos:pos+length];pos+=length
                if kind==81:tempo=int.from_bytes(payload,'big')
                if kind==47:break
            else:
                note,velocity=data[pos:pos+2];pos+=2
                (ons if status==0x99 else offs).append((tick,note,velocity))
        self.assertEqual(tempo,500000)
        self.assertEqual(tick,3*480)
        self.assertEqual([t for t,_,_ in ons],[0,0,960])
        self.assertEqual(len(ons),len(offs))

    def test_abc_representation_preserves_rests_and_cycle_meter(self):
        abc=render_abc(['Dha','Rest','Tin','Ta','Na','Ge'],'dadra',90,6,[3,3])
        self.assertIn('M:3/4',abc)
        self.assertIn('Q:1/4=90',abc)
        self.assertIn('[C,G] z B | c d C, |]',abc)


if __name__=='__main__':unittest.main()
