import os, sys, json, random, time, urllib.request, datetime
K=os.environ["ORCHESTRATOR_API_KEY"]; M="claude-haiku-5-5"
def post(path, body):
    r=urllib.request.Request("https://api.anthropic.com/v1/"+path, json.dumps(body).encode(),
      {"x-api-key":K,"anthropic-version":"2023-06-01","content-type":"application/json"})
    for i in range(5):
        try: return json.load(urllib.request.urlopen(r, timeout=120))
        except Exception as e:
            err=getattr(e,'read',lambda:b'')(); print("retry",e,err[:200],file=sys.stderr); time.sleep(15*(i+1))
    raise SystemExit("failed")
words=[l.strip() for l in open("/usr/share/dict/words")] if os.path.exists("/usr/share/dict/words") else None
def gen(n, seed):
    rnd=random.Random(seed)
    if words: return " ".join(rnd.choice(words) for _ in range(n))
    return " ".join("".join(rnd.choice("abcdefghijklmnopqrstuvwxyz") for _ in range(rnd.randint(3,9))) for _ in range(n))
def count(text):
    return post("messages/count_tokens",{"model":M,"messages":[{"role":"user","content":text}]})["input_tokens"]
def sized(target, seed):
    n=int(target/1.3); t=gen(n,seed); c=count(t)
    n=int(n*target/c); t=gen(n,seed); c=count(t)
    return t,c
def req(prefix, fresh, cache):
    blk=[{"type":"text","text":prefix}]
    if cache: blk[0]["cache_control"]={"type":"ephemeral"}
    blk.append({"type":"text","text":fresh})
    r=post("messages",{"model":M,"max_tokens":1,"messages":[{"role":"user","content":blk}]})
    return r["usage"]
def run(name, n, ptoks, ftoks, cache, unique):
    start=datetime.datetime.utcnow().isoformat()
    p=gen(int(ptoks*RATIO),1) if ptoks else ""
    out=[]
    for i in range(n):
        if unique and i: p=gen(int(ptoks*RATIO),1000+i)
        f=gen(int(ftoks*RATIO),5000+i) if ftoks else ""
        u=req(f,"go",cache) if not ptoks else req(p,f,cache)
        out.append(u); time.sleep(SLEEP)
    end=datetime.datetime.utcnow().isoformat()
    json.dump({"run":name,"start":start,"end":end,"usage":out},open(f"run_{name}.json","w"))
    print(name,start,end,out[0],out[-1],flush=True)
which=sys.argv[1]
_t,_c=sized(10000,1); RATIO=len(_t.split())/_c; print("words/token",RATIO)
SLEEP=float(sys.argv[2]) if len(sys.argv)>2 else 0
if which=="probe":
    t,c=sized(10000,1); print(c)
elif which=="B": run("B",100,40000,10000,True,False)
elif which=="A": run("A",100,95000,10000,True,False)
elif which=="C": run("C",10,0,110000,False,False)
elif which=="D": run("D",20,95000,10000,True,True)
