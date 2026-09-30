from pathlib import Path
import json
from pypdf import PdfReader
root=Path('data/impact-sources')
for name in ['skgas','kepcoKB','e1','kdhiM']:
    reader=PdfReader(root/(name+'.pdf')); matches=[]
    for i,p in enumerate(reader.pages):
        t=p.extract_text() or ''
        if name=='skgas':
            keys=['변동이자율','민감도','LPG 가격','2024년 12월','금리위험','재고자산평가','울산지피에스','원료비']
        else:keys=['연료비','전력구입','환율','원전','미수금','파생상품','이자율']
        hit=[k for k in keys if k in t]
        if hit:
            k=hit[0];pos=t.index(k);matches.append({'page':i+1,'keyword':k,'text':t[max(0,pos-70):pos+500]})
    (root/(name+'-snippets.json')).write_text(json.dumps(matches,ensure_ascii=False),encoding='utf-8')
    print(json.dumps({'id':name,'pages':len(reader.pages),'matches':matches[:8]},ensure_ascii=False))
