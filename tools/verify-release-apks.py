#!/usr/bin/env python3
"""Record exact Android package IDs, versions, signing certificates and SHA256."""
import hashlib,json,os,re,subprocess,urllib.request,sys,traceback
from pathlib import Path
def report_error(kind,value,tb):
 message=''.join(traceback.format_exception(kind,value,tb))
 print('::error::'+message.replace('%','%25').replace('\r','%0D').replace('\n','%0A'),flush=True)
 sys.__excepthook__(kind,value,tb)
sys.excepthook=report_error
print('Release signing configured:',bool(os.environ.get('ANDROID_KEYSTORE_PATH')),flush=True)
root=Path(__file__).resolve().parents[1]
tools=Path(os.environ['ANDROID_HOME'])/'build-tools/34.0.0'
def inspect(path):
 badging=subprocess.check_output([str(tools/'aapt'),'dump','badging',str(path)],text=True)
 package=re.search(r"package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'",badging)
 assert package, f'Cannot read package metadata: {path}'
 signing=subprocess.check_output([str(tools/'apksigner'),'verify','--print-certs',str(path)],text=True)
 certificate=re.search(r'Signer #1 certificate SHA-256 digest: (\S+)',signing)
 assert certificate,f'APK is not signed: {path}'
 return {'packageName':package[1],'versionCode':int(package[2]),'versionName':package[3],'certificateSha256':certificate[1].lower(),'bytes':path.stat().st_size,'sha256':hashlib.file_digest(path.open('rb'),'sha256').hexdigest()}
# The same release key must remain in use. Package rename does not rotate signing identity.
old=Path(os.environ['RUNNER_TEMP'])/'puretv-previous.apk'
with urllib.request.urlopen('https://github.com/ecojust/pureTV/releases/download/v0.1.5/pureTV-0.1.5.apk',timeout=30) as response:old.write_bytes(response.read())
previous=inspect(old)
entries=[('launcher',root/'launcher/app','com.ecojust.puretv','pureTV'),('music',root/'apps/music','com.ecojust.music','music-tv'),('shortvideo',root/'apps/shortvideo','com.ecojust.shortvideo','shortvideo-tv'),('webtv',root/'apps/webtv','com.ecojust.webtv','webtv')]
metadata={}
for name,directory,expected,prefix in entries:
 matches=list((directory/'build/outputs/apk/release').glob('*.apk'));assert len(matches)==1,matches
 info=inspect(matches[0]);assert info['packageName']==expected,info
 assert info['certificateSha256']==previous['certificateSha256'],f'Signing certificate changed: {name}'
 assert info['bytes']<=5*1024*1024,f'APK exceeds 5 MiB: {name}'
 if name=='launcher':
  gradle=(root/'launcher/app/build.gradle').read_text()
  expected_version=re.search(r"versionName '([^']+)'",gradle)[1]
  expected_code=int(re.search(r'versionCode (\d+)',gradle)[1])
  assert info['versionName']==expected_version and info['versionCode']==expected_code,info
 info['releaseName']=f"{prefix}-{info['versionName']}.apk";metadata[name]=info
 print(json.dumps({name:info},ensure_ascii=False))
(root/'launcher/release-metadata.json').write_text(json.dumps(metadata,indent=2)+'\n')
