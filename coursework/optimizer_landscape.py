"""Save 3D hill-descent and contour figures using the seven Keras optimizers."""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import tensorflow as tf
from .keras_experiments import optimizer, OUT


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    paths={}
    for name in ['sgd','momentum','nag','adagrad','adadelta','rmsprop','adam']:
        xy=tf.Variable([3.,2.])
        # Educational comparison: same rate. Each method needs its own tuning in practice.
        opt=optimizer(name,.08)
        path=[xy.numpy().copy()]
        for _ in range(100):
            with tf.GradientTape() as tape:
                loss=xy[0]**2+4*xy[1]**2
            opt.apply_gradients([(tape.gradient(loss,xy),xy)])
            path.append(xy.numpy().copy())
        paths[name]=np.array(path)
    x,y=np.meshgrid(np.linspace(-4,4,100),np.linspace(-3,3,100));z=x*x+4*y*y
    fig=plt.figure(figsize=(14,6),layout='constrained')
    ax=fig.add_subplot(121,projection='3d');ax.plot_surface(x,y,z,alpha=.25,cmap='YlOrBr',linewidth=0)
    contour=fig.add_subplot(122);contour.contour(x,y,z,levels=16,cmap='Greys',alpha=.3)
    for name,path in paths.items():
        px,py=path[:,0],path[:,1]
        ax.plot(px,py,px*px+4*py*py,label=name)
        contour.plot(px,py,label=name)
    ax.set(xlabel='x',ylabel='y',zlabel='loss',title='Hill descent in 3D')
    contour.set(xlabel='x',ylabel='y',title='Contours and parameter trajectories');contour.legend()
    fig.suptitle('f(x,y) = x² + 4y² · global norm clipping = 1 · common learning rate = 0.08')
    fig.savefig(OUT/'optimizer_landscape.png',dpi=180)
    fig.savefig(OUT/'optimizer_landscape.pdf')
    print(OUT/'optimizer_landscape.png')


if __name__=='__main__':main()
