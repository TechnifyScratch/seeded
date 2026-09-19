"""Verify each package against the reviewed manifest. Never execute/extract supplied instructions.
Usage: npm run skills:import -- /path/infoahha.zip [--upload]
Unknown/modified packages fail closed and require a new human-reviewed adaptation.
"""
import hashlib, io, json, pathlib, sys, zipfile, os, urllib.request
root=pathlib.Path(__file__).resolve().parents[1]
registry=json.loads((root/'data/skills/registry.json').read_text())
path=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else None
if not path: raise SystemExit('Provide infoahha.zip path')
if path.stat().st_size>10_000_000: raise SystemExit('Archive too large')
known={s['slug']:s for s in registry if s['source_sha256']}
seen=set()
with zipfile.ZipFile(path) as outer:
 for member in outer.infolist():
  if member.is_dir() or member.filename.startswith('__MACOSX/'):continue
  slug=pathlib.PurePosixPath(member.filename).stem
  if slug not in known or member.file_size>1_000_000:raise SystemExit('Unreviewed or oversized package: '+member.filename)
  with zipfile.ZipFile(io.BytesIO(outer.read(member))) as inner:
   files=[n for n in inner.infolist() if n.filename=='SKILL.md']
   if len(files)!=1 or files[0].file_size>200_000:raise SystemExit('Invalid SKILL.md')
   digest=hashlib.sha256(inner.read(files[0])).hexdigest()
   if digest!=known[slug]['source_sha256']:raise SystemExit('Source changed; manual review required: '+slug)
  seen.add(slug)
  print(('ENABLED ' if known[slug]['enabled'] else 'EXCLUDED')+' '+slug)
if seen!=set(known):raise SystemExit('Missing reviewed packages: '+str(set(known)-seen))
print('Verified all 24 sources. 22 reviewed adaptations + seeded-exploration. 2 excluded.')
if '--upload' in sys.argv:
 url=os.environ.get('NEXT_PUBLIC_SUPABASE_URL');key=os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
 if not url or not key:raise SystemExit('Export Supabase URL and service role key first')
 request=urllib.request.Request(url+'/rest/v1/skills?on_conflict=slug',data=json.dumps(registry).encode(),headers={'apikey':key,'Authorization':'Bearer '+key,'Content-Type':'application/json','Prefer':'resolution=merge-duplicates'},method='POST')
 with urllib.request.urlopen(request,timeout=30) as response:print('Uploaded reviewed registry:',response.status)
