"""Reproducible retrospective monthly association study; never a causal backtest."""
import json, math, warnings
from pathlib import Path
import numpy as np
import pandas as pd
from analysis_stats import hac, fdr_bh
warnings.filterwarnings('ignore', category=RuntimeWarning)
ROOT=Path(__file__).resolve().parent
def read(name): return json.loads((ROOT/'data'/name).read_text(encoding='utf-8-sig'))
def num(x): return round(float(x),6) if x is not None and np.isfinite(x) else None
def corr(x,y):
    if len(x)<8 or np.std(x)<1e-10 or np.std(y)<1e-10:return None
    return num(np.corrcoef(x,y)[0,1])
def fit(df):
    if len(df)<24 or df.x.std()<1e-10 or df.y.std()<1e-10:return {}
    z=(df.x-df.x.mean())/df.x.std(ddof=1)
    result=hac(df.y,z,df.market,maxlags=min(6,len(df)//4),positions=df.index.asi8)
    result['xSD']=num(df.x.std(ddof=1))
    return result
def monthly_stock(rows,key):
    f=pd.DataFrame(rows); f['month']=pd.to_datetime(f.date).dt.to_period('M')
    a=f.sort_values('date').groupby('month').tail(1).set_index('month')
    a.loc[(pd.to_datetime(a.date).dt.days_in_month-pd.to_datetime(a.date).dt.day)>7,key]=np.nan
    return a[key].reindex(INDEX).pct_change(fill_method=None)*100
data=read('observations.json'); prices=read('stock-prices.json'); config=read('analysis-catalog.json')
asof=pd.Timestamp(prices['collectedAt']).tz_convert('Asia/Seoul'); END=asof.to_period('M')-1
INDEX=pd.period_range('2010-01',END,freq='M'); market=monthly_stock(prices['series']['KOSPI']['rows'],'close')
returns={}; alternatives={}; quality={}
for code,name in config['stocks'].items():
    if code not in prices['series']:continue
    returns[code]=monthly_stock(prices['series'][code]['rows'],'adjustedClose')
    alternatives[code]=monthly_stock(prices['series'][code]['rows'],'close')
    check=next((v for v in prices.get('historyChecks',[]) if v['code']==code),{})
    bad={pd.Period(v['date'][:7],freq='M') for v in check.get('mismatches',[])}
    # Do not pick a preferred vendor on unresolved differences. Exclude both affected monthly returns.
    excluded=sorted(bad|{m+1 for m in bad})
    for m in excluded:
        if m in INDEX:returns[code].loc[m]=np.nan;alternatives[code].loc[m]=np.nan
    quality[code]={'checkedMonths':check.get('months',0),'within1pct':check.get('within1pct',0),'excludedMonths':[str(m) for m in excluded],'mismatches':check.get('mismatches',[])}
    if code=='005090': # SGC energy business combination: old glass business is not comparable.
        returns[code].loc[returns[code].index<pd.Period('2020-12','M')]=np.nan
        alternatives[code].loc[alternatives[code].index<pd.Period('2020-12','M')]=np.nan

seasonal={'purchase','gas_sales','tariff','consumption','peak'}; diffs={'kr3y','credit','us10y','reserve'}
predictors={}; indicator_info={}
for c in config['catalog']:
    rows=data['series'].get(c['id'],[]); rows=[r for r in rows if r['source']==(rows[-1]['source'] if rows else '')]
    info={'id':c['id'],'name':c['name'],'unit':c['unit'],'frequency':c['frequency'],'count':len(rows),'mappedStocks':sorted({s for e in c['effects'] for s in e['codes']}),'status':'ready'}
    if c['frequency']=='연간':info.update(status='unavailable',reason='연간 관측값을 월간으로 복제하지 않음 · 월별 주가 시차 추정 불가')
    elif len(rows)<24:info.update(status='unavailable',reason='원자료 미확보 또는 시계열 부족')
    if info['status']=='unavailable':indicator_info[c['id']]=info;continue
    f=pd.DataFrame(rows);f['month']=pd.to_datetime(f.date).dt.to_period('M')
    v=f.groupby('month').value.mean().reindex(INDEX)
    if c['frequency']=='일간':
        counts=f.groupby('month').size().reindex(INDEX).fillna(0)
        v[counts<10]=np.nan
    if c['id']=='temperature':x=v-v.shift(12);label='월평균 기온의 전년동월 차 (°C)'
    elif c['id'] in seasonal:x=(v/v.shift(12)-1)*100;label='전년동월 대비 변화율 (%)'
    elif c['id'] in diffs:x=v.diff();label='월평균 전월차 (%p)'
    else:x=np.log(v.where(v>0)/v.shift(1).where(v.shift(1)>0))*100;label='월평균 가격 전월 로그변화 (%)'
    predictors[c['id']]=x;info.update(transform=label,months=int(x.count()),first=str(x.first_valid_index()),last=str(x.last_valid_index()));indicator_info[c['id']]=info

# Selected operating links: actual monthly tables, not earnings regressions.
channels=[]
for xid,yid in [('brent','smp'),('dubai','smp'),('jkm_futures','smp'),('hh','smp'),('smp','purchase'),('temperature','gas_sales'),('temperature','consumption')]:
    if xid not in predictors or yid not in predictors:continue
    for lag in range(0,13):
        f=pd.DataFrame({'x':predictors[xid].shift(lag),'y':predictors[yid]}).loc[INDEX[-120:]].dropna()
        channels.append({'indicator':xid,'target':yid,'lag':lag,'n':len(f),'r':corr(f.x,f.y),'note':'지표→운영지표 변화의 탐색적 상관 · 영업이익 검증 아님'})

results=[]; lags=list(range(-6,13))
for years in [10,5,3,1]:
    start=END-(years*12-1); window=INDEX[(INDEX>=start)&(INDEX<=END)]
    for iid,x in predictors.items():
        for code,y in returns.items():
            for lag in lags:
                f=pd.DataFrame({'x':x.shift(lag),'y':y,'market':market,'alt':alternatives[code]},index=INDEX).loc[window]
                # Both the indicator month and response month must lie in the chosen window.
                anchor=f.index-lag;f=f[(anchor>=start)&(anchor<=END)].dropna(subset=['x','y','market'])
                r=corr(f.x,f.y);result={'indicator':iid,'stock':code,'years':years,'lag':lag,'n':len(f),'r':r,'spearman':corr(f.x.rank(),f.y.rank()) if r is not None else None,'from':str(f.index.min()) if len(f) else None,'to':str(f.index.max()) if len(f) else None,**fit(f)}
                if result.get('beta') is not None:
                    halves=[fit(f.iloc[:len(f)//2]),fit(f.iloc[len(f)//2:])]
                    result['halfBetas']=[h.get('beta') for h in halves]
                    result['sameSignHalves']=all(h.get('beta') is not None and np.sign(h['beta'])==np.sign(result['beta']) for h in halves)
                    a=f.dropna(subset=['alt']).copy();a['y']=a.alt;alt=fit(a);result['priceOnlyBeta']=alt.get('beta')
                    result['sameSignPriceOnly']=alt.get('beta') is not None and np.sign(alt['beta'])==np.sign(result['beta'])
                results.append(result)

# Control the false-discovery rate over the whole displayed search, not only winning lags.
valid=[r for r in results if r.get('p') is not None]
if valid:
    q=fdr_bh([max(r['p'],1e-300) for r in valid])
    for r,v in zip(valid,q):r['q']=float(v)

hypothesis_count=len(valid)
summary=[]
for years in [10,5,3,1]:
    for iid,info in indicator_info.items():
        for code in config['stocks']:
            subset=[r for r in results if r['years']==years and r['indicator']==iid and r['stock']==code]
            valid=[r for r in subset if r.get('partialR') is not None and r['n']>=24]
            best=max(valid,key=lambda r:abs(r['partialR'])) if valid else None
            zero=next((r for r in subset if r['lag']==0),None)
            item={'indicator':iid,'stock':code,'years':years,'mapped':code in info['mappedStocks'],'best':best,'contemporaneous':zero,'status':'검증 불가','reason':info.get('reason','24개월 이상 유효 표본 부족')}
            if best:
                robust=best.get('q',1)<.05 and best['n']>=48 and best.get('sameSignHalves') and best.get('sameSignPriceOnly')
                item.update(status='재검토할 연관성' if robust else '안정적 시차 미확인',reason='다중검정 q<0.05·전후반 부호·가격수익률 부호 일치' if robust else '최대 상관 시차는 탐색값이며 예측 시차로 확정할 수 없음')
            summary.append(item)

panel={'months':[str(m) for m in INDEX], 'macro':{k:[num(v) for v in s] for k,s in predictors.items()},'stock':{k:[num(v) for v in s] for k,s in returns.items()},'priceOnly':{k:[num(v) for v in s] for k,s in alternatives.items()},'market':[num(v) for v in market]}
out={'generatedAt':pd.Timestamp.now(tz='UTC').isoformat(),'asOfMonth':str(END),'stockCount':len(returns),'indicatorCount':len(indicator_info),'estimableIndicators':len(predictors),'hypothesisCount':hypothesis_count,'indicators':indicator_info,'stocks':config['stocks'],'quality':quality,'results':results,'summary':summary,'channels':channels,'panel':panel,'priceSource':prices['source'],'stockSources':{k:v['url'] for k,v in prices['series'].items()},'method':{'lags':lags,'positiveLag':'지표가 주가 수익률보다 먼저 움직임: +3 = 지표 월 이후 3개월째의 1개월 수익률','negativeLag':'주가가 지표보다 먼저 움직인 관측 관계','returns':'월말 배당·분할 수정종가 수익률. KOSPI 가격지수 수익률을 회귀 통제; 총수익지수와 완전히 일치하는 비교는 아님. 배당 미반영 가격수익률도 부호 비교.','model':'r_stock(t) = α + β·표준화된 지표변화(t−lag) + γ·KOSPI(t) + ε. β는 지표변화 1표준편차당 월수익률 %p. HAC 최대 6개월 표준오차.','limits':['역사적 관측월 기준 분석. 원자료 발표일·수정 이력이 없어 당시 매매 가능성을 검증한 백테스트가 아님.','월중 발표에 대한 당일·익일 반응이나 인과효과를 추정하지 않음.','최대 |부분상관| 시차는 사후 선택. 전체 비교에 Benjamini–Hochberg 보정 q 적용.','같은 지표라도 기간·정책·사업구조에 따라 관계가 달라짐. 전후반 부호 일치는 독립 표본 외 검증이 아님.','SGC에너지는 사업구조 변경을 고려해 2020년 12월 이후 수익률만 사용.','서울가스·삼천리의 2023년 급변 등 비매크로 사건을 포함. Spearman 비교 및 원자료로 이상치 영향 확인.','Yahoo/Naver 월말 종가 차이 1% 이상인 월과 다음 월 수익률 제외. 이번 달 자료는 미사용.','1년 구간은 표본이 적어 상관계수 참고만 제공하고 유의확률·최적 시차 결론을 산출하지 않음.','연간 자료·단일 관측값·미수집 지표는 월별 시차 검증 불가로 명시.']}}
(ROOT/'data'/'relationship-analysis.tmp').write_text(json.dumps(out,ensure_ascii=False,allow_nan=False,default=lambda v:v.item() if isinstance(v,np.generic) else str(v)),encoding='utf-8')
pd.DataFrame(results).to_csv(ROOT/'data'/'relationship-tests.tmp',index=False,encoding='utf-8-sig')
(ROOT/'data'/'relationship-tests.tmp').replace(ROOT/'data'/'relationship-tests.csv')
(ROOT/'data'/'relationship-analysis.tmp').replace(ROOT/'data'/'relationship-analysis.json')
print(json.dumps({'stocks':len(returns),'indicators':len(indicator_info),'estimable':len(predictors),'tests':hypothesis_count,'rows':len(results),'pairs':len(summary),'potential':[{'indicator':r['indicator'],'stock':r['stock'],'years':r['years'],'lag':r['best']['lag'],'r':r['best']['partialR'],'q':r['best'].get('q')} for r in summary if r['status']=='재검토할 연관성']},ensure_ascii=False))
