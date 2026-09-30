import unittest
import numpy as np
import pandas as pd
from analysis_stats import t_pvalue,t_critical,fdr_bh,hac
class Statistics(unittest.TestCase):
 def test_student_reference(self):
  self.assertAlmostEqual(t_critical(10),2.2281388519649385,places=9)
  self.assertAlmostEqual(t_critical(30),2.0422724563012373,places=9)
  self.assertAlmostEqual(t_pvalue(1,1),.5,places=12)
  self.assertEqual(t_pvalue(0,50),1)
 def test_fdr(self):
  np.testing.assert_allclose(fdr_bh([.01,.04,.03,.002]),[.02,.04,.04,.008])
 def test_hac_ols_and_market_control(self):
  rng=np.random.default_rng(9);market=rng.normal(size=240);x=rng.normal(size=240)+market;y=2*x+3*market+rng.normal(size=240)
  fit=hac(y,x,market);expected=np.linalg.lstsq(np.column_stack([np.ones(240),x,market]),y,rcond=None)[0][1]
  self.assertAlmostEqual(fit['beta'],expected,places=10)
  self.assertLess(fit['ciLow'],2);self.assertGreater(fit['ciHigh'],2)
  self.assertLess(fit['p'],.001)
 def test_calendar_hac_gaps(self):
  rng=np.random.default_rng(12);x=rng.normal(size=40);m=rng.normal(size=40);y=.4*x+rng.normal(size=40)
  # All observations more than 6 calendar months apart: no off-diagonal HAC terms.
  gap=hac(y,x,m,maxlags=6,positions=np.arange(40)*7)
  white=hac(y,x,m,maxlags=0)
  self.assertAlmostEqual(gap['ciLow'],white['ciLow'],places=12)
  self.assertAlmostEqual(gap['ciHigh'],white['ciHigh'],places=12)
 def test_calendar_lag_missing_no_forward_fill(self):
  rng=np.random.default_rng(4);idx=pd.period_range('2000-01',periods=120,freq='M');x=pd.Series(rng.normal(size=120),index=idx);y=x.shift(3);x.iloc[40]=np.nan
  scores={l:abs(x.shift(l).corr(y)) for l in range(-6,13)}
  self.assertEqual(max(scores,key=scores.get),3)
  self.assertTrue(np.isnan(x.shift(3).iloc[43]))
if __name__=='__main__':unittest.main()
