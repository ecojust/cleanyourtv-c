#!/usr/bin/env python3
"""Sign verified CI-built first-party TV apps and place APKs beside their source."""
import argparse,json,os,re,shutil,subprocess,tempfile
from pathlib import Path
from resource_catalog import apk_info,digest
parser=argparse.ArgumentParser()
parser.add_argument('--stage-branch',required=True)
parser.add_argument('--source-sha',required=True)
parser.add_argument('--build-tools',required=True,type=Path)
args=parser.parse_args()
assert re.fullmatch(r'build-assets/resources-\d+',args.stage_branch)
assert re.fullmatch(r'[a-f0-9]{40}',args.source_sha)
root=Path(__file__).resolve().parents[1]
def git(*arguments):return subprocess.check_output(['git','-C',str(root),*arguments])
git('fetch','origin',args.stage_branch)
metadata=json.loads(git('show','FETCH_HEAD:release-staging/release-metadata.json'))['launcher']
assert metadata['sourceSha']==args.source_sha
expected=(root/'tools/puretv-release-certificate.sha256').read_text().strip()
key=os.environ['PURETV_KEYSTORE_PATH'];assert os.environ.get('PURETV_KEYSTORE_PASSWORD')
with tempfile.TemporaryDirectory(prefix='puretv-app-resources-') as temporary:
    temporary=Path(temporary)
    for slug,name,description,cover in [('music','Music TV','原生电视音乐播放器','music-tv.png'),('shortvideo','ShortVideo TV','遥控器短视频播放器','controls-compact.png'),('webtv','WebTV','电视直播与 M3U 播放器','controls-render.png')]:
        folder=root/'resource/apps'/slug
        unsigned=temporary/(slug+'.apk');unsigned.write_bytes(git('show','FETCH_HEAD:release-staging/'+slug+'.apk'))
        identity=apk_info(unsigned,args.build_tools,allow_unsigned=True)
        assert identity['packageName']=='com.ecojust.'+slug and not identity['certificateSha256']
        gradle=git('show',args.source_sha+':resource/apps/'+slug+'/build.gradle').decode()
        assert identity['versionName']==re.search(r"versionName '([^']+)'",gradle)[1]
        assert identity['versionCode']==int(re.search(r'versionCode (\d+)',gradle)[1]) and identity['bytes']<5*1024*1024
        aligned=temporary/(slug+'-aligned.apk')
        subprocess.run([str(args.build_tools/'zipalign'),'-f','4',str(unsigned),str(aligned)],check=True)
        apk=folder/(slug+'-'+identity['versionName']+'.apk')
        subprocess.run([str(args.build_tools/'apksigner'),'sign','--v4-signing-enabled','false','--ks',key,'--ks-key-alias','puretv','--ks-pass','env:PURETV_KEYSTORE_PASSWORD','--key-pass','env:PURETV_KEYSTORE_PASSWORD','--out',str(apk),str(aligned)],check=True)
        info=apk_info(apk,args.build_tools);assert info['certificateSha256']==expected
        shutil.copyfile(root/'LICENSE',folder/'LICENSE')
        preview=folder/'docs'/cover
        if not preview.exists():preview=next((folder/'docs').glob('*.png'))
        shutil.copyfile(preview,folder/'thumb.png')
        resource={'kind':'app','name':name,'author':'ecojust / 桔子桑','description':description,'version':info['versionName'],'packageName':info['packageName'],'versionCode':info['versionCode'],'apk':apk.name,'apkBytes':info['bytes'],'sha256':info['sha256'],'certificateSha256':info['certificateSha256'],'supportsLayoutJson':False,'cover':'thumb.png','coverSource':'Existing Android UI rendering preview; not a physical TV capture','license':'MIT','sourceCommit':args.source_sha,'buildRun':'https://github.com/ecojust/pureTV/actions/runs/'+args.stage_branch.rsplit('-',1)[1]}
        (folder/'resource.json').write_text(json.dumps(resource,ensure_ascii=False,indent=2)+'\n')
        (folder/'SHA256SUMS.txt').write_text(''.join(f'{digest(folder/n)}  {n}\n' for n in [apk.name,'thumb.png']))
        p=folder/'README.md';text=p.read_text();heading,rest=text.split('\n',1)
        p.write_text(heading+'\n\n[下载 APK]('+apk.name+'?raw=1) · [校验值](SHA256SUMS.txt) · [签名及构建来源](resource.json) · [源码](src/)\n\n此目录内 APK 使用 pureTV 发布证书签名。若设备中存在使用旧证书的同包应用，Android 无法直接覆盖安装；需先备份数据并卸载旧包。\n'+rest)
        print(json.dumps({'app':name,'apk':str(apk.relative_to(root)),'bytes':info['bytes'],'verified':True}))
subprocess.run(['python',str(root/'tools/update-resource-index.py')],cwd=root,check=True)
