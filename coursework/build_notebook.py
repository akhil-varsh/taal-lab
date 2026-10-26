"""Rebuild the checked-in Colab notebook with standard library JSON."""
import json
from pathlib import Path


def markdown(text):
    return {'cell_type':'markdown','metadata':{},'source':text.splitlines(keepends=True)}


def code(text):
    return {'cell_type':'code','metadata':{},'execution_count':None,'outputs':[],'source':text.splitlines(keepends=True)}


cells=[
    markdown('# Taal Lab — Deep Learning Coursework\nRun the cells in order. Upload `taal-lab-project.zip` from this project. These experiments use a small teaching corpus, not professional performance data. GPU is optional. The notebook trains Keras models independently of the dependency-free studio.'),
    code('from google.colab import files\nfrom pathlib import Path\nimport zipfile\n\nuploaded = files.upload()\narchive = next(name for name in uploaded if name.endswith(".zip"))\ntarget = Path("/content/taal-lab").resolve()\ntarget.mkdir(exist_ok=True)\nwith zipfile.ZipFile(archive) as bundle:\n    for member in bundle.infolist():\n        destination = (target / member.filename).resolve()\n        if not destination.is_relative_to(target):\n            raise ValueError("Unsafe archive path")\n    bundle.extractall(target)\n%cd /content/taal-lab'),
    code('%pip install -q -r requirements-keras.txt\nimport tensorflow as tf\nprint("TensorFlow:", tf.__version__)\nprint("Devices:", tf.config.list_physical_devices())'),
    markdown('## Unit I: inspect and check backpropagation\nThe explicit Python RNN exposes every local derivative. Tests compare analytical gradients to central finite differences.'),
    code('!python -m unittest discover -s tests -p "test_core.py" -v'),
    markdown('## Units II–III: initialization, regularization, optimizers and deep MLP\nCompare runs using the same data split. Record validation loss and runtime. Each command writes a model and JSON metrics in `artifacts/experiments/`.'),
    code('!python -m coursework.keras_experiments --task mlp --activation relu --batchnorm --dropout 0.2 --optimizer adam --epochs 30\n!python -m coursework.optimizer_landscape\nfrom IPython.display import Image, display\ndisplay(Image("artifacts/experiments/optimizer_landscape.png"))'),
    code('!python -m coursework.keras_experiments --task autoencoder --epochs 20\n!python -m coursework.keras_experiments --task cbow --epochs 20\n!python -m coursework.keras_experiments --task skipgram --epochs 20'),
    markdown('## Unit IV: five MNIST baselines and hyperparameter tuning\nThe MNIST run downloads the dataset, trains softmax/sigmoid/ReLU/batchnorm/dropout variants and records test accuracy. Tuning uses validation data only. These cells take longer.'),
    code('!python -m coursework.keras_experiments --task mnist --epochs 5\n!python -m coursework.keras_experiments --task tune --epochs 15'),
    markdown('## Unit V: conditional many-to-many LSTM and tabla generation'),
    code('!python -m coursework.keras_experiments --task lstm --epochs 35\n!python -m coursework.keras_experiments --task generate --model lstm --taal teentaal --cycles 2 --temperature 0.8\nfrom IPython.display import Audio, display\ndisplay(Audio("artifacts/experiments/generated.wav"))'),
    markdown('## Character RNN with ABC notation\nTrain on complete-phrase splits before making overlapping windows. Sampled text may contain invalid ABC syntax; inspect it rather than claiming it is valid music.'),
    code('!python -m coursework.keras_experiments --task char --epochs 20\n!python -m coursework.keras_experiments --task char-generate\n!python -m coursework.keras_experiments --task stateful-demo --epochs 3'),
    markdown('## Save your results\nDownload checkpoints, curves and audio for your report. Do not invent metrics for experiments you did not run.'),
    code('import shutil\nshutil.make_archive("taal-lab-results", "zip", "artifacts/experiments")\nfiles.download("taal-lab-results.zip")')
]
notebook={'nbformat':4,'nbformat_minor':5,'metadata':{'kernelspec':{'display_name':'Python 3','language':'python','name':'python3'},'language_info':{'name':'python'}},'cells':cells}
for index,cell in enumerate(cells):cell['id']=f'taal-lab-{index:02d}'
Path(__file__).with_name('colab.ipynb').write_text(json.dumps(notebook,indent=2),encoding='utf-8')
