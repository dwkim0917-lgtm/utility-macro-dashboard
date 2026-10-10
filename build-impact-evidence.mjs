import fs from 'node:fs/promises';import {catalog,stocks} from './catalog.mjs';
import {applyMacroAudit} from './macro-impacts.mjs';
const ref=(title,url,scope,date)=>({title,url,scope,date});
const sources={
 kepco_kb:ref('KB증권 한국전력 · 2025-03-25','https://rdata.kbsec.com/pdf_data/20250324130757153K.pdf','p.1 원전·SMP·요금, p.2 금리/환율/유가 EPS 민감도, p.5 전력 조달 원가. 당시 전망치와 가정임.','2025-03-25'),
 kepco_hana:ref('하나증권 한국전력 · 4Q24 Review','https://www.hanaw.com/download/research/FileServer/WEB/industry/enterprise/2025/03/03/KEPCO_250304_4Q24Re.pdf','판매단가·원가·정산조정계수 및 환율 효과를 구분.','2025-03-04'),
 kogas_raw:ref('가스공사 · 원료비 연동제','https://www.kogas.or.kr/site/koGas/1040403010000','원료비 산정·요금 조정 주기 및 민수용 미수금.','공식 제도 안내'),
 kogas_return:ref('가스공사 · 공급비용/투자보수','https://www.kogas.or.kr/site/koGas/1040403020000','적정원가+적정투자보수, 요금기저×WACC, 연 1회 공급비용 조정.','공식 제도 안내'),
 kogas_hana:ref('하나증권 한국가스공사 · 1Q25 Review','https://www.hanaw.com/download/research/FileServer/WEB/industry/enterprise/2025/05/13/KOGAS_250514_1Q25Re.pdf','판매량 증가에도 영업이익 감소. 투자보수·미수금 금융비용 보전 감소, 해외사업 변동.','2025-05-14'),
 kdh_im:ref('iM증권 지역난방공사 · 4Q25 Review','https://www.imfnsec.com/upload/R_E08/2026/02/%5B10190749%5D_071320.pdf','전력 판매량·LNG 투입단가·열요금 정산·급전 제약을 분리.','2026-02-11'),
 kdh_hana:ref('하나증권 지역난방공사 · 3Q20 Review','https://www.hanaw.com/download/research/FileServer/WEB/info/daily/2020/11/11/daily_1112_0.pdf','열요금 고정비·연료비 정산 종료 후 실적 변화의 과거 사례. 현재 제도 효과는 최신 자료와 구분.','2020-11-12'),
 sk_annual:ref('SK가스 · 2025 사업보고서','https://skgas.co.kr/uploaded/ir/17737288451251.pdf','PDF p.28 GPS 상업가동, p.32 CP 시황, p.47~48 울산GPS 변동금리 차입 민감도.','2025 결산'),
 sk_hanwh:ref('한화투자증권 SK가스 · 2Q25 Review','https://www.hanwhawm.com/main/research/main/view.cmd?depth3_id=anls1&seq=64494','울산GPS 가동 감소와 LPG 트레이딩 이익의 상쇄 사례.','2025'),
 e1_kis:ref('한국신용평가 E1 · 신용평가','https://kisrating.com/fileDown.do?fileName=rs20240628-1.pdf&gubun=2&menuCd=R8','p.4~5 CP·환율의 판가 전가, 외환/파생손익과 실물 이익의 인식 차이.','2024-06-28'),
 e1_annual:ref('E1 · 경영진단의 과거 실적 사례','https://e1.co.kr/file/download?fileNo=153','2009년 판매량 증가에도 LPG/환율 하락으로 매출 감소. 최신 민감도로 사용하지 않음.','2009 결산'),
 sgc_kis:ref('한국신용평가 SGC에너지','https://m.kisrating.com/fileDown.do?fileName=rs20221220-18.pdf&gubun=2&menuCd=R8','발전·증기·REC 수익원, 연료비 및 사업구조. 2020년 11월 사업 전환.','2022-12-20'),
 sgc_hana:ref('하나증권 SGC에너지 · 2Q25 Review','https://www.hanaw.com/download/research/FileServer/WEB/industry/enterprise/2025/07/30/SGC_250731_2Q25Re.pdf','SMP·REC 판매량·정산이익·우드펠릿 및 배출권 매각 영향을 분리.','2025-07-31'),
 posco_lng:ref('포스코인터내셔널 · LNG 사업','https://www.poscointl.com/lngBusiness','터미널·조달·트레이딩·발전 연결 구조. 개별 계약의 고정 가격식은 미공개.','공식 사업 안내'),
 posco_gas:ref('포스코인터내셔널 · 가스전 사업','https://www.poscointl.com/gasBusiness','미얀마 파이프라인 가스 및 호주 세넥스 생산·판매 구조.','공식 사업 안내'),
 posco_merger:ref('포스코인터내셔널 · 지속가능경영보고서','https://www.poscointl.com/upload/esg/%EA%B8%B0%EC%97%85%EC%8B%9C%EB%AF%BC%C2%B7ESG_05_%EB%B3%B4%EA%B3%A0%EC%84%9C%26%EC%9D%B8%EC%A6%9D%EC%84%9C_%282%29%EA%B8%B0%EC%97%85%EC%8B%9C%EB%AF%BC%EB%B3%B4%EA%B3%A0%EC%84%9C_%E2%91%A0-1%202022_POSCO_INTERNATIONAL_Sustainability_Report_Kor.pdf','2023년 1월 포스코에너지 합병으로 발전사업 연결 범위 변경.','2022 보고서'),
 sam_kis:ref('한국신용평가 삼천리','https://kisrating.com/fileDown.do?fileName=rs20220621-40.pdf&gubun=2&menuCd=R8','난방 계절성, 원가보상 소매요금, 별도 유동성과 연결 발전 차입의 차이.','2022-06-21'),
 sam_filing:ref('삼천리 · KRX 공시','https://kind.krx.co.kr/external/2026/05/21/000795/20260521002042/10002.htm','도시가스 공급비용 조정·요금 규제 및 발전 판매단가/SMP 표.','2026-05-21'),
 seoul_filing:ref('서울도시가스 · 2024 재무제표/영업 개황','https://kind.krx.co.kr/external/2025/03/04/000430/20250304001293/00591.htm','영업손실과 금융수익·기타수익을 분리한 연결 손익계산서.','2025-03-04'),
 seoul_2025:ref('서울도시가스 · 손익구조 변경 공시','https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260204800769','2025년 손익 변동의 공시 원문. 본 검증에서는 원문 본문 추가 확인 필요.','2026-02-04'),
 incheon_filing:ref('인천도시가스 · 2025 사업보고서','https://kind.krx.co.kr/external/2026/03/05/001085/20260305002539/11011.htm','기온·월 판매량, 변동금리 차입/예금 및 민감도. 원화 기능통화·외화노출 설명.','2026-03-05'),
 incheon_prior:ref('인천도시가스 · 2023 사업보고서','https://kind.krx.co.kr/external/2024/03/07/001297/20240307002752/11011.htm','권역 독점 공급과 사업구조의 과거 확인자료.','2024-03-07'),
 lx_business:ref('LX인터내셔널 · 사업 소개','https://www.lxinternational.com/kr/business','석탄 자원개발과 자원 트레이딩을 구분.','공식 사업 안내'),
 lx_hana:ref('하나증권 LX인터내셔널','https://www.hanaw.com/download/research/FileServer/WEB/industry/enterprise/2025/12/22/LX_INT_251223_4Q25Pre.pdf','인니 ICI4·채굴 비용·중국 석탄 지분법 및 물류 이익을 구분.','2025-12-23'),
 kpx:ref('KPX · 전력수급실적','https://new.kpx.or.kr/powerDemandPerform.es?mid=a10404060000','피크와 예비율의 운영지표 정의. 기업별 이익 민감도를 직접 제시하지는 않음.','공식 통계')
};
const companySources={'015760':['kepco_kb','kepco_hana'],'036460':['kogas_raw','kogas_return','kogas_hana'],'071320':['kdh_im','kdh_hana'],'018670':['sk_annual','sk_hanwh'],'017940':['e1_kis','e1_annual'],'005090':['sgc_kis','sgc_hana'],'047050':['posco_lng','posco_gas'],'004690':['sam_kis','sam_filing'],'017390':['seoul_filing'],'034590':['incheon_filing','incheon_prior'],'001120':['lx_business','lx_hana']};
sources.sk_hanwh.url='https://www.hanwhawm.com/main/common/common_file/fileView.cmd?bldid=bbs10031&category=2&depth3_id=anls1&key1=64494&key2=1';sources.sk_hanwh.date='2025-08-05';
sources.seoul_2025=ref('서울도시가스 · 2025 사업보고서','https://kind.krx.co.kr/external/2026/03/18/000729/20260318003651/11011.htm','연결 변동금리 차입금 5,565,900천원 및 금리 1%p 민감도. 예금 재투자 수익 효과와 별개인 차입 노출.','2026-03-18');
companySources['017390']=['seoul_filing','seoul_2025'];
const byPair={};const markets=new Set(['kr3y','credit','us10y']);const fuel=new Set(['fei','jkm_fei','hh_ng1','jkm_hh','wti_cl1','brent_b1','wti','brent','dubai','jkm','jkm_futures','ttf','hh']);const operating=new Set(['peak','reserve','consumption','nuclear','gas_sales']);
for(const c of catalog){for(const e of c.effects){for(const code of e.codes){const key=c.id+':'+code;if(byPair[key])continue;let text=e.text,lag='계약·인도·검침 또는 결산 시점별. 기업 공통의 고정 개월 수는 확인되지 않음.',refs=companySources[code]||[],status='사업구조 근거 2개 · 개별 민감도는 조건부',notes=[];
if(code==='015760'){
 if(['smp_daily','smp_mtd','coal','wti_cl1','brent_b1','wti','brent','dubai','jkm','jkm_futures','ttf','hh','purchase','smp','usdkrw'].includes(c.id))text='연료·외부 전력의 조달비 상승은 이익에 부담. 전기 판매단가, 원전 발전량, 환율과 정산조정계수를 함께 비교해야 한다. SMP는 최종 구입단가와 다르다.';
 if(c.id==='tariff')text='판매단가 상승은 단위 매출 증가 요인. 판매량·용도별 믹스와 원가를 함께 확인하며, 판매단가−구입단가를 연결 영업이익률로 해석하지 않는다.';
 if(c.id==='nuclear')text='원전 발전 비중 확대는 고비용 연료·외부 구입전력을 대체할 수 있다. 연간 이용률만으로 월별 실적과 주가 반응 시점은 추정할 수 없다.';
 if(markets.has(c.id)){text='차환·변동금리 이자비용과 할인율 경로가 있다. KB증권의 당시 모형에는 금리 1%p 상승 시 EPS 민감도가 제시되지만 현재 실적·주가 민감도로 그대로 적용할 수 없다.';notes.push('KB증권 p.2: 2025E EPS −26.3%, 2026E −10.4%. 당시 추정 모형의 시나리오이며 실측 계수가 아님.');}
}
if(code==='036460'){
 text='국내 도매사업은 원료비 회수와 적정투자보수 구조. 판매가격·판매량 증가가 같은 비율의 이익 증가를 뜻하지 않는다. 요금 유보 시 미수금·차입이 늘 수 있으며 해외 자원사업 손익은 별도다.';
 lag='원료비: 발전용 매월·민수용 홀수월 산정, 유보 가능. 공급비용: 연 1회. 미수금 회수 시점은 요금 정책에 의존.';
 if(markets.has(c.id)){text='금리 상승은 이자 부담을 키우지만 투자보수율 산정에도 영향을 준다. 금리 하락 시 투자보수·미수금 금융비용 보전액이 줄 수 있어 영업이익과 순이익·현금흐름의 방향이 다를 수 있다.';refs=['kogas_return','kogas_hana'];lag='투자보수/공급비용은 연간 조정, 차입은 금리 재설정·차환 시점별.';}
}
if(code==='071320'){
 text='전력은 SMP와 자체 LNG 투입원가·가동량의 차이를, 열은 판매량과 열요금 정산을 확인한다. SMP 하락에도 연료비 하락·물량 증가로 전력 이익이 개선될 수 있다.';
 lag='전력 판매는 해당 기간, 열요금은 공고된 정산 기간. 전국 피크와 회사 가동률은 일대일 대응하지 않음.';
 if(c.id==='temperature')text='겨울 난방수요는 기온과 연결되지만 열요금·연료비·정산이 이익을 함께 결정한다. 연중 기온 하나의 직선관계로 난방·냉방 효과를 합치면 상쇄될 수 있다.';
}
if(code==='018670'){
 text='LPG 트레이딩은 매입·판매 계약과 파생손익의 인식 차이가 중요하다. 울산GPS는 SMP−실제 LNG/LPG 발전원가와 가동률을 봐야 하며, 원자재 가격 상승 자체를 순이익 증가로 볼 수 없다.';
 lag='실물 인도·파생 평가·발전 매출 시점별. 울산GPS 상업가동은 2024년 12월부터로 10년 표본 전체가 동일한 사업구조는 아님.';
}
if(code==='017940'){text='CP·환율 변동을 판매가격에 반영하되 실물거래와 외환·파생손익의 인식 시점이 다르다. 영업이익만 보지 말고 외환·파생손익을 포함한 조정 손익을 함께 확인한다.';lag='판매가격 조정과 실물 인도·파생 평가 시점별. 회사 공통의 0~2개월 고정 시차는 확인되지 않음.';}
if(code==='005090'){text=['rec','rec_monthly'].includes(c.id)?'REC는 현물가격뿐 아니라 발급량·가중치·판매량·계약 기준가격 정산이 중요하다. 2024년 2분기 일회성 정산이익은 다음 해 기저효과로 작용했다.':c.id==='kau'?'배출권은 부족분 구매 시 비용, 잉여분 매각 시 이익 요인이다. SGC는 2025년 2분기 배출권 매각의 원가 개선 효과가 확인돼 항상 비용 방향으로 분류할 수 없다.':'SMP·증기 판매단가와 유연탄·우드펠릿 원가의 차이, REC 판매 및 건설사업 손익을 함께 확인한다. Newcastle만으로 전체 발전 원가를 대표하기 어렵다.';lag='전력·증기는 판매 기간, REC/배출권은 매각·정산 기간. 석탄 가격 전달의 고정 개월 수는 미확인.';}
if(code==='047050'){text='가스전 생산·판매, LNG 조달·트레이딩, 터미널과 발전이 공존한다. 가스가격 상승은 판매 측과 연료 구매 측에 반대 효과를 낼 수 있어 계약·사업별 순노출이 필요하다.';lag='판매·조달 계약과 인도 시점별. 2023년 1월 합병 전후 발전사업 범위 변화에 유의.';notes.push('두 회사 사업자료는 동일 발행기관의 자료다. 사업 연결 구조를 확인하며 지표별 독립 민감도 검증을 뜻하지 않음.');}
if(['004690','017390','034590'].includes(code)){
 text=c.id==='temperature'?'난방용 판매량은 동절기 기온에 민감하나 산업용 비중·권역·공급비용 정산에 따라 이익 영향이 다르다. 서울 기온은 실제 공급권역 전체를 대표하지 않는다.':'금리는 예금 이자수익과 변동금리 차입 비용에 반대 방향으로 작용한다. 별도·연결 및 예금·차입 만기를 구분해야 하며 국고채 3년·미국 10년이 실제 계약금리와 같지는 않다.';
 lag=c.id==='temperature'?'검침·판매 해당 월, 공급비용 및 정산은 별도 주기. 주가의 고정 시차는 미확인.':'금리 재설정·예금 만기·차환 시점별. 즉시 전액 반영을 가정하지 않음.';
 if(code==='017390'){status='근거 1개 · 추가 검증 필요';notes.push('금융수익은 이자수익 이외 항목도 포함하므로 금융수익 전부를 금리 민감 이익으로 계산하지 않음.');}
}
if(code==='001120'){text='보유 광산의 실현 판매단가 상승은 자원 이익에 긍정적일 수 있다. 인니 ICI4·중국 내수 석탄 가격과 채굴비·판매량을 우선 대조하고, Newcastle 선물을 실제 판가와 동일시하지 않는다. 트레이딩·물류 및 중국 지분법 손익은 별도다.';lag='계약 가격 확정·인도 및 결산 시점별. 고정 월수는 미확인.';}
if(operating.has(c.id)&&c.id!=='nuclear'&&c.id!=='gas_sales'){status='운영지표 간접 경로 · 기업별 민감도 미확인';notes.push('전국 수요·예비율을 해당 회사의 판매량 또는 가동률로 대체하지 않는다.');}
if(['jkm_futures','ttf','hh'].includes(c.id)){status='대용지표/계약 경로 · 직접 민감도 미확인';notes.push('선물·해외 허브 가격은 실제 조달·판매 계약가격과 다르다.');}
if(c.id==='us10y'||c.id==='credit'){status='조달·할인율 간접 경로 · 고유 민감도 미확인';notes.push('국내 실제 차입금리·신용스프레드와 직접 연결된 기업별 수치는 미확인.');}
if(operating.has(c.id)&&!(code==='015760'&&c.id==='nuclear')&&!(code==='036460'&&c.id==='gas_sales')){text=e.text+' 회사별 실제 물량·가동률과 함께 대조해야 한다.';lag='관측 월의 운영 상황을 나타내는 보조지표. 기업별 실적·주가의 고정 월수 미확인.';}
if(c.id==='usdkrw'){text=e.text+' 외화 순노출·계약별 헤지 수치를 확보하기 전에는 환율 변화율을 이익 변화율로 대입하지 않는다.';lag='매입·결제·재고 투입·외화 평가와 헤지 인식 시점별.';}
if(markets.has(c.id)&&code==='071320'){text=e.text+' 두 실적 자료는 사업구조의 확인 근거이며, 이 회사의 금리 1%p당 이익 민감도를 직접 검증한 자료는 아니다.';lag='차입 금리 재설정·차환 시점별. 고정 개월 수 미확인.';status='일반 금융 경로 · 기업별 민감도 추가 검증 필요';}
if(c.id==='kau'&&code!=='005090'){text=e.text;status='배출권 제도상 경로 · 기업별 순노출 추가 검증 필요';lag='배출권 구매·매각·충당부채 인식 시점별.';}
if(code==='017390'){status=markets.has(c.id)?'공시 2개 · 차입 민감도 확인 · 순이익 전체 효과는 조건부':'공시 2개 · 사업구조 확인 · 개별 기온 민감도 미확인';notes.push('같은 회사의 서로 다른 결산 공시로 독립된 두 기관의 추정은 아님.');}
if(refs.length<2){status='자료 1개 · 실적 수치표 별도 제시 · 해당 지표 민감도 미검증';}
byPair[key]={indicator:c.id,stock:code,text,lag,status,sourceIds:refs,notes};
}}}
const cases=[
 {title:'서울도시가스 · 2025 연결 차입 금리 노출',sourceIds:['seoul_2025'],type:'공시 잔액에 충격 대입',columns:['항목','값'],rows:[['변동금리 차입금','55.659억원'],['금리 +1%p 시 이자비용','55.659 × 1% = +0.55659억원']],conclusion:'차입 잔액이 유지되고 1년간 동일하게 재설정되는 단순 대입. 예금 만기 후 재투자 효과를 더하지 않은 차입 측 노출이며 순이익 전체 민감도는 아니다.'},
 {title:'한국전력 · 금리/환율/유가 시나리오',sourceIds:['kepco_kb'],type:'증권사 당시 추정 · 실측 아님',columns:['충격','2025E EPS 변화','2026E EPS 변화'],rows:[['금리 +1%p','−26.3%','−10.4%'],['환율 +1%','−4.4%','−1.8%'],['유가 +1%','−1.8%','−0.7%']],conclusion:'이익 분모와 차입·연료 노출에 민감한 당시 모형값. 주가 변화율이나 현재 민감도가 아니다.'},
 {title:'한국가스공사 · 1Q25',sourceIds:['kogas_hana','kogas_return'],type:'공표 실적 사례',columns:['항목','전년 대비'],rows:[['도시가스용 판매량','+4.7%'],['발전용 판매량','+3.0%'],['매출액','−0.6%'],['영업이익','−9.5% (8,339억원)']],conclusion:'물량 증가와 이익 증가가 다르다. 투자보수·금융비용 보전·해외사업을 분리해야 한다.'},
 {title:'지역난방공사 · 4Q25',sourceIds:['kdh_im'],type:'공표 실적 사례',columns:['항목','관측 내용'],rows:[['전력 영업이익','682억원 / 전분기 대비 +29%'],['SMP','하락'],['LNG 투입단가','하락'],['전력판매량','증가']],conclusion:'판매가격 하나보다 판가−연료비·물량이 중요하다. SMP 하락만으로 감익을 단정할 수 없다.'},
 {title:'울산GPS · 공시 금리 민감도',sourceIds:['sk_annual'],type:'실제 공시 잔액에 충격 대입',columns:['항목','값'],rows:[['변동금리 차입금','3,670억원'],['가정','다른 변수 일정, 금리 +1%p'],['계산','3,670억원 × 1% = 36.7억원'],['공시 세전이익 영향','−36.7억원']],conclusion:'SK가스 전체가 아닌 울산GPS의 공시 노출. 국고채 3년 상승률을 계약금리 변화와 동일시하지 않음. PDF p.47~48.'},
 {title:'E1 · 1Q23 대 1Q24',sourceIds:['e1_kis'],type:'공표 손익에 파생손익 합산',columns:['항목 (억원)','1Q23','1Q24'],rows:[['영업이익','676','987'],['외환·파생상품 손익','650','−664'],['수정영업이익','1,326','323']],conclusion:'영업이익은 늘어도 파생손익을 합친 수정 이익은 감소했다. CP·환율 분석은 인식 시차까지 포함해야 한다.'},
 {title:'SGC에너지 · 2Q25',sourceIds:['sgc_hana','sgc_kis'],type:'공표 실적 사례',columns:['항목','관측 내용'],rows:[['SMP','122.7원/kWh / 전년 대비 −2.7%'],['연결 영업이익','340억원 / 전년 대비 −50.0%'],['전년 2Q REC 일회성 정산이익','320억원']],conclusion:'SMP의 작은 변화와 전체 감익을 일대일로 연결하면 REC 정산 기저효과를 놓친다.'},
 {title:'서울도시가스 · 2024 연결 손익',sourceIds:['seoul_filing'],type:'공시 손익 항목 분리',columns:['항목','억원 (반올림)'],rows:[['영업손익','−102.85'],['금융수익','258.32'],['금융비용','34.36'],['순이익','343.22']],conclusion:'금융수익·기타손익을 구분해야 한다. 이 표만으로 금리 변화당 민감도나 주가 시차는 추정할 수 없다.'},
 {title:'삼천리 · 발전 판가와 SMP',sourceIds:['sam_filing','sam_kis'],type:'공시 운영표',columns:['원/kWh','2024','2025','2026 1Q'],rows:[['발전 판매가격','156.3','141.0','124.7'],['SMP','125.4','110.8','105.7']],conclusion:'실제 발전 판매가격과 SMP에 차이가 있다. SMP의 수준을 그대로 기업 매출에 곱하지 않는다.'},
 {title:'인천도시가스 · 2025 변동금리 노출',sourceIds:['incheon_filing'],type:'실제 공시 잔액에 충격 대입',columns:['항목','억원'],rows:[['변동금리 현금성자산','266.37325'],['변동금리 차입금','54.90050'],['금리 +1%p 가정 시 순이자 영향','(266.37325−54.90050)×1% = +2.1147275']],conclusion:'잔액이 1년 유지되고 동일하게 1%p 재설정된다는 단순 시나리오. 기업 전체 순이익·주가 변화 예측은 아니다.'}
];
sources.krx_ets=ref('한국거래소 · 배출권 거래정보','https://ets.krx.co.kr/contents/ETS/03/03010000/ETS03010000.jsp','이행연도별 KAU 종가·거래량. 기업별 무상할당·순부족량과 별개.','2026-09-18');
sources.kpx_rec=ref('전력거래소 · REC 현물시장','https://www.kpx.or.kr/recToday.es?mid=a30401000000&device=mbl','거래일 평균가·종가·거래량 구분. 기업별 장기계약 단가와 별개.','2026-09-18');
for(const p of Object.values(byPair)){if(p.indicator==='kau')p.sourceIds.push('krx_ets');if(['rec','rec_monthly'].includes(p.indicator))p.sourceIds.push('kpx_rec');}
const macro=applyMacroAudit(sources,byPair);
await fs.writeFile('data/impact-evidence.json',JSON.stringify({checkedAt:new Date().toISOString(),sources,byPair,cases,macro,policy:'근거 수는 사업구조의 자료 수다. 고정 실적 시차·주가 인과효과를 검증했다는 뜻이 아니며, 일반 가정·대용지표는 명시한다.'},null,2));console.log({pairs:Object.keys(byPair).length,sources:Object.keys(sources).length,cases:cases.length});
