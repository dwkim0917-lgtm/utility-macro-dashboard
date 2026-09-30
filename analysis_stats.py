"""Small NumPy OLS/HAC implementation; two-sided t probabilities via incomplete beta."""
import math
from functools import lru_cache
import numpy as np
def beta_fraction(a,b,x):
    qab=a+b;qap=a+1;qam=a-1;c=1.;d=1.-qab*x/qap;d=1./max(abs(d),1e-300)*(1 if d>=0 else -1);h=d
    for m in range(1,301):
        m2=2*m;aa=m*(b-m)*x/((qam+m2)*(a+m2));d=1.+aa*d;d=d if abs(d)>1e-300 else 1e-300;c=1.+aa/c;c=c if abs(c)>1e-300 else 1e-300;d=1./d;h*=d*c
        aa=-(a+m)*(qab+m)*x/((a+m2)*(qap+m2));d=1.+aa*d;d=d if abs(d)>1e-300 else 1e-300;c=1.+aa/c;c=c if abs(c)>1e-300 else 1e-300;d=1./d;delta=d*c;h*=delta
        if abs(delta-1.)<3e-14:break
    return h
def beta_regularized(x,a,b):
    if x<=0:return 0.
    if x>=1:return 1.
    bt=math.exp(math.lgamma(a+b)-math.lgamma(a)-math.lgamma(b)+a*math.log(x)+b*math.log1p(-x))
    return bt*beta_fraction(a,b,x)/a if x<(a+1)/(a+b+2) else 1-bt*beta_fraction(b,a,1-x)/b
def t_pvalue(t,df):return min(1.,max(0.,beta_regularized(df/(df+t*t),df/2,.5)))
@lru_cache(maxsize=256)
def t_critical(df):
    lo=0.;hi=20.
    for _ in range(55):
        mid=(lo+hi)/2
        if t_pvalue(mid,df)>.05:lo=mid
        else:hi=mid
    return (lo+hi)/2
def hac(y,x,market,maxlags=6,positions=None):
    y=np.asarray(y,float);x=np.asarray(x,float);market=np.asarray(market,float);n=len(y)
    X=np.column_stack([np.ones(n),x,market]);bread=np.linalg.pinv(X.T@X);b=bread@X.T@y;u=y-X@b;xu=X*u[:,None];meat=xu.T@xu
    positions=np.arange(n) if positions is None else np.asarray(positions)
    for lag in range(1,min(maxlags,n-1)+1):
        lookup={int(v):j for j,v in enumerate(positions)}
        pairs=[(j,lookup[int(v-lag)]) for j,v in enumerate(positions) if int(v-lag) in lookup]
        if not pairs:continue
        later,earlier=zip(*pairs);gamma=xu[list(later)].T@xu[list(earlier)];meat+=(1-lag/(maxlags+1))*(gamma+gamma.T)
    cov=bread@meat@bread*n/(n-X.shape[1]);se=np.sqrt(max(0.,cov[1,1]));df=n-X.shape[1];p=t_pvalue(b[1]/se,df) if se>1e-15 else 1.
    M=np.column_stack([np.ones(n),market]);xr=x-M@np.linalg.lstsq(M,x,rcond=None)[0];yr=y-M@np.linalg.lstsq(M,y,rcond=None)[0]
    r=float(np.corrcoef(xr,yr)[0,1]) if np.std(xr)>1e-10 and np.std(yr)>1e-10 else None
    return dict(beta=float(b[1]),p=p,ciLow=float(b[1]-t_critical(df)*se),ciHigh=float(b[1]+t_critical(df)*se),partialR=r,r2=float(1-(u@u)/np.sum((y-y.mean())**2)))
def fdr_bh(p):
    p=np.asarray(p,float);order=np.argsort(p);q=p[order]*len(p)/np.arange(1,len(p)+1);q=np.minimum.accumulate(q[::-1])[::-1];out=np.empty(len(p));out[order]=np.clip(q,0,1);return out
