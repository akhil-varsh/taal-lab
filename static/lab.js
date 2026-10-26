'use strict';
const units={
  1:{title:'From a single neuron to a sequence of bols',intro:'A neuron learns weighted evidence. An MLP composes many neurons; our RNN adds a memory of earlier bols. The same chain rule carries gradients through both.',formula:'x → z = Wx + b → activation → prediction → loss → gradients',rows:[
    ['Logistic regression & perceptron','Logistic: σ(w·x+b) gives a probability, trained by cross-entropy. Perceptron: a threshold gives a class, with updates on errors. Both have a linear decision boundary.'],
    ['MLP notation & chain rule','a⁽ˡ⁾ = φ(W⁽ˡ⁾a⁽ˡ⁻¹⁾ + b⁽ˡ⁾). Backpropagation multiplies local derivatives from the loss to each parameter. Run the decision surface experiment below.'],
    ['Single-neuron training & memorization','The XOR experiment fits a logistic model and an MLP. A hidden layer can memorize four nonlinear examples; that does not establish generalization.'],
    ['Activations & vanishing gradients','Compare sigmoid, tanh and ReLU below. Repeated small Jacobians can erase gradients; large ones can explode. RNN training clips global gradient norm.'],
    ['Bias–variance & decision surfaces','Compare the training and validation curves in Model Lab. The retained checkpoint minimizes validation loss; the decision surface shows the effect of nonlinear capacity.']
  ]},
  2:{title:'Making deeper networks trainable',intro:'From the renewed use of backpropagation in the 1980s to deeper networks in the 2010s, data, compute and better training methods made larger models practical.',formula:'input → Dense + ReLU → BatchNorm → Dropout → Dense → softmax',rows:[
    ['Dropout & regularization','Keras MLP and LSTM experiments expose dropout and L2 weight penalties. Dropout masks activations during training and is disabled at inference.'],
    ['ReLU & weight initialization','Keras ReLU MLP layers use He initialization; sigmoid uses Glorot. The small tanh RNN uses Xavier/Glorot uniform initialization.'],
    ['Batch normalization','The MLP experiment optionally normalizes intermediate activations. Training uses batch statistics; inference uses moving estimates.'],
    ['SGD, batch SGD & momentum','The Python RNN updates on a whole phrase. The Keras models train in batches. Momentum accumulates gradients to smooth oscillation.'],
    ['Nesterov accelerated gradient','The Keras --optimizer nag option uses SGD with momentum and Nesterov correction. Compare it to momentum using the same seed and split.'],
    ['Hill descent in 2D / 3D / contours','The live contour experiment shows paths in parameter space. coursework/optimizer_landscape.py saves a 3D loss surface and contour paths for all seven optimizers.']
  ]},
  3:{title:'Optimizers, representations and useful checks',intro:'An optimizer determines how gradients become updates. Representation determines what structure the model can learn. Measure both instead of assuming one method always wins.',formula:'logits → stable softmax → cross-entropy → BPTT → norm clipping → optimizer',rows:[
    ['Adagrad, Adadelta, RMSprop & Adam','All are selectable in the Keras experiments. Adagrad accumulates squared gradients; RMSprop discounts old values; Adadelta also tracks updates; Adam combines first and second moments.'],
    ['Which optimizer to choose','Start with Adam as a practical baseline. Compare validation loss, runtime and stability with identical splits. SGD with momentum may require more learning-rate tuning.'],
    ['Gradient checking & clipping','tests/test_core.py compares analytical BPTT with central finite differences across all parameter groups. Clipping limits global norm before updates; it does not fix vanishing gradients.'],
    ['Softmax, cross-entropy & deep MLP','Ten bol classes use a normalized probability distribution and negative log likelihood. The Keras MLP uses a fixed context of previous bols with taal and beat-phase features.'],
    ['Autoencoders','The autoencoder experiment compresses padded, one-hot bol cycles into a 16-value latent code and reconstructs them. Padding positions are excluded from the loss.'],
    ['Word2Vec: CBOW & Skip-gram','CBOW predicts a center bol from surrounding bols. Skip-gram predicts neighbors from a center bol. The runnable experiments use full softmax for ten tokens; the report explains negative sampling and hierarchical softmax for large vocabularies.']
  ]},
  4:{title:'TensorFlow, Keras and reproducible experiments',intro:'Use the included notebook in Google Colab or a Python environment compatible with TensorFlow. The studio remains usable without downloading a deep learning framework.',formula:'prepare data → build model → compile → fit → validate → save → generate',rows:[
    ['TensorFlow & Keras overview','TensorFlow provides numerical execution and automatic differentiation; Keras provides layers, model composition, optimizers and training APIs.'],
    ['CPU, GPU & Colaboratory','Tiny datasets often run efficiently on CPU. Larger batched LSTM workloads can benefit from a GPU. The notebook prints TensorFlow version and visible devices; a GPU is optional.'],
    ['Installation & online documentation','See requirements-keras.txt and coursework/colab.ipynb. Official links and a setup guide are in README.md. No API keys or external AI service are needed.'],
    ['MNIST softmax classifier & initialization','Run the MNIST task to compare a single softmax layer with four MLP variants. He/Glorot initialization follows the chosen activation. MNIST downloads on first use.'],
    ['Models 1–4','The MNIST experiment compares sigmoid, ReLU, ReLU + batch normalization, and ReLU + dropout, using a fixed training/validation split and final test evaluation.'],
    ['Hyperparameter tuning','--task tune compares learning rate, dropout and hidden width on validation loss and records all trials. The best trial is a validation choice, not an unbiased test score.']
  ]},
  5:{title:'A music generation case study',intro:'The musical unit is a bol, the symbolic name of a stroke. Modeling tokens keeps complete bols intact; a separate character-RNN experiment demonstrates the ABC-notation approach from your syllabus.',formula:'bol / ABC corpus → tokens / characters → embedding → LSTM → TimeDistributed(Dense) → sample',rows:[
    ['Real-world problem & representation','Generate new symbolic rhythmic phrases conditioned on a taal. The demo uses one bol per matra; timing, dynamics, subdivisions and recorded timbre need a richer dataset.'],
    ['Char-RNN & ABC data preparation','--task char trains on project-authored ABC strings, holding out complete phrases before overlapping windows. --task char-generate samples characters; syntactic validity is not guaranteed.'],
    ['Many-to-many RNN & TimeDistributed Dense','The Keras LSTM returns one hidden vector per position. TimeDistributed(Dense) produces a next-token distribution at each position; sparse cross-entropy trains against shifted targets.'],
    ['Stateful recurrence','The studio carries hidden state across generated cycles. The Keras stateful-demo processes ordered chunks with batch size 1, resetting state at each phrase and epoch boundary. Main LSTM training uses independent sequences.'],
    ['Training & music generation','Teacher forcing uses the true previous token during training. Autoregressive sampling uses the model’s own previous prediction. Temperature reshapes probabilities; a fixed random seed makes the result reproducible.'],
    ['Tabla, MIDI & survey','Listen to synthesized tabla-like strokes and export WAV, MIDI, ABC or JSON. The project report compares Markov, MLP, RNN/LSTM and Transformer approaches, with limitations and sources.']
  ]}
};
function renderUnit(index){const unit=units[index];document.getElementById('unit-content').innerHTML=`<h2>${unit.title}</h2><p>${unit.intro}</p><div class="formula">${unit.formula}</div><table class="unit-table"><thead><tr><th>Core idea</th><th>How Taal Lab uses it</th></tr></thead><tbody>${unit.rows.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</tbody></table>`;document.querySelectorAll('[data-unit]').forEach(b=>{b.classList.toggle('active',b.dataset.unit==index);b.setAttribute('aria-selected',b.dataset.unit==index);});}
document.querySelectorAll('[data-unit]').forEach(button=>button.onclick=()=>renderUnit(button.dataset.unit));renderUnit(1);
function drawActivation(){
  const canvas=document.getElementById('activation-chart'),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,type=document.getElementById('activation').value;
  const phi=x=>type==='sigmoid'?1/(1+Math.exp(-x)):type==='tanh'?Math.tanh(x):Math.max(0,x);
  const derivative=x=>type==='sigmoid'?phi(x)*(1-phi(x)):type==='tanh'?1-phi(x)**2:x>0?1:0;
  const X=x=>40+(x+5)/10*(w-60),Y=y=>h-40-(y+1)/5*(h-60);
  ctx.clearRect(0,0,w,h);ctx.strokeStyle='#e4e8dc';ctx.lineWidth=1;
  for(let x=-4;x<=4;x+=2){ctx.beginPath();ctx.moveTo(X(x),20);ctx.lineTo(X(x),h-30);ctx.stroke();ctx.fillStyle='#9ba78e';ctx.font='11px Segoe UI';ctx.fillText(x,X(x)-3,h-12);}
  ctx.beginPath();ctx.moveTo(30,Y(0));ctx.lineTo(w-15,Y(0));ctx.stroke();
  for(const [fn,color] of [[phi,'#b65e3d'],[derivative,'#648269']]){ctx.strokeStyle=color;ctx.lineWidth=2.5;ctx.beginPath();for(let i=0;i<=200;i++){const x=-5+i/20,y=Y(Math.min(4,fn(x)));i?ctx.lineTo(X(x),y):ctx.moveTo(X(x),y);}ctx.stroke();}
  ctx.fillStyle='#b65e3d';ctx.fillText('activation',40,14);ctx.fillStyle='#648269';ctx.fillText('derivative',130,14);
  const depth=+document.getElementById('depth').value;document.getElementById('depth-value').textContent=`${depth} layers`;
  const factor=derivative(1),product=factor**depth;
  document.getElementById('gradient-explanation').textContent=`At z = 1, φ′(z) = ${factor.toFixed(3)}. Across ${depth} identical layers with unit weights, the derivative product is ${product.toExponential(2)}. This illustration isolates activation derivatives; actual gradients also depend on weight matrices.`;
}
document.getElementById('activation').onchange=drawActivation;document.getElementById('depth').oninput=drawActivation;
let descentFrame=0;
function descentPaths(){return ['sgd','momentum','adam'].map(name=>{let x=3,y=2,m=[0,0],v=[0,0],points=[[x,y]];for(let t=1;t<=65;t++){let g=[2*x,8*y],delta=g.slice();if(name==='momentum'){m=m.map((q,i)=>.8*q+.08*g[i]);delta=m.map(q=>q/.08);}if(name==='adam'){m=m.map((q,i)=>.9*q+.1*g[i]);v=v.map((q,i)=>.999*q+.001*g[i]**2);delta=m.map((q,i)=>(q/(1-.9**t))/(Math.sqrt(v[i]/(1-.999**t))+1e-8));}x-=.08*delta[0];y-=.08*delta[1];points.push([x,y]);}return points;});}
const paths=descentPaths();
function drawDescent(limit=66){const canvas=document.getElementById('optimizer-chart'),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,X=x=>w/2+x*w/9,Y=y=>h/2-y*h/6;ctx.clearRect(0,0,w,h);ctx.lineWidth=1;
  for(let r=.5;r<5;r+=.5){ctx.strokeStyle='#e2e6d7';ctx.beginPath();ctx.ellipse(X(0),Y(0),r*w/9,r/2*h/6,0,0,Math.PI*2);ctx.stroke();}
  ['#b65e3d','#648269','#576da2'].forEach((color,index)=>{ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();paths[index].slice(0,limit).forEach(([x,y],i)=>i?ctx.lineTo(X(x),Y(y)):ctx.moveTo(X(x),Y(y)));ctx.stroke();const [x,y]=paths[index][Math.min(limit-1,65)];ctx.fillStyle=color;ctx.beginPath();ctx.arc(X(x),Y(y),4,0,Math.PI*2);ctx.fill();});ctx.fillStyle='#8a947e';ctx.font='11px Segoe UI';ctx.fillText('minimum',X(0)+7,Y(0)+15);ctx.fillText('x',w-15,h/2);ctx.fillText('y',w/2,15);
}
document.getElementById('run-descent').onclick=()=>{cancelAnimationFrame(descentFrame);let n=1,last=0;function loop(time){if(time-last>35){drawDescent(n++);last=time;}if(n<=66)descentFrame=requestAnimationFrame(loop);}descentFrame=requestAnimationFrame(loop);};
function xorPlayground(train=false){
  let state=23;const random=()=>{state=(1664525*state+1013904223)>>>0;return state/4294967296-.5;};
  const data=[[-1,-1,0],[-1,1,1],[1,-1,1],[1,1,0]],sigmoid=z=>1/(1+Math.exp(-z));
  let linear=[0,0,0],W=Array.from({length:8},()=>[random(),random(),random()]),V=Array.from({length:9},random);
  const forward=(x,y)=>{const h=W.map(r=>Math.tanh(r[0]*x+r[1]*y+r[2]));return [h,sigmoid(V[8]+h.reduce((s,v,i)=>s+v*V[i],0))];};
  if(train)for(let step=0;step<1500;step++){
    const dl=[0,0,0],dw=W.map(()=>[0,0,0]),dv=V.map(()=>0);
    for(const [x,y,target]of data){const error=sigmoid(linear[0]*x+linear[1]*y+linear[2])-target;dl[0]+=error*x;dl[1]+=error*y;dl[2]+=error;const[h,p]=forward(x,y),dy=p-target;dv[8]+=dy;h.forEach((z,i)=>{dv[i]+=dy*z;const dz=dy*V[i]*(1-z*z);dw[i][0]+=dz*x;dw[i][1]+=dz*y;dw[i][2]+=dz;});}
    linear=linear.map((v,i)=>v-.15*dl[i]/4);V=V.map((v,i)=>v-.15*dv[i]/4);W=W.map((r,i)=>r.map((v,j)=>v-.15*dw[i][j]/4));
  }
  const preds=[(x,y)=>sigmoid(linear[0]*x+linear[1]*y+linear[2]),(x,y)=>forward(x,y)[1]];
  ['linear-surface','mlp-surface'].forEach((id,index)=>{const c=document.getElementById(id),ctx=c.getContext('2d');for(let i=0;i<60;i++)for(let j=0;j<60;j++){const p=preds[index]((i/60-.5)*3,(.5-j/60)*3);ctx.fillStyle=`rgb(${Math.round(238-92*p)},${Math.round(213-35*p)},${Math.round(192-42*p)})`;ctx.fillRect(i*4,j*4,4,4);}for(const[x,y,label]of data){ctx.beginPath();ctx.arc((x/3+.5)*240,(.5-y/3)*240,7,0,2*Math.PI);ctx.fillStyle=label?'#536c50':'#b65e3d';ctx.fill();ctx.strokeStyle='white';ctx.lineWidth=2;ctx.stroke();}});
  if(train){const losses=preds.map(f=>-data.reduce((s,[x,y,t])=>{const p=f(x,y);return s+t*Math.log(p)+(1-t)*Math.log(1-p);},0)/4);document.getElementById('xor-results').textContent=`After 1,500 steps: logistic cross-entropy ${losses[0].toFixed(3)}; MLP ${losses[1].toFixed(3)}. These are training results on four points, not test performance.`;}
}
document.getElementById('train-xor').onclick=()=>xorPlayground(true);xorPlayground();drawActivation();drawDescent();
