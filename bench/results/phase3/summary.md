```
task       config ok      cost    tokens    in+cw    out  secs  agents
discounts  p2     Y      0.216    111959    28846   5617    42  coder:1 orchestrator:1
discounts  p3     Y      0.156    105952    16717   5546    40  coder:1 orchestrator:1
logfix     p2     Y      0.199    126187    24934   2726    29  orchestrator:1
logfix     p3     Y      0.089     72052     8314   1733    20  orchestrator:1
noisy      p2     Y      0.080     95549     7817   1163    14  orchestrator:1
noisy      p3     Y      0.082     86969     8408   1243    15  orchestrator:1
rename     p2     Y      0.203    200146    23925   2449    29  orchestrator:1
rename     p3     Y      0.114     93545    11127   2117    35  compressor:1 orchestrator:1
testwrite  p2     Y      0.151    103695    10018   4151    36  orchestrator:1
testwrite  p3     Y      0.150    103253    14484   6341    42  coder:1 orchestrator:1
```
rename was rescored after its check was fixed (both work dirs pass the fixed check).
