#!/usr/bin/env python3
"""Record exact Android package IDs, versions, signing certificates and SHA256."""
import hashlib,json,os,re,subprocess,sys,traceback
from pathlib import Path
def report_error(kind,value,tb):
 message=''.join(traceback.format_exception(kind,value,tb))
 print('::error::'+message.replace('%','%25').replace('\r','%0D').replace('\n','%0A'),flush=True)
 sys.__excepthook__(kind,value,tb)
sys.excepthook=report_error
root=Path(__file__).resolve().parents[1]
tools=Path(os.environ['ANDROID_HOME'])/'build-tools/34.0.0'
paths=list((root/'launcher/app/build/outputs/apk/release').glob('*.apk'))
assert len(paths)==1,paths
path=paths[0]
badging=subprocess.check_output([str(tools/'aapt'),'dump','badging',str(path)],text=True)
package=re.search(r"package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'",badging)
assert package and package[1]=='com.ecojust.puretv',badging
signing=subprocess.run([str(tools/'apksigner'),'verify','--print-certs',str(path)],capture_output=True,text=True)
certificate=re.search(r'Signer #1 certificate SHA-256 digest: (\S+)',signing.stdout)
key_path=os.environ.get('PURETV_KEYSTORE_PATH')
if key_path:
 expected=subprocess.check_output(['keytool','-exportcert','-alias','puretv','-keystore',key_path,'-storepass:env','PURETV_KEYSTORE_PASSWORD'])
 assert signing.returncode==0 and certificate and certificate[1].lower()==hashlib.sha256(expected).hexdigest()
else:
 assert signing.returncode!=0 and certificate is None,'Unexpected signing certificate'
gradle=(root/'launcher/app/build.gradle').read_text()
assert package[3]==re.search(r"versionName '([^']+)'",gradle)[1]
assert int(package[2])==int(re.search(r'versionCode (\d+)',gradle)[1])
assert path.stat().st_size<=5*1024*1024
info={'packageName':package[1],'versionCode':int(package[2]),'versionName':package[3],'certificateSha256':certificate[1].lower() if certificate else None,'requiresSigning':not bool(certificate),'sourceSha':os.environ.get('GITHUB_SHA'),'bytes':path.stat().st_size,'sha256':hashlib.file_digest(path.open('rb'),'sha256').hexdigest(),'releaseName':f'pureTV-{package[3]}.apk'}
(root/'launcher/release-metadata.json').write_text(json.dumps({'launcher':info},indent=2)+'\n')
print(json.dumps(info))
