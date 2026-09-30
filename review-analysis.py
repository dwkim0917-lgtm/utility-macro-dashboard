import json,csv
from pathlib import Path
root=Path(__file__).resolve().parent
a=json.loads((root/'data/relationship-analysis.json').read_text(encoding='utf-8'))
e=json.loads((root/'data/impact-evidence.json').read_text(encoding='utf-8'))
assert len(a['summary'])==len(a['indicators'])*len(a['stocks'])*4
assert a['hypothesisCount']==sum(r.get('p') is not None for r in a['results'])
assert all(r.get('p') is None for r in a['results'] if r['years']==1)
assert all(r['q']>=r['p']-1e-12 and r['q']<=1 for r in a['results'] if 'q' in r)
assert all(r['ciLow']<=r['beta']<=r['ciHigh'] for r in a['results'] if 'beta' in r)
assert all(len(p['sourceIds'])>=2 for p in e['byPair'].values())
def f(v):return '—' if v is None else str(round(v,3)) if isinstance(v,float) else str(v)
def table(head,rows):return '\n|'+ '|'.join(head)+'|\n|'+ '|'.join(['---']*len(head))+'|\n'+'\n'.join('|'+ '|'.join(f(v).replace('|','/') for v in row)+'|' for row in rows)+'\n'
lines=['# 유틸리티 실적·주가 연관성 비교',f"기준 월 {a['asOfMonth']} · 분석 생성 {a['generatedAt']}",'[대시보드 비교 화면](http://127.0.0.1:8765/analysis) · [전체 시차 계산 CSV](http://127.0.0.1:8765/api/analysis/export)',f"{len(a['indicators'])}개 지표 × {len(a['stocks'])}개 종목의 {len(a['indicators'])*len(a['stocks'])}개 조합을 4개 기간으로 비교했다. {a['estimableIndicators']}개 지표에 월별 시차 계산이 가능하며, {a['hypothesisCount']}개 회귀를 함께 다중검정 보정했다. 사업상 연결 {len(e['byPair'])}개에 각각 2개 이상의 자료를 연결하고 10개 실제 실적·당시 추정·잔액 충격 대입 사례를 구분했다.",'자료 수는 사업구조 확인의 근거 수이며 모든 개별 지표의 독립 민감도나 고정 시차를 입증하지 않는다. 회사별 전체 분기 손익 회귀, 발표시점 기반 매매 백테스트, 독립 표본 외 예측 검증은 수행하지 않았다.','## LX인터내셔널 × Newcastle',table(['기간','동월 부분상관','탐색 최대 시차','부분상관','보정 q','판정'],[[s['years'],(s['contemporaneous'] or {}).get('partialR'),(s['best'] or {}).get('lag'),(s['best'] or {}).get('partialR'),(s['best'] or {}).get('q'),s['status']] for s in a['summary'] if s['indicator']=='coal' and s['stock']=='001120']),'이번 표본에서는 일정 개월 뒤 주가가 반응한다는 안정적 시차를 확인하지 못했다. 실제 광산의 ICI4·중국 판매단가, 물량·채굴비와 다른 사업 손익을 함께 봐야 한다. +시차는 지표 이후 해당 월의 한 달 주가수익률, −시차는 주가 선행이다. 누적수익률이나 고정 매매시점이 아니다.']
for code,name in a['stocks'].items():
 lines.append('## '+name+' ('+code+')')
 for p in e['byPair'].values():
  if p['stock']!=code:continue
  lines.extend(['### '+a['indicators'][p['indicator']]['name'],p['text'],'실적 반영 시점: '+p['lag'],p['status'],' · '.join('['+e['sources'][sid]['title']+']('+e['sources'][sid]['url']+')' for sid in p['sourceIds'])])
  rows=[]
  for s in a['summary']:
   if s['stock']==code and s['indicator']==p['indicator']:
    b=s['best'] or {};z=s['contemporaneous'] or {};rows.append([s['years'],z.get('n'),z.get('partialR'),b.get('lag'),b.get('partialR'),b.get('q'),s['status']])
  lines.append(table(['기간','동월 n','동월 부분상관','탐색 최대 시차','부분상관','q','판정'],rows))
lines.append('## 실적 수치 사례')
for c in e['cases']:
 lines.extend(['### '+c['title'],c['type'],table(c['columns'],c['rows']),c['conclusion'],' · '.join('['+e['sources'][sid]['title']+']('+e['sources'][sid]['url']+')' for sid in c['sourceIds'])])
lines.extend(['## 방법과 한계',a['method']['model'],a['method']['returns'],'\n'.join('- '+s for s in a['method']['limits'])])
(root/'RELATIONSHIP_REVIEW.md').write_text('\n\n'.join(lines),encoding='utf-8')
with (root/'data/relationship-summary.csv').open('w',encoding='utf-8-sig',newline='') as fp:
 w=csv.writer(fp);w.writerow(['indicator','stock','years','mapped','status','n_zero','partialR_zero','exploratory_lag','partialR_best','q'])
 for s in a['summary']:
  b=s['best'] or {};z=s['contemporaneous'] or {};w.writerow([s['indicator'],s['stock'],s['years'],s['mapped'],s['status'],z.get('n'),z.get('partialR'),b.get('lag'),b.get('partialR'),b.get('q')])
print(json.dumps({'verification':'passed','comparisons':len(a['summary']),'tests':a['hypothesisCount'],'evidence_pairs':len(e['byPair']),'cases':len(e['cases'])}))
