import json
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from http.server import ThreadingHTTPServer

import app
from tabla.network import BolRNN


class APITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.STATE['model']=BolRNN()
        cls.server=ThreadingHTTPServer(('127.0.0.1',0),app.Handler)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True)
        cls.thread.start()
        cls.base=f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join()

    def call(self,path,body=None,headers=None):
        request=Request(self.base+path,data=None if body is None else json.dumps(body).encode(),headers=headers or {})
        try:
            response=urlopen(request,timeout=20)
        except HTTPError as error:
            response=error
        with response:
            return response.status,response.headers,response.read()

    def test_static_app_and_model_status(self):
        code,headers,body=self.call('/')
        self.assertEqual(code,200)
        self.assertIn(b'Taal Lab',body)
        self.assertIn('text/html',headers['Content-Type'])
        self.assertTrue(json.loads(self.call('/api/status')[2])['ready'])
        self.assertEqual(self.call('/../../app.py')[0],404)

    def test_generate_and_all_exports(self):
        code,_,body=self.call('/api/generate',{'taal':'dadra','cycles':1,'bpm':120})
        self.assertEqual(code,200)
        generated=json.loads(body)
        self.assertEqual(len(generated['tokens']),6)
        for fmt,signature in [('wav',b'RIFF'),('midi',b'MThd'),('abc',b'X:1'),('json',b'{')]:
            code,headers,content=self.call(f"/api/export?id={generated['id']}&format={fmt}")
            self.assertEqual(code,200)
            self.assertTrue(content.startswith(signature))
            self.assertIn('attachment',headers['Content-Disposition'])
        self.assertEqual(self.call('/api/export?id=missing')[0],404)

    def test_validation_rejects_invalid_requests(self):
        for body in [{'taal':'bad'},{'taal':[]},{'cycles':1.5},{'cycles':100},{'bpm':True},
                     {'temperature':float('nan')},{'seed':-1},{'prefix':'Dha INVALID'},
                     {'engine':'fake'},{'anchor':'false'},[],{'bpm':'100'}]:
            with self.subTest(body=body):
                self.assertEqual(self.call('/api/generate',body)[0],400)
        self.assertEqual(self.call('/api/generate',{}, {'Origin':'https://example.com'})[0],403)
        self.assertEqual(self.call('/api/status',headers={'Host':'attacker.example'})[0],403)

    def test_training_busy_and_bad_config(self):
        self.assertEqual(self.call('/api/train',{'epochs':0})[0],400)
        self.assertEqual(self.call('/api/train',{'optimizer':'imaginary'})[0],400)
        app.STATE['training']=True
        try:self.assertEqual(self.call('/api/train',{})[0],409)
        finally:app.STATE['training']=False


if __name__=='__main__':unittest.main()
