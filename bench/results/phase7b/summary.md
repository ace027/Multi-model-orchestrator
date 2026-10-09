```
task       config ok      cost    tokens    in+cw    out  secs  agents
discounts  opus   Y      0.165    103741    11603   4483    40  
discounts  triad  Y      0.222    115698    31472   5628    53  coder:1 orchestrator:1
logfix     opus   Y      0.090     95208     8066   1631    18  
logfix     triad  Y      0.193    215310    29308   8417    72  coder:1 helper:1 orchestrator:1
noisy      opus   Y      0.074     93555     7680    921    14  
noisy      triad  Y      0.118     78127    16802   1074    20  orchestrator:1
rename     opus   Y      0.216    178280    26194   2760    32  
rename     triad  Y      0.158    142576    16443   2557    40  compressor:1 orchestrator:1
testwrite  opus   Y      0.138     79099     9624   3859    33  
testwrite  triad  Y      0.150    110150    16058   5297    46  coder:1 orchestrator:1
```
